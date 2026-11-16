const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Upload creation recovery timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyCreationRecovery({ page, runtime, owner, token, bytes }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "create-recovery.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  let retryReached;
  let releaseRetry;
  const retry = new Promise((resolve) => { retryReached = resolve; });
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  const requests = [];
  const creations = [];
  let firstResponse;
  let settled;
  let verified = false;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${pathname}`);
    if (request.method() === "POST" && pathname === "/api/upload-sessions") {
      creations.push(request.postDataJSON());
      if (creations.length === 1) {
        const response = await route.fetch();
        firstResponse = { status: response.status(), body: await response.json() };
        await route.abort("failed");
      } else if (creations.length === 2) {
        retryReached();
        await retryGate;
        await route.continue();
      } else {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/upload-sessions**", handler);
  try {
    const initial = await page.evaluate(async ({ ownerId, token, clientUploadId }) => {
      const { saveRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
      const saved = await saveRetainedUpload({
        ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
      });
      const active = transferRetainedUpload(ownerId, token);
      Object.assign(window, { activeUpload: active });
      return { expiresAt: saved.record.expiresAt, chunkHashes: saved.record.chunkHashes };
    }, { ownerId: owner.id, token, clientUploadId });
    const transfer = page.evaluate(() => window.activeUpload);
    settled = transfer.then((value) => ({ value }), (error) => ({ error }));
    await withinTimeout(Promise.race([
      retry,
      settled.then(({ error }) => { throw error || new Error("Transfer finished before creation retry."); }),
    ]));
    assert.equal(firstResponse.status, 201);
    assert.deepEqual(creations, [creations[0], creations[0]]);
    assert.deepEqual(creations[0], {
      clientUploadId, fileName: "create-recovery.xlsx", fileSize: bytes.length, chunkHashes: initial.chunkHashes,
    });
    assert.equal(requests.filter((request) => request.startsWith("PUT ")).length, 0);
    const saved = await page.evaluate(async ({ ownerId }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const record = await loadRetainedUpload(ownerId);
      const hash = await crypto.subtle.digest("SHA-256", await record.file.arrayBuffer());
      return {
        clientUploadId: record.clientUploadId, serverSessionId: record.serverSessionId,
        confirmedBytes: record.confirmedBytes, expiresAt: record.expiresAt,
        hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }, { ownerId: owner.id });
    assert.deepEqual(saved, {
      clientUploadId, serverSessionId: null, confirmedBytes: 0, expiresAt: initial.expiresAt,
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
    const sessions = await runtime.prisma.uploadSession.findMany({ where: { ownerId: owner.id } });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, firstResponse.body.id);
    assert.equal(sessions[0].clientUploadId, clientUploadId);
    assert.equal(sessions[0].status, "RECEIVING");
    assert.equal(sessions[0].bytesReceived, 0);
    assert.equal(sessions[0].reservedBytes, bytes.length);

    releaseRetry();
    const result = await withinTimeout(settled);
    if (result.error) throw result.error;
    assert.equal(result.value.record.serverSessionId, sessions[0].id);
    assert.equal(result.value.record.confirmedBytes, bytes.length);
    assert.ok(result.value.record.expiresAt <= initial.expiresAt);
    assert.equal(creations.length, 2);
    assert.equal(await runtime.prisma.uploadSession.count({ where: { ownerId: owner.id } }), 1);
    const completion = await withinTimeout(page.evaluate(async ({ ownerId, token }) => {
      const { completeRetainedUploadWithRetry } = await import("/src/features/workspace/upload-completion.ts");
      const result = await completeRetainedUploadWithRetry(ownerId, token);
      return { state: result.state, jobId: result.jobId };
    }, { ownerId: owner.id, token }));
    assert.equal(completion.state, "completed");
    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessions[0].id } });
    assert.equal(receipt.status, "COMPLETED");
    assert.equal(receipt.completionJobId, completion.jobId);
    assert.equal(receipt.reservedBytes, 0);
    const job = await runtime.prisma.translationJob.findUniqueOrThrow({ where: { id: completion.jobId } });
    assert.equal(job.ownerId, owner.id);
    assert.deepEqual(await fs.readFile(job.sourcePath), bytes);
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 1);
    assert.equal(await runtime.prisma.notification.count({ where: { jobId: job.id } }), 1);
    verified = true;
  } finally {
    releaseRetry();
    if (settled) await withinTimeout(settled);
    await page.unrouteAll({ behavior: "wait" });
    if (!verified && firstResponse?.body?.id) {
      const cleanup = await fetch(`${runtime.baseUrl}/api/upload-sessions/${firstResponse.body.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(cleanup.status, 200, "Failed to clean up the test upload session.");
    }
  }
};
