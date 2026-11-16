const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("xlsx");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser restart recovery timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyBrowserRestart({ runtime, owner, token, port, profile }) {
  const origin = `http://127.0.0.1:${port}`;
  const webRoot = path.resolve(__dirname, "../../web");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,
    XLSX.utils.aoa_to_sheet(Array.from({ length: 400 }, () => ["x".repeat(4096)])), "Sheet1");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  assert.ok(bytes.length > 1024 * 1024 && bytes.length < 50 * 1024 * 1024);
  const vite = spawn(process.execPath, [
    path.join(webRoot, "node_modules/vite/bin/vite.js"),
    "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--base", "/",
  ], {
    cwd: webRoot,
    env: { ...process.env, VITE_API_URL: `${runtime.baseUrl}/api` },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let viteOutput = "";
  vite.stderr.on("data", (chunk) => { viteOutput += chunk.toString(); });
  let context;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (vite.exitCode !== null) throw new Error(`Owned Vite server exited: ${viteOutput}`);
      try {
        if ((await fetch(origin)).ok) { ready = true; break; }
      } catch { /* Wait for the owned server to listen. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Owned Vite server did not start: ${viteOutput}`);
    context = await chromium.launchPersistentContext(profile, { headless: true });
    const page = await context.newPage();
    let droppedStatus;
    await page.route("**/api/upload-sessions/**/chunks/0", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      const response = await route.fetch();
      droppedStatus = response.status();
      await route.abort("failed");
    });
    await page.goto(`${origin}/test/upload-retention-harness.html`);
    await page.locator("input").setInputFiles({
      name: "browser-restart.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: bytes,
    });
    const clientUploadId = randomUUID();
    const before = await withinTimeout(page.evaluate(async ({ ownerId, token, clientUploadId }) => {
      const { saveRetainedUpload, loadRetainedUpload } =
        await import("/src/features/workspace/upload-retention.ts");
      const { transferRetainedChunk } = await import("/src/features/workspace/upload-transfer.ts");
      await saveRetainedUpload({
        ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
      });
      let errorName;
      try {
        await transferRetainedChunk(ownerId, token);
      } catch (error) {
        errorName = error.name;
      }
      const record = await loadRetainedUpload(ownerId);
      return {
        errorName, sessionId: record.serverSessionId, confirmedBytes: record.confirmedBytes,
        clientUploadId: record.clientUploadId, fileSize: record.fileSize,
      };
    }, { ownerId: owner.id, token, clientUploadId }));
    assert.equal(droppedStatus, 200);
    assert.equal(before.errorName, "UploadNetworkError");
    assert.equal(before.confirmedBytes, 0);
    assert.equal(before.fileSize, bytes.length);
    const committed = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: before.sessionId } });
    assert.equal(committed.bytesReceived, 1024 * 1024);
    assert.equal(committed.status, "RECEIVING");
    await context.close();
    context = undefined;

    context = await chromium.launchPersistentContext(profile, { headless: true });
    const reopened = await context.newPage();
    const requests = [];
    reopened.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === runtime.baseUrl && url.pathname.startsWith("/api/upload-sessions"))
        requests.push(`${request.method()} ${url.pathname}`);
    });
    await reopened.goto(`${origin}/test/upload-retention-harness.html`);
    assert.equal(await reopened.locator("input").evaluate((input) => input.files.length), 0);
    const after = await withinTimeout(reopened.evaluate(async ({ ownerId, token }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
      const { completeRetainedUploadWithRetry } = await import("/src/features/workspace/upload-completion.ts");
      const saved = await loadRetainedUpload(ownerId);
      const transfer = await transferRetainedUpload(ownerId, token);
      const completion = await completeRetainedUploadWithRetry(ownerId, token);
      return {
        clientUploadId: saved.clientUploadId, sessionId: saved.serverSessionId, fileSize: saved.file.size,
        savedBytes: saved.confirmedBytes, transferredBytes: transfer.record.confirmedBytes,
        status: completion.state, jobId: completion.jobId,
      };
    }, { ownerId: owner.id, token }));
    assert.deepEqual(
      { clientUploadId: after.clientUploadId, sessionId: after.sessionId, fileSize: after.fileSize, savedBytes: after.savedBytes },
      { clientUploadId, sessionId: before.sessionId, fileSize: bytes.length, savedBytes: 0 },
    );
    assert.equal(after.transferredBytes, bytes.length);
    assert.equal(after.status, "completed");
    assert.equal(requests.some((item) => item.startsWith("PUT ") && item.endsWith("/chunks/0")), false);
    const statusIndex = requests.findIndex((item) => item.startsWith("GET ") && item.endsWith(before.sessionId));
    const nextChunk = requests.findIndex((item) => item.startsWith("PUT ") && item.endsWith("/chunks/1"));
    assert.ok(statusIndex >= 0 && nextChunk > statusIndex);
    const receipt = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: before.sessionId } });
    assert.equal(receipt.status, "COMPLETED");
    assert.equal(receipt.completionJobId, after.jobId);
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 1);
    assert.equal(await runtime.prisma.notification.count({ where: { jobId: after.jobId } }), 1);
    const job = await runtime.prisma.translationJob.findUniqueOrThrow({ where: { id: after.jobId } });
    assert.deepEqual(await fs.readFile(job.sourcePath), bytes);
  } finally {
    try {
      if (context) await context.close();
    } finally {
      if (vite.exitCode === null && vite.signalCode === null) {
        const exited = once(vite, "exit");
        vite.kill();
        await exited;
      }
    }
  }
};
