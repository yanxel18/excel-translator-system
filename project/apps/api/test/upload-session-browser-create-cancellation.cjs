const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

async function withinTimeout(operation) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Creation cancellation timed out.")), 30000);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = async function verifyCreationCancellation({ page, runtime, owner, token, bytes, crossTab = false }) {
  const clientUploadId = randomUUID();
  await page.locator("input").setInputFiles({
    name: "create-cancel.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  let creationCommitted;
  let releaseCreation;
  let deletionReached;
  let releaseDeletion;
  const committed = new Promise((resolve) => { creationCommitted = resolve; });
  const creationGate = new Promise((resolve) => { releaseCreation = resolve; });
  const deletion = new Promise((resolve) => { deletionReached = resolve; });
  const deletionGate = new Promise((resolve) => { releaseDeletion = resolve; });
  const cancellingPage = crossTab ? await page.context().newPage() : page;
  const requests = [];
  const creations = [];
  let response;
  let settled;
  let verified = false;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname !== "/api/upload-sessions" && !pathname.startsWith("/api/upload-sessions/")) {
      await route.continue();
      return;
    }
    requests.push(`${request.method()} ${pathname}`);
    if (request.method() === "POST" && pathname === "/api/upload-sessions") {
      creations.push(request.postDataJSON());
      if (creations.length === 1) {
        const result = await route.fetch();
        response = { status: result.status(), body: await result.json() };
        creationCommitted();
        await creationGate;
        await route.fulfill({ response: result });
      } else {
        await route.continue();
      }
    } else if (request.method() === "DELETE") {
      deletionReached();
      await deletionGate;
      await route.continue();
    } else {
      await route.continue();
    }
  };
  if (crossTab) await cancellingPage.goto(page.url());
  await page.route("**/api/upload-sessions**", handler);
  if (crossTab) await cancellingPage.route("**/api/upload-sessions**", handler);
  try {
    const saved = await page.evaluate(async ({ ownerId, token, clientUploadId }) => {
      const { saveRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const { transferRetainedUpload } = await import("/src/features/workspace/upload-sequential.ts");
      const saved = await saveRetainedUpload({
        ownerId, clientUploadId, file: document.querySelector("input").files[0], selectedAt: Date.now(),
      });
      const controller = new AbortController();
      const active = transferRetainedUpload(ownerId, token, controller.signal);
      const outcome = active.then(() => "fulfilled", (error) => error.name);
      Object.assign(window, { activeUpload: { controller, active, outcome } });
      return { chunkHashes: saved.record.chunkHashes, expiresAt: saved.record.expiresAt };
    }, { ownerId: owner.id, token, clientUploadId });
    await withinTimeout(committed);
    assert.equal(response.status, 201);
    const sessionId = response.body.id;
    const before = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(before.status, "RECEIVING");
    assert.equal(before.bytesReceived, 0);
    assert.equal(before.reservedBytes, bytes.length);

    const cancellation = cancellingPage.evaluate(async ({ ownerId, token, clientUploadId, crossTab }) => {
      const { cancelActiveRetainedUpload, cancelRetainedUploadAcrossTabs } =
        await import("/src/features/workspace/upload-cancellation.ts");
      if (crossTab) return (await cancelRetainedUploadAcrossTabs(ownerId, token, clientUploadId)).state;
      const { controller, active, outcome } = window.activeUpload;
      const result = await cancelActiveRetainedUpload(ownerId, token, clientUploadId, controller, active);
      await outcome;
      return result.state;
    }, { ownerId: owner.id, token, clientUploadId, crossTab });
    settled = cancellation.then((value) => ({ value }), (error) => ({ error }));
    await withinTimeout(Promise.race([
      deletion,
      settled.then(({ error }) => { throw error || new Error("Cancellation finished before DELETE was observed."); }),
    ]));
    const during = await cancellingPage.evaluate(async ({ ownerId }) => {
      const { loadRetainedUpload } = await import("/src/features/workspace/upload-retention.ts");
      const record = await loadRetainedUpload(ownerId);
      const hash = await crypto.subtle.digest("SHA-256", await record.file.arrayBuffer());
      return {
        paused: record.paused, clientUploadId: record.clientUploadId, serverSessionId: record.serverSessionId,
        confirmedBytes: record.confirmedBytes, expiresAt: record.expiresAt,
        hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }, { ownerId: owner.id });
    assert.equal(during.paused, true);
    assert.equal(during.clientUploadId, clientUploadId);
    assert.equal(during.serverSessionId, sessionId);
    assert.equal(during.confirmedBytes, 0);
    assert.ok(during.expiresAt <= saved.expiresAt);
    assert.equal(during.hash, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(creations, Array(2).fill({
      clientUploadId, fileName: "create-cancel.xlsx", fileSize: bytes.length, chunkHashes: saved.chunkHashes,
    }));
    assert.deepEqual(requests, [
      "POST /api/upload-sessions",
      "POST /api/upload-sessions",
      `DELETE /api/upload-sessions/${sessionId}`,
    ]);
    assert.equal(await runtime.prisma.uploadSession.count({ where: { ownerId: owner.id } }), 1);
    assert.equal(await page.evaluate(() => window.activeUpload.outcome), "AbortError");

    releaseCreation();
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
    verified = true;
  } finally {
    releaseCreation();
    releaseDeletion();
    if (settled) await withinTimeout(settled);
    if (crossTab) await cancellingPage.unrouteAll({ behavior: "wait" });
    await page.unrouteAll({ behavior: "wait" });
    if (crossTab) await cancellingPage.close();
    if (!verified && response?.body?.id) {
      const cleanup = await fetch(`${runtime.baseUrl}/api/upload-sessions/${response.body.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(cleanup.status, 200, "Failed to clean up the test upload session.");
    }
  }
};
