const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Cross-tab cancellation timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyCrossTabCancellation({ page, runtime, owner, token, bytes }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "cross-tab-cancel.xlsx",
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

  const cancellingPage = await page.context().newPage();
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
  await cancellingPage.goto(page.url());
  await page.route("**/api/upload-sessions/**", handler);
  await cancellingPage.route("**/api/upload-sessions/**", handler);
  try {
    await page.evaluate(async ({ ownerId, token }) => {
      const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
      const active = transferRetainedUpload(ownerId, token);
      const outcome = active.then(() => "fulfilled", (error) => error.name);
      Object.assign(window, { activeUploadOutcome: outcome });
    }, { ownerId: owner.id, token });
    await withinTimeout(committed);
    assert.equal(chunkStatus, 200);
    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(receipt.bytesReceived, 1024 * 1024);

    const cancellation = cancellingPage.evaluate(async ({ ownerId, token, clientUploadId }) => {
      const { cancelRetainedUploadAcrossTabs } = await import("/src/features/workspace/upload-cancellation.ts");
      return (await cancelRetainedUploadAcrossTabs(ownerId, token, clientUploadId)).state;
    }, { ownerId: owner.id, token, clientUploadId });
    settled = cancellation.then((value) => ({ value }), (error) => ({ error }));
    await withinTimeout(Promise.race([
      deletion,
      settled.then(({ error }) => { throw error || new Error("Cancellation finished before DELETE was observed."); }),
    ]));
    const during = await cancellingPage.evaluate(async ({ ownerId }) => {
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
    assert.equal(await page.evaluate(() => window.activeUploadOutcome), "AbortError");
    const put = requests.indexOf(`PUT /api/upload-sessions/${sessionId}/chunks/0`);
    const deleteIndex = requests.indexOf(`DELETE /api/upload-sessions/${sessionId}`);
    assert.ok(put >= 0 && deleteIndex > put);
    assert.ok(requests.slice(put + 1, deleteIndex).includes(`GET /api/upload-sessions/${sessionId}`));

    releaseChunk();
    releaseDeletion();
    const result = await withinTimeout(settled);
    if (result.error) throw result.error;
    assert.equal(result.value, "cancelled");
    const missing = await page.evaluate(async ({ ownerId }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      try { await loadRetainedUpload(ownerId); return "present"; } catch (error) { return error.code; }
    }, { ownerId: owner.id });
    assert.equal(missing, "UPLOAD_NOT_FOUND");
    const after = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(after.status, "CANCELLED");
    assert.equal(after.reservedBytes, 0);
    await assert.rejects(fs.stat(path.join(process.env.DATA_DIR, "upload-sessions", sessionId)), { code: "ENOENT" });
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 0);
  } finally {
    releaseChunk();
    releaseDeletion();
    if (settled) await withinTimeout(settled);
    await cancellingPage.unrouteAll({ behavior: "wait" });
    await page.unrouteAll({ behavior: "wait" });
    await cancellingPage.close();
  }
};
