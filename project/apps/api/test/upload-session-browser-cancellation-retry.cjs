const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser cancellation retry timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyCancellationRetry({ page, runtime, owner, token, bytes }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "cancel-retry.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const sessionId = await page.evaluate(async ({ ownerId, token, clientUploadId }) => {
    const { saveRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
    const { transferRetainedChunk } = await import("/src/features/workspace/upload-transfer.ts");
    await saveRetainedUpload({
      ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
    });
    const transfer = await transferRetainedChunk(ownerId, token);
    return transfer.record.serverSessionId;
  }, { ownerId: owner.id, token, clientUploadId });
  assert.ok(sessionId);

  const requests = [];
  let lostStatus;
  let gets = 0;
  let resolveRetry;
  let releaseRetry;
  const retryReached = new Promise((resolve) => { resolveRetry = resolve; });
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  const routeHandler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${pathname}`);
    if (request.method() === "DELETE" && lostStatus === undefined) {
      const response = await route.fetch();
      lostStatus = response.status();
      await route.abort("failed");
    } else if (request.method() === "GET" && pathname.endsWith(sessionId) && ++gets === 2) {
      resolveRetry();
      await retryGate;
      await route.continue();
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/upload-sessions/**", routeHandler);
  const operation = page.evaluate(async ({ ownerId, token }) => {
    const { cancelRetainedUploadWithRetry } = await import("/src/features/workspace/upload-cancellation.ts");
    const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
    const result = await cancelRetainedUploadWithRetry(ownerId, token);
    let missing;
    try {
      await loadRetainedUpload(ownerId);
    } catch (error) {
      missing = error.code;
    }
    return { state: result.state, missing };
  }, { ownerId: owner.id, token });
  const settled = operation.then((value) => ({ value }), (error) => ({ error }));
  try {
    const reached = await withinTimeout(Promise.race([
      retryReached.then(() => true),
      settled.then(({ error }) => { throw error || new Error("Cancellation finished before reconciliation."); }),
    ]));
    assert.equal(reached, true);
    assert.equal(lostStatus, 200);
    const retained = await page.evaluate(async ({ ownerId }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const saved = await loadRetainedUpload(ownerId);
      const hash = await crypto.subtle.digest("SHA-256", await saved.file.arrayBuffer());
      return {
        clientUploadId: saved.clientUploadId, sessionId: saved.serverSessionId,
        confirmedBytes: saved.confirmedBytes, fileSize: saved.file.size,
        hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }, { ownerId: owner.id });
    assert.equal(retained.clientUploadId, clientUploadId);
    assert.equal(retained.sessionId, sessionId);
    assert.equal(retained.confirmedBytes, 1024 * 1024);
    assert.equal(retained.fileSize, bytes.length);
    assert.equal(retained.hash, createHash("sha256").update(bytes).digest("hex"));
    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(receipt.status, "CANCELLED");
    assert.equal(receipt.reservedBytes, 0);
    await assert.rejects(fs.stat(path.join(process.env.DATA_DIR, "upload-sessions", sessionId)), { code: "ENOENT" });
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 0);

    releaseRetry();
    const result = await withinTimeout(settled);
    if (result.error) throw result.error;
    assert.deepEqual(result.value, { state: "cancelled", missing: "UPLOAD_NOT_FOUND" });
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 0);
    const deletes = requests
      .map((item, index) => item === `DELETE /api/upload-sessions/${sessionId}` ? index : -1)
      .filter((index) => index >= 0);
    assert.equal(deletes.length, 2);
    assert.ok(requests.slice(deletes[0] + 1, deletes[1]).includes(`GET /api/upload-sessions/${sessionId}`));
  } finally {
    releaseRetry();
    await page.unroute("**/api/upload-sessions/**", routeHandler);
  }
};
