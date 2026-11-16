const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser completion/cancellation race timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyCompletionCancellationRace({ page, runtime, owner, token, bytes }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "completion-cancel-race.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const sessionId = await withinTimeout(page.evaluate(async ({ ownerId, token, clientUploadId }) => {
    const { saveRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
    const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
    await saveRetainedUpload({
      ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
    });
    const transfer = await transferRetainedUpload(ownerId, token);
    return transfer.record.serverSessionId;
  }, { ownerId: owner.id, token, clientUploadId }));
  assert.ok(sessionId);

  const events = [];
  let initialStatus;
  let completionStatus;
  let completionJob;
  let routeError;
  const handler = async (route) => {
    const method = route.request().method();
    try {
      if (method === "GET") {
        const response = await route.fetch();
        initialStatus = (await response.json()).status;
        events.push("status");
        await route.fulfill({ response });
      } else if (method === "DELETE") {
        events.push("cancel-request");
        const response = await fetch(`${runtime.baseUrl}/api/upload-sessions/${sessionId}/completion`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        completionStatus = response.status;
        completionJob = await response.json();
        events.push("completion-response");
        await route.continue();
      } else {
        await route.continue();
      }
    } catch (error) {
      routeError = error;
      await route.abort("failed");
    }
  };
  await page.route("**/api/upload-sessions/**", handler);
  try {
    const result = await withinTimeout(page.evaluate(async ({ ownerId, token }) => {
      const { cancelRetainedUploadWithRetry } = await import("/src/features/workspace/upload-cancellation.ts");
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const cancellation = await cancelRetainedUploadWithRetry(ownerId, token);
      const retained = await loadRetainedUpload(ownerId);
      const hash = await crypto.subtle.digest("SHA-256", await retained.file.arrayBuffer());
      return {
        state: cancellation.state, session: cancellation.session,
        clientUploadId: retained.clientUploadId, sessionId: retained.serverSessionId,
        confirmedBytes: retained.confirmedBytes, fileSize: retained.file.size,
        hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }, { ownerId: owner.id, token }));
    if (routeError) throw routeError;
    assert.deepEqual(events, ["status", "cancel-request", "completion-response"]);
    assert.equal(initialStatus, "RECEIVING");
    assert.equal(completionStatus, 201);
    assert.equal(result.state, "completion-detected");
    assert.equal(result.session.status, "COMPLETED");
    assert.equal(result.session.jobId, completionJob.id);
    assert.equal(result.clientUploadId, clientUploadId);
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.confirmedBytes, bytes.length);
    assert.equal(result.fileSize, bytes.length);
    assert.equal(result.hash, createHash("sha256").update(bytes).digest("hex"));

    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(receipt.status, "COMPLETED");
    assert.equal(receipt.completionJobId, completionJob.id);
    assert.equal(receipt.reservedBytes, 0);
    const job = await runtime.prisma.translationJob.findUniqueOrThrow({ where: { id: completionJob.id } });
    assert.equal(job.ownerId, owner.id);
    assert.deepEqual(await fs.readFile(job.sourcePath), bytes);
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 1);
    assert.equal(await runtime.prisma.notification.count({ where: { jobId: job.id } }), 1);
  } finally {
    await page.unroute("**/api/upload-sessions/**", handler);
  }
};
