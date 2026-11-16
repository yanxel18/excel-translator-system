const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Active upload cancellation timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyActiveCancellation({ page, runtime, owner, token, bytes }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "active-cancel.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const sessionId = await withinTimeout(page.evaluate(async ({ ownerId, token, clientUploadId }) => {
    const { saveRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
    const { reconcileRetainedUpload } = await import("/src/features/workspace/upload-reconciliation.ts");
    await saveRetainedUpload({
      ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
    });
    const result = await reconcileRetainedUpload(ownerId, token);
    return result.record.serverSessionId;
  }, { ownerId: owner.id, token, clientUploadId }));
  assert.ok(sessionId);

  let chunkCommitted;
  let releaseChunk;
  let deletionReached;
  let releaseDeletion;
  const committed = new Promise((resolve) => { chunkCommitted = resolve; });
  const chunkGate = new Promise((resolve) => { releaseChunk = resolve; });
  const deletion = new Promise((resolve) => { deletionReached = resolve; });
  const deletionGate = new Promise((resolve) => { releaseDeletion = resolve; });
  const requests = [];
  let chunkStatus;
  let settled;
  const handler = async (route) => {
    const request = route.request();
    requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (request.method() === "PUT") {
      const response = await route.fetch();
      chunkStatus = response.status();
      chunkCommitted();
      await chunkGate;
      await route.fulfill({ response });
    } else if (request.method() === "DELETE") {
      deletionReached();
      await deletionGate;
      await route.continue();
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/upload-sessions/**", handler);
  try {
    await page.evaluate(async ({ ownerId, token }) => {
      const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
      const controller = new AbortController();
      const active = transferRetainedUpload(ownerId, token, controller.signal);
      const outcome = active.then(() => "fulfilled", (error) => error.name);
      Object.assign(window, { activeUpload: { controller, active, outcome } });
    }, { ownerId: owner.id, token });
    await withinTimeout(committed);
    assert.equal(chunkStatus, 200);
    const committedReceipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(committedReceipt.bytesReceived, 1024 * 1024);
    const before = await page.evaluate(async ({ ownerId }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const saved = await loadRetainedUpload(ownerId);
      return { paused: saved.paused, confirmedBytes: saved.confirmedBytes };
    }, { ownerId: owner.id });
    assert.deepEqual(before, { paused: false, confirmedBytes: 0 });

    const cancellation = page.evaluate(async ({ ownerId, token, clientUploadId }) => {
      const { cancelActiveRetainedUpload } = await import("/src/features/workspace/upload-cancellation.ts");
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const { controller, active, outcome } = window.activeUpload;
      const result = await cancelActiveRetainedUpload(ownerId, token, clientUploadId, controller, active);
      let missing;
      try { await loadRetainedUpload(ownerId); } catch (error) { missing = error.code; }
      return { state: result.state, activeOutcome: await outcome, missing };
    }, { ownerId: owner.id, token, clientUploadId });
    settled = cancellation.then((value) => ({ value }), (error) => ({ error }));
    await withinTimeout(Promise.race([
      deletion,
      settled.then(({ error }) => { throw error || new Error("Cancellation finished before DELETE was observed."); }),
    ]));
    const during = await page.evaluate(async ({ ownerId }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const saved = await loadRetainedUpload(ownerId);
      const hash = await crypto.subtle.digest("SHA-256", await saved.file.arrayBuffer());
      return {
        paused: saved.paused, confirmedBytes: saved.confirmedBytes, clientUploadId: saved.clientUploadId,
        hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }, { ownerId: owner.id });
    assert.deepEqual(during, {
      paused: true, confirmedBytes: 1024 * 1024, clientUploadId,
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
    const put = requests.findIndex((request) => request === `PUT /api/upload-sessions/${sessionId}/chunks/0`);
    const deleteIndex = requests.findIndex((request) => request === `DELETE /api/upload-sessions/${sessionId}`);
    assert.ok(put >= 0 && deleteIndex > put);
    assert.ok(requests.slice(put + 1, deleteIndex).includes(`GET /api/upload-sessions/${sessionId}`));

    releaseChunk();
    releaseDeletion();
    const result = await withinTimeout(settled);
    if (result.error) throw result.error;
    assert.deepEqual(result.value, { state: "cancelled", activeOutcome: "AbortError", missing: "UPLOAD_NOT_FOUND" });
    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(receipt.status, "CANCELLED");
    assert.equal(receipt.reservedBytes, 0);
    await assert.rejects(fs.stat(path.join(process.env.DATA_DIR, "upload-sessions", sessionId)), { code: "ENOENT" });
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 0);
  } finally {
    releaseChunk();
    releaseDeletion();
    if (settled) await withinTimeout(settled);
    await page.unrouteAll({ behavior: "wait" });
  }
};
