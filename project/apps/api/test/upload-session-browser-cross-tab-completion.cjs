const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Cross-tab completion cancellation timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyCrossTabCompletion({ page, runtime, owner, token, bytes }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "cross-tab-completion.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const sessionId = await withinTimeout(page.evaluate(async ({ ownerId, token, clientUploadId }) => {
    const { saveRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
    const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
    await saveRetainedUpload({
      ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
    });
    const result = await transferRetainedUpload(ownerId, token);
    return result.record.serverSessionId;
  }, { ownerId: owner.id, token, clientUploadId }));
  assert.ok(sessionId);

  const cancellingPage = await page.context().newPage();
  let completionCommitted;
  let releaseCompletion;
  const committed = new Promise((resolve) => { completionCommitted = resolve; });
  const completionGate = new Promise((resolve) => { releaseCompletion = resolve; });
  const requests = [];
  let completionStatus;
  let completionJob;
  let settled;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${pathname}`);
    if (request.method() === "POST" && pathname.endsWith("/completion")) {
      const response = await route.fetch();
      completionStatus = response.status();
      completionJob = await response.json();
      completionCommitted();
      await completionGate;
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  };
  await cancellingPage.goto(page.url());
  await page.route("**/api/upload-sessions/**", handler);
  await cancellingPage.route("**/api/upload-sessions/**", handler);
  try {
    await page.evaluate(async ({ ownerId, token }) => {
      const { completeRetainedUploadWithRetry } = await import("/src/features/workspace/upload-completion.ts");
      const active = completeRetainedUploadWithRetry(ownerId, token);
      Object.assign(window, { activeUploadOutcome: active.then(() => "fulfilled", (error) => error.name) });
    }, { ownerId: owner.id, token });
    await withinTimeout(committed);
    assert.equal(completionStatus, 201);
    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(receipt.status, "COMPLETED");
    assert.equal(receipt.completionJobId, completionJob.id);

    const cancellation = cancellingPage.evaluate(async ({ ownerId, token, clientUploadId }) => {
      const { cancelRetainedUploadAcrossTabs } = await import("/src/features/workspace/upload-cancellation.ts");
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const result = await cancelRetainedUploadAcrossTabs(ownerId, token, clientUploadId);
      const saved = await loadRetainedUpload(ownerId);
      const hash = await crypto.subtle.digest("SHA-256", await saved.file.arrayBuffer());
      return {
        state: result.state, jobId: result.session?.jobId,
        paused: saved.paused, clientUploadId: saved.clientUploadId, sessionId: saved.serverSessionId,
        confirmedBytes: saved.confirmedBytes, fileSize: saved.file.size,
        hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }, { ownerId: owner.id, token, clientUploadId });
    settled = cancellation.then((value) => ({ value }), (error) => ({ error }));
    const result = await withinTimeout(settled);
    if (result.error) throw result.error;
    assert.deepEqual(result.value, {
      state: "completion-detected", jobId: completionJob.id,
      paused: true, clientUploadId, sessionId, confirmedBytes: bytes.length, fileSize: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
    assert.equal(await page.evaluate(() => window.activeUploadOutcome), "AbortError");
    const completion = requests.indexOf(`POST /api/upload-sessions/${sessionId}/completion`);
    assert.ok(completion >= 0);
    assert.ok(requests.slice(completion + 1).includes(`GET /api/upload-sessions/${sessionId}`));
    assert.ok(!requests.some((request) => request.startsWith("DELETE ")));
    const after = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(after.status, "COMPLETED");
    assert.equal(after.completionJobId, completionJob.id);
    assert.equal(after.reservedBytes, 0);
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 1);
    const job = await runtime.prisma.translationJob.findUniqueOrThrow({ where: { id: completionJob.id } });
    assert.equal(job.ownerId, owner.id);
    assert.deepEqual(await fs.readFile(job.sourcePath), bytes);
    assert.equal(await runtime.prisma.notification.count({ where: { jobId: job.id } }), 1);
  } finally {
    releaseCompletion();
    if (settled) await withinTimeout(settled);
    await cancellingPage.unrouteAll({ behavior: "wait" });
    await page.unrouteAll({ behavior: "wait" });
    await cancellingPage.close();
  }
};
