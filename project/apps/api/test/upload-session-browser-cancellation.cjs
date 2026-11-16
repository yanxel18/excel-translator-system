const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const XLSX = require("xlsx");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser cancellation recovery timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyBrowserCancellation({ page, runtime, owner, token }) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,
    XLSX.utils.aoa_to_sheet(Array.from({ length: 400 }, () => ["x".repeat(4096)])), "Sheet1");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileSize = bytes.length;
  assert.ok(fileSize > 1024 * 1024 && fileSize < 50 * 1024 * 1024);
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "cancel-recovery.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const requests = [];
  let lostStatus;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === runtime.baseUrl && url.pathname.startsWith("/api/upload-sessions"))
      requests.push(`${request.method()} ${url.pathname}`);
  });
  await page.route("**/api/upload-sessions/**", async (route) => {
    if (route.request().method() === "DELETE" && lostStatus === undefined) {
      const response = await route.fetch();
      lostStatus = response.status();
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  const before = await withinTimeout(page.evaluate(async ({ ownerId, token, clientUploadId }) => {
    const { saveRetainedUpload, loadRetainedUpload } =
      await import("/src/features/workspace/upload-retention.ts");
    const { transferRetainedChunk } = await import("/src/features/workspace/upload-transfer.ts");
    const { cancelRetainedUpload } = await import("/src/features/workspace/upload-cancellation.ts");
    await saveRetainedUpload({
      ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
    });
    const transfer = await transferRetainedChunk(ownerId, token);
    let errorName;
    try {
      await cancelRetainedUpload(ownerId, token);
    } catch (error) {
      errorName = error.name;
    }
    const saved = await loadRetainedUpload(ownerId);
    const hash = await crypto.subtle.digest("SHA-256", await saved.file.arrayBuffer());
    return {
      errorName, sessionId: saved.serverSessionId, clientUploadId: saved.clientUploadId,
      fileSize: saved.file.size, confirmedBytes: saved.confirmedBytes, sentBytes: transfer.record.confirmedBytes,
      hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    };
  }, { ownerId: owner.id, token, clientUploadId }));
  assert.equal(lostStatus, 200);
  assert.equal(before.errorName, "UploadNetworkError");
  assert.equal(before.clientUploadId, clientUploadId);
  assert.equal(before.fileSize, fileSize);
  assert.equal(before.hash, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(before.confirmedBytes, 1024 * 1024);
  assert.equal(before.sentBytes, 1024 * 1024);

  const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: before.sessionId } });
  assert.equal(receipt.status, "CANCELLED");
  assert.equal(receipt.reservedBytes, 0);
  await assert.rejects(fs.stat(path.join(process.env.DATA_DIR, "upload-sessions", before.sessionId)), {
    code: "ENOENT",
  });
  assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 0);

  const after = await withinTimeout(page.evaluate(async ({ ownerId, token }) => {
    const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
    const { cancelRetainedUploadWithRetry } = await import("/src/features/workspace/upload-cancellation.ts");
    const result = await cancelRetainedUploadWithRetry(ownerId, token);
    let missing;
    try {
      await loadRetainedUpload(ownerId);
    } catch (error) {
      missing = error.code;
    }
    return { state: result.state, missing };
  }, { ownerId: owner.id, token }));
  assert.deepEqual(after, { state: "cancelled", missing: "UPLOAD_NOT_FOUND" });
  const deletes = requests
    .map((item, index) => item.startsWith("DELETE ") && item.endsWith(before.sessionId) ? index : -1)
    .filter((index) => index >= 0);
  assert.equal(deletes.length, 2);
  assert.ok(requests.slice(deletes[0] + 1, deletes[1])
    .some((item) => item.startsWith("GET ") && item.endsWith(before.sessionId)));
};
