import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const webRoot = path.resolve("project", "apps", "web");
let vite: ChildProcess;
let origin: string;

test.beforeAll(async () => {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No test port available.");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  origin = `http://127.0.0.1:${port}`;
  vite = spawn(process.execPath, [
    path.join(webRoot, "node_modules", "vite", "bin", "vite.js"),
    "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--base", "/",
  ], { cwd: webRoot, stdio: "ignore" });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (vite.exitCode !== null) throw new Error("Owned Vite server exited before readiness.");
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Owned Vite server did not start.");
});

test.afterAll(async () => {
  if (vite && vite.exitCode === null && vite.signalCode === null) {
    const exited = once(vite, "exit");
    vite.kill();
    await exited;
  }
});

async function openHarness(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.route(`${origin}/retention-test-harness`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Retention test</title>" }),
  );
  await page.goto(`${origin}/retention-test-harness`);
  return page;
}

const modulePath = "/src/features/workspace/upload-retention.ts";

test("retains bounded hashes and file bytes across a real persistent-profile restart", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "upload-retention-"));
  let context = await chromium.launchPersistentContext(profile, { headless: true });
  const id = randomUUID();
  const sessionId = randomUUID();
  const selectedAt = Date.now();
  const expected = [
    createHash("sha256").update(Buffer.alloc(1024 * 1024, 97)).digest("hex"),
    createHash("sha256").update(Buffer.alloc(13, 98)).digest("hex"),
  ];
  try {
    const page = await openHarness(context);
    const saved = await page.evaluate(async ({ modulePath, id, selectedAt, sessionId }) => {
      const { saveRetainedUpload, updateRetainedUpload } = await import(/* @vite-ignore */ modulePath);
      const original = Blob.prototype.arrayBuffer;
      const readSizes: number[] = [];
      Blob.prototype.arrayBuffer = function () {
        readSizes.push(this.size);
        return original.call(this);
      };
      try {
        const file = new File([new Uint8Array(1024 * 1024).fill(97), new Uint8Array(13).fill(98)], "saved.xlsx");
        const result = await saveRetainedUpload({ ownerId: "owner-a", clientUploadId: id, file, selectedAt });
        await updateRetainedUpload("owner-a", id, { serverSessionId: sessionId, confirmedBytes: 1024 * 1024 });
        return { record: { ...result.record, file: undefined }, persistent: result.persistent, readSizes };
      } finally {
        Blob.prototype.arrayBuffer = original;
      }
    }, { modulePath, id, selectedAt, sessionId });
    expect(saved.record.chunkHashes).toEqual(expected);
    expect(saved.record.expiresAt).toBe(selectedAt + 24 * 60 * 60 * 1000);
    expect(saved.readSizes).toEqual([1024 * 1024, 13]);
    expect([true, false, null]).toContain(saved.persistent);
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true });
    const reopened = await openHarness(context);
    const recovered = await reopened.evaluate(async ({ modulePath }) => {
      const { loadRetainedUpload, readRetainedChunk } = await import(/* @vite-ignore */ modulePath);
      const record = await loadRetainedUpload("owner-a");
      const tail = await readRetainedChunk(record, 1).arrayBuffer();
      let otherCode = "";
      try { await loadRetainedUpload("owner-b"); } catch (error) { otherCode = (error as { code: string }).code; }
      return {
        ownerId: record.ownerId, clientUploadId: record.clientUploadId, fileName: record.fileName,
        fileSize: record.file.size, chunkHashes: record.chunkHashes, tail: [...new Uint8Array(tail)],
        keys: Object.keys(record), otherCode, serverSessionId: record.serverSessionId, confirmedBytes: record.confirmedBytes,
      };
    }, { modulePath });
    expect(recovered).toMatchObject({
      ownerId: "owner-a", clientUploadId: id, fileName: "saved.xlsx", fileSize: 1024 * 1024 + 13,
      chunkHashes: expected, tail: Array(13).fill(98), otherCode: "UPLOAD_NOT_FOUND",
      serverSessionId: sessionId, confirmedBytes: 1024 * 1024,
    });
    expect(recovered.keys).not.toContain("token");
    expect(recovered.keys).not.toContain("credentials");
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: false });
  }
});

test("competing tabs cannot retain different intents for one account", async ({ context }) => {
  const first = await openHarness(context);
  const second = await openHarness(context);
  const attempt = (page: Page, id: string) => page.evaluate(async ({ modulePath, id }) => {
    const { saveRetainedUpload } = await import(/* @vite-ignore */ modulePath);
    try {
      const result = await saveRetainedUpload({
        ownerId: "same-owner", clientUploadId: id, file: new File(["content"], "test.xlsx"), selectedAt: Date.now(),
      });
      return { id: result.record.clientUploadId };
    } catch (error) {
      return { code: (error as { code: string }).code };
    }
  }, { modulePath, id });
  const outcomes = await Promise.all([attempt(first, randomUUID()), attempt(second, randomUUID())]);
  expect(outcomes.filter((result) => result.id)).toHaveLength(1);
  expect(outcomes.filter((result) => result.code === "UPLOAD_ALREADY_RETAINED")).toHaveLength(1);
});

test("reports missing, expired, quota and unavailable storage without fallback", async ({ context }) => {
  const page = await openHarness(context);
  const result = await page.evaluate(async ({ modulePath, id }) => {
    const { saveRetainedUpload, loadRetainedUpload } = await import(/* @vite-ignore */ modulePath);
    const file = new File(["bytes"], "test.xlsx");
    const code = async (operation: () => Promise<unknown>) => {
      try { await operation(); return "unexpected-success"; }
      catch (error) { return (error as { code: string }).code; }
    };
    const missing = await code(() => loadRetainedUpload("missing"));
    const expired = await code(() => saveRetainedUpload({
      ownerId: "expired", clientUploadId: id, file, selectedAt: Date.now() - 24 * 60 * 60 * 1000,
    }));
    const open = indexedDB.open;
    Object.defineProperty(indexedDB, "open", { configurable: true, value: () => { throw new DOMException("full", "QuotaExceededError"); } });
    const quota = await code(() => saveRetainedUpload({ ownerId: "quota", clientUploadId: id, file, selectedAt: Date.now() }));
    Object.defineProperty(indexedDB, "open", { configurable: true, value: () => { throw new DOMException("blocked", "SecurityError"); } });
    const unavailable = await code(() => loadRetainedUpload("missing"));
    Object.defineProperty(indexedDB, "open", { configurable: true, value: open });
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () { throw new DOMException("full", "QuotaExceededError"); };
    const quotaDuringWrite = await code(() => saveRetainedUpload({
      ownerId: "write-quota", clientUploadId: id, file, selectedAt: Date.now(),
    }));
    IDBObjectStore.prototype.add = add;
    const notSaved = await code(() => loadRetainedUpload("write-quota"));
    return { missing, expired, quota, unavailable, quotaDuringWrite, notSaved };
  }, { modulePath, id: randomUUID() });
  expect(result).toEqual({
    missing: "UPLOAD_NOT_FOUND", expired: "UPLOAD_EXPIRED",
    quota: "UPLOAD_STORAGE_QUOTA", unavailable: "UPLOAD_STORAGE_UNAVAILABLE",
    quotaDuringWrite: "UPLOAD_STORAGE_QUOTA", notSaved: "UPLOAD_NOT_FOUND",
  });
});

test("replay, guarded deletion and expiry cleanup preserve account isolation", async ({ context }) => {
  const page = await openHarness(context);
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  const id = randomUUID();
  const result = await page.evaluate(async ({ modulePath, id, otherId }) => {
    const { saveRetainedUpload, loadRetainedUpload, removeRetainedUpload } = await import(/* @vite-ignore */ modulePath);
    const selectedAt = Date.now();
    const input = { ownerId: "account-a", clientUploadId: id, file: new File(["one"], "test.xlsx"), selectedAt };
    const saved = await saveRetainedUpload(input);
    const replay = await saveRetainedUpload(input);
    const code = async (operation: () => Promise<unknown>) => {
      try { await operation(); return "unexpected-success"; }
      catch (error) { return (error as { code: string }).code; }
    };
    const changed = await code(() => saveRetainedUpload({ ...input, file: new File(["two"], "test.xlsx") }));
    const wrongDelete = await code(() => removeRetainedUpload("account-a", otherId));
    await saveRetainedUpload({ ...input, ownerId: "account-b", clientUploadId: otherId });
    const intact = await loadRetainedUpload("account-a");
    return { same: saved.record.clientUploadId === replay.record.clientUploadId, changed, wrongDelete, intact: intact.clientUploadId };
  }, { modulePath, id, otherId: randomUUID() });
  expect(result).toEqual({ same: true, changed: "UPLOAD_INTENT_CONFLICT", wrongDelete: "UPLOAD_INTENT_CONFLICT", intact: id });
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  const expiredResult = await page.evaluate(async ({ modulePath }) => {
    const { loadRetainedUpload, purgeExpiredRetainedUploads } = await import(/* @vite-ignore */ modulePath);
    const code = async () => {
      try { await loadRetainedUpload("account-a"); return "unexpected-success"; }
      catch (error) { return (error as { code: string }).code; }
    };
    const expired = await code();
    const missing = await code();
    const purged = await purgeExpiredRetainedUploads();
    return { expired, missing, purged };
  }, { modulePath });
  expect(expiredResult).toEqual({ expired: "UPLOAD_EXPIRED", missing: "UPLOAD_NOT_FOUND", purged: 1 });
});

test("persists server reconciliation metadata without extending expiry or changing intent", async ({ context }) => {
  const page = await openHarness(context);
  const result = await page.evaluate(async ({ modulePath, id, sessionId, otherId }) => {
    const { saveRetainedUpload, loadRetainedUpload, updateRetainedUpload, removeRetainedUpload } =
      await import(/* @vite-ignore */ modulePath);
    const selectedAt = Date.now();
    const file = new File([new Uint8Array(1024 * 1024 + 5)], "test.xlsx");
    await saveRetainedUpload({ ownerId: "owner", clientUploadId: id, file, selectedAt });
    const earlier = selectedAt + 60_000;
    await updateRetainedUpload("owner", id, {
      serverSessionId: sessionId, confirmedBytes: 1024 * 1024, expiresAt: earlier, paused: true,
    });

    await updateRetainedUpload("owner", id, { expiresAt: selectedAt + 120_000 });
    const code = async (operation: () => Promise<unknown>) => {
      try { await operation(); return "unexpected-success"; }
      catch (error) { return (error as { code: string }).code; }
    };
    const changedSession = await code(() => updateRetainedUpload("owner", id, { serverSessionId: otherId }));
    const wrongIntent = await code(() => updateRetainedUpload("owner", otherId, { paused: false }));
    await updateRetainedUpload("owner", id, { confirmedBytes: 0 });
    const reconciledBytes = (await loadRetainedUpload("owner")).confirmedBytes;
    await updateRetainedUpload("owner", id, { confirmedBytes: 1024 * 1024 });
    const invalidOffset = await code(() => updateRetainedUpload("owner", id, { confirmedBytes: 1024 * 1024 + 1 }));
    const saved = await loadRetainedUpload("owner");
    await removeRetainedUpload("owner", id);
    const removed = await code(() => loadRetainedUpload("owner"));
    return {
      sessionId: saved.serverSessionId, confirmedBytes: saved.confirmedBytes, expiresAt: saved.expiresAt,
      earlier, paused: saved.paused, changedSession, wrongIntent, reconciledBytes, invalidOffset, removed,
    };
  }, { modulePath, id: randomUUID(), sessionId: randomUUID(), otherId: randomUUID() });
  expect(result).toMatchObject({
    confirmedBytes: 1024 * 1024, paused: true,
    changedSession: "UPLOAD_INTENT_CONFLICT", wrongIntent: "UPLOAD_INTENT_CONFLICT",
    reconciledBytes: 0, invalidOffset: "UPLOAD_INVALID_METADATA", removed: "UPLOAD_NOT_FOUND",
  });
  expect(result.sessionId).toBeTruthy();
  expect(result.expiresAt).toBe(result.earlier);
});

test("upload-session API sends binary chunks and preserves retry errors", async ({ context }) => {
  const page = await openHarness(context);
  const id = randomUUID();
  const intentId = randomUUID();
  const calls: { method: string; path: string; contentType: string; body: number[] }[] = [];
  let busy = false;
  await page.route("**/excel-convert/upload-sessions/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*", "access-control-allow-methods": "GET,PUT,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      } });
      return;
    }
    calls.push({
      method: request.method(), path: new URL(request.url()).pathname,
      contentType: request.headers()["content-type"] ?? "",
      body: [...(request.postDataBuffer() ?? Buffer.alloc(0))],
    });
    const headers = { "access-control-allow-origin": "*", "access-control-expose-headers": "retry-after" };
    if (busy) {
      await route.fulfill({ status: 409, headers: { ...headers, "retry-after": "5" },
        json: { code: "UPLOAD_BUSY", message: "Try again" } });
      return;
    }
    await route.fulfill({ headers, json: {
      id, clientUploadId: intentId, fileName: "test.xlsx", fileSize: 3, chunkHashes: ["a".repeat(64)],
      chunkSize: 1048576, status: "RECEIVING", bytesReceived: 3, nextChunkIndex: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
    } });
  });
  const first = await page.evaluate(async ({ id }) => {
    const { uploadSessionApi } = await import(/* @vite-ignore */ "/src/api/upload-sessions.ts");
    const result = await uploadSessionApi.putChunk(id, 0, new Blob([new Uint8Array([1, 2, 3])]), "test-token");
    return result.bytesReceived;
  }, { id });
  expect(first).toBe(3);
  expect(calls).toEqual([{ method: "PUT", path: `/excel-convert/upload-sessions/${id}/chunks/0`,
    contentType: "application/octet-stream", body: [1, 2, 3] }]);
  busy = true;
  const result = await page.evaluate(async ({ id }) => {
    const { uploadSessionApi } = await import(/* @vite-ignore */ "/src/api/upload-sessions.ts");
    try { await uploadSessionApi.status(id, "test-token"); return null; }
    catch (error) {
      const e = error as { status: number; code: string; retryAfterMs: number };
      return { status: e.status, code: e.code, retryAfterMs: e.retryAfterMs };
    }
  }, { id });
  expect(result).toEqual({ status: 409, code: "UPLOAD_BUSY", retryAfterMs: 5000 });
});

test("upload-session API rejects malformed and mismatched responses and preserves session expiry", async ({ context }) => {
  const page = await openHarness(context);
  const id = randomUUID();
  const otherId = randomUUID();
  let mode = "malformed";
  await page.route("**/excel-convert/upload-sessions/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "authorization",
      } });
      return;
    }
    const headers = { "access-control-allow-origin": "*" };
    if (mode === "auth") {
      await route.fulfill({ status: 401, headers, json: { message: "Unauthorized" } });
    } else {
      await route.fulfill({ headers, json: mode === "malformed" ? { id } : {
        id: otherId, clientUploadId: randomUUID(), fileName: "test.xlsx", fileSize: 1,
        chunkHashes: ["a".repeat(64)], chunkSize: 1048576, status: "RECEIVING",
        bytesReceived: 0, nextChunkIndex: 0, expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
      } });
    }
  });
  const attempt = () => page.evaluate(async ({ id }) => {
    const { uploadSessionApi } = await import(/* @vite-ignore */ "/src/api/upload-sessions.ts");
    try { await uploadSessionApi.status(id, "synthetic-token"); return "unexpected-success"; }
    catch (error) { return (error as Error).name; }
  }, { id });
  expect(await attempt()).toBe("Error");
  mode = "mismatch";
  expect(await attempt()).toBe("Error");
  mode = "auth";
  expect(await attempt()).toBe("SessionExpiredError");
});

test("upload-session API creates, cancels and completes through their respective endpoints", async ({ context }) => {
  const page = await openHarness(context);
  const id = randomUUID();
  const intentId = randomUUID();
  const jobId = randomUUID();
  const methods: string[] = [];
  await page.route("**/excel-convert/upload-sessions**", async (route) => {
    const request = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    methods.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (request.url().endsWith("/completion")) {
      await route.fulfill({ headers, json: { id: jobId } });
      return;
    }
    await route.fulfill({ headers, json: {
      id, clientUploadId: intentId, fileName: "test.xlsx", fileSize: 1,
      chunkHashes: ["a".repeat(64)], chunkSize: 1048576,
      status: request.method() === "DELETE" ? "CANCELLED" : "RECEIVING",
      bytesReceived: 0, nextChunkIndex: 0, expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
    } });
  });
  const result = await page.evaluate(async ({ id, intentId }) => {
    const { uploadSessionApi } = await import(/* @vite-ignore */ "/src/api/upload-sessions.ts");
    const created = await uploadSessionApi.create({
      clientUploadId: intentId, fileName: "test.xlsx", fileSize: 1, chunkHashes: ["a".repeat(64)],
    }, "synthetic-token");
    const completed = await uploadSessionApi.complete(id, "synthetic-token");
    const cancelled = await uploadSessionApi.cancel(id, "synthetic-token");
    return { created: created.id, completed: completed.id, cancelled: cancelled.status };
  }, { id, intentId });
  expect(result).toEqual({ created: id, completed: jobId, cancelled: "CANCELLED" });
  expect(methods).toEqual([
    "POST /excel-convert/upload-sessions",
    `POST /excel-convert/upload-sessions/${id}/completion`,
    `DELETE /excel-convert/upload-sessions/${id}`,
  ]);
});

test("reconciliation replays an uncertain creation and persists only server-confirmed progress", async ({ context }) => {
    const page = await openHarness(context);
    const intentId = randomUUID();
    const sessionId = randomUUID();
    const calls: { method: string; body: Record<string, unknown> | null }[] = [];
    let created: Record<string, unknown> | undefined;
    await page.route("**/excel-convert/upload-sessions**", async (route) => {
      const request = route.request();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      calls.push({ method: request.method(), body });
      if (body && !created) {
        created = body;
        return route.abort("connectionreset");
      }
      return route.fulfill({ headers, json: {
        ...created, id: sessionId, chunkSize: 1048576, status: "RECEIVING",
        bytesReceived: 1048576, nextChunkIndex: 1,
        expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
      } });
    });
    const result = await page.evaluate(async ({ modulePath, intentId }) => {
      const { saveRetainedUpload, loadRetainedUpload } = await import(/* @vite-ignore */ modulePath);
      const { reconcileRetainedUpload } = await import(/* @vite-ignore */ "/src/features/workspace/upload-reconciliation.ts");
      const selectedAt = Date.now();
      await saveRetainedUpload({ ownerId: "owner", clientUploadId: intentId,
        file: new File([new Uint8Array(1048576 + 5)], "test.xlsx"), selectedAt });
      let failed = false;
      try { await reconcileRetainedUpload("owner", "synthetic-token"); } catch { failed = true; }
      const before = await loadRetainedUpload("owner");
      const replay = await reconcileRetainedUpload("owner", "synthetic-token");
      const status = await reconcileRetainedUpload("owner", "synthetic-token");
      return { failed, beforeSession: before.serverSessionId, replay: {
        sessionId: replay.record.serverSessionId, bytes: replay.record.confirmedBytes,
        expiresAt: replay.record.expiresAt, status: replay.session?.status,
      }, statusId: status.session?.id, localDeadline: selectedAt + 86400000 };
    }, { modulePath, intentId });
    expect(result.failed).toBe(true);
    expect(result.beforeSession).toBeNull();
    expect(result.replay).toMatchObject({ sessionId, bytes: 1048576, status: "RECEIVING" });
    expect(result.replay.expiresAt).toBeLessThan(result.localDeadline);
    expect(result.statusId).toBe(sessionId);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "GET"]);
    expect(calls[0].body).toEqual(calls[1].body);
  });

test("reconciliation rejects mismatched server metadata and respects manual pause", async ({ context }) => {
    const page = await openHarness(context);
    const intentId = randomUUID();
    const sessionId = randomUUID();
    let requests = 0;
    let payload: Record<string, unknown> = {};
    await page.route("**/excel-convert/upload-sessions/**", async (route) => {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "authorization" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      requests++;
      return route.fulfill({ headers, json: payload });
    });

    const result = await page.evaluate(async ({ modulePath, intentId, sessionId }) => {
      const { saveRetainedUpload, updateRetainedUpload } = await import(/* @vite-ignore */ modulePath);
      const { reconcileRetainedUpload } = await import(/* @vite-ignore */ "/src/features/workspace/upload-reconciliation.ts");
      const { record } = await saveRetainedUpload({ ownerId: "owner", clientUploadId: intentId,
        file: new File(["bytes"], "test.xlsx"), selectedAt: Date.now() });
      await updateRetainedUpload("owner", intentId, { serverSessionId: sessionId, paused: true });
      const paused = await reconcileRetainedUpload("owner", "synthetic-token");
      await updateRetainedUpload("owner", intentId, { paused: false });
      return { paused: paused.record.paused, session: paused.session,
        fileName: record.fileName, fileSize: record.fileSize, chunkHashes: record.chunkHashes };
    }, { modulePath, intentId, sessionId });
    expect(result.paused).toBe(true);
    expect(result.session).toBeNull();
    expect(requests).toBe(0);
    payload = { id: sessionId, clientUploadId: intentId, fileName: result.fileName,
      fileSize: result.fileSize, chunkHashes: ["f".repeat(64)], chunkSize: 1048576,
      status: "RECEIVING", bytesReceived: result.fileSize, nextChunkIndex: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null };
    const after = await page.evaluate(async ({ modulePath }) => {
      const { loadRetainedUpload } = await import(/* @vite-ignore */ modulePath);
      const { reconcileRetainedUpload } = await import(/* @vite-ignore */ "/src/features/workspace/upload-reconciliation.ts");
      let error = "";
      try { await reconcileRetainedUpload("owner", "synthetic-token"); }
      catch (reason) { error = (reason as Error).message; }
      return { error, bytes: (await loadRetainedUpload("owner")).confirmedBytes };
    }, { modulePath });
    expect(after.error).toContain("does not match");
    expect(after.bytes).toBe(0);
    expect(requests).toBe(1);
  });

test("a delayed reconciliation cannot overwrite newer progress from another tab", async ({ context }) => {
  const first = await openHarness(context);
  const second = await openHarness(context);
  const intentId = randomUUID();
  const sessionId = randomUUID();
  const saved = await first.evaluate(async ({ modulePath, intentId, sessionId }) => {
    const { saveRetainedUpload, updateRetainedUpload } = await import(/* @vite-ignore */ modulePath);
    const { record } = await saveRetainedUpload({ ownerId: "owner", clientUploadId: intentId,
      file: new File(["bytes"], "test.xlsx"), selectedAt: Date.now() });
    await updateRetainedUpload("owner", intentId, { serverSessionId: sessionId });
    return { fileName: record.fileName, fileSize: record.fileSize, chunkHashes: record.chunkHashes };
  }, { modulePath, intentId, sessionId });
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let received = () => {};
  const requestStarted = new Promise<void>((resolve) => { received = resolve; });
  await first.route("**/excel-convert/upload-sessions/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "authorization" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    received();
    await gate;
    return route.fulfill({ headers, json: {
      id: sessionId, clientUploadId: intentId, ...saved, chunkSize: 1048576,
      status: "RECEIVING", bytesReceived: 0, nextChunkIndex: 0,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
    } });
  });
  const pending = first.evaluate(async () => {
    const { reconcileRetainedUpload } = await import(/* @vite-ignore */ "/src/features/workspace/upload-reconciliation.ts");
    try { await reconcileRetainedUpload("owner", "synthetic-token"); return "unexpected-success"; }
    catch (error) { return (error as { code: string }).code; }
  });
  await requestStarted;
  await second.evaluate(async ({ modulePath, intentId }) => {
    const { updateRetainedUpload } = await import(/* @vite-ignore */ modulePath);
    await updateRetainedUpload("owner", intentId, { confirmedBytes: 5 });
  }, { modulePath, intentId });
  release();
  expect(await pending).toBe("UPLOAD_INTENT_CONFLICT");
  const bytes = await second.evaluate(async ({ modulePath }) => {
    const { loadRetainedUpload } = await import(/* @vite-ignore */ modulePath);
    return (await loadRetainedUpload("owner")).confirmedBytes;
  }, { modulePath });
  expect(bytes).toBe(5);
});
