import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a paused upload stays paused after reload, reports busy, and resumes to a verified job", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const api = process.env.UPLOAD_TEST_API || "http://localhost:5173/api";
  const sessionId = randomUUID();
  const jobId = randomUUID();
  let metadata: Record<string, unknown> = {};
  let bytes = 0;
  let chunks = 0;
  let completions = 0;
  let releaseChunk: (() => void) | undefined;
  const firstChunk = new Promise<void>((resolve) => { releaseChunk = resolve; });
  await page.addInitScript(() => localStorage.setItem("excel-translator-token", "upload-ui-token"));
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(new URL(api).pathname, "");
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/profile") return route.fulfill({ headers, json: {
      id: "owner-1", username: "owner", isAdmin: false, email: null, fullName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } });
    if (path === "/system/info") return route.fulfill({ headers, json: { year: 2026, maxUploadSizeMb: 200 } });
    if (path === "/history" || path === "/jobs/history")
      return route.fulfill({ headers, json: { data: [], nextCursor: null } });
    if (path.startsWith("/upload-sessions")) {
      if (path === "/upload-sessions" && request.method() === "POST") metadata = request.postDataJSON();
      if (request.method() === "PUT") {
        chunks += 1;
        if (chunks === 1) {
          await firstChunk;
          return route.abort().catch(() => undefined);
        }
        if (chunks === 2) return route.fulfill({ status: 503, headers, json: { message: "busy" } });
        bytes += request.postDataBuffer()!.length;
      }
      if (path.endsWith("/completion")) {
        completions++;
        return route.fulfill({ headers, json: { id: jobId } });
      }
      return route.fulfill({ headers, json: {
        ...metadata, id: sessionId, chunkSize: 1048576, status: "RECEIVING",
        bytesReceived: bytes, nextChunkIndex: Math.ceil(bytes / 1048576),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
      } });
    }
    return route.fulfill({ headers, json: [] });
  });
  await page.goto(process.env.UPLOAD_TEST_URL || "/excel-convert/");
  await expect(page.getByText(/Upload limit.*200 MB/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "workbook.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("workbook"),
  });
  await page.getByRole("button", { name: "Upload workbook" }).click();
  await expect.poll(() => chunks).toBe(1);
  await expect(page.getByRole("progressbar", { name: "Confirmed upload progress" })).toBeVisible();
  await page.getByRole("button", { name: "Pause upload" }).focus();
  await page.keyboard.press("Enter");
  releaseChunk?.();
  await expect(page.getByText("Upload paused")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("excel-translator-locale", "ja"));
  await page.reload();
  await expect(page.getByText("アップロードを一時停止しました")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("excel-translator-locale", "zh"));
  await page.reload();
  await expect(page.getByText("上传已暂停")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("excel-translator-locale", "en"));
  await page.reload();
  await expect(page.getByText("Upload paused")).toBeVisible();
  expect(chunks).toBe(1);
  await page.getByRole("button", { name: "Resume upload" }).click();
  await expect(page.getByText("Waiting for upload capacity")).toBeVisible();
  await expect.poll(() => completions).toBe(1);
  await expect(page.getByText("Upload complete")).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Confirmed upload progress" })).toHaveCount(0);
  expect(chunks).toBe(3);
});

test("an interrupted upload recovers only for its owner, including on another route", async ({ page }) => {
  const api = process.env.UPLOAD_TEST_API || "http://localhost:5173/api";
  const app = process.env.UPLOAD_TEST_URL || "http://localhost:5173/excel-convert/";
  const sessionId = randomUUID();
  const jobId = randomUUID();
  let metadata: Record<string, unknown> = {};
  let bytes = 0;
  let completions = 0;
  const uploadTokens: string[] = [];
  let releaseChunk: (() => void) | undefined;
  const firstChunk = new Promise<void>((resolve) => { releaseChunk = resolve; });
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(new URL(api).pathname, "");
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const token = request.headers().authorization?.replace("Bearer ", "") || "";
    if (path === "/auth/oidc/config") return route.fulfill({ headers, json: {
      mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "",
    } });
    if (path === "/profile") return route.fulfill({ headers, json: {
      id: token, username: token, isAdmin: false, email: null, fullName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } });
    if (path === "/system/info") return route.fulfill({ headers, json: { year: 2026, maxUploadSizeMb: 50 } });
    if (path === "/history" || path === "/jobs/history")
      return route.fulfill({ headers, json: { data: [], nextCursor: null } });
    if (path.startsWith("/upload-sessions")) {
      uploadTokens.push(token);
      if (path === "/upload-sessions" && request.method() === "POST") metadata = request.postDataJSON();
      if (request.method() === "PUT") {
        if (bytes === 0 && uploadTokens.filter((value) => value === "owner-1").length === 2) {
          await firstChunk;
          return route.abort().catch(() => undefined);
        }
        bytes += request.postDataBuffer()!.length;
      }
      if (path.endsWith("/completion")) {
        completions++;
        return route.fulfill({ headers, json: { id: jobId } });
      }
      return route.fulfill({ headers, json: {
        ...metadata, id: sessionId, chunkSize: 1048576, status: "RECEIVING",
        bytesReceived: bytes, nextChunkIndex: Math.ceil(bytes / 1048576),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
      } });
    }
    return route.fulfill({ headers, json: [] });
  });
  await page.goto(app);
  await page.evaluate(() => localStorage.setItem("excel-translator-token", "owner-1"));
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name: "private.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("private workbook"),
  });
  await page.getByRole("button", { name: "Upload workbook" }).click();
  await expect.poll(() => uploadTokens.length).toBe(2);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  releaseChunk?.();
  await page.evaluate(() => localStorage.setItem("excel-translator-token", "owner-2"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Translate a workbook" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse files", exact: true })).toBeVisible();
  await expect(page.getByText("private.xlsx")).toHaveCount(0);
  expect(uploadTokens).not.toContain("owner-2");
  await page.evaluate(() => localStorage.setItem("excel-translator-token", "owner-1"));
  await page.goto(`${app.replace(/\/$/, "")}/history`);
  await expect.poll(() => completions).toBe(1);
  await expect(page.getByText("Upload complete")).toHaveCount(0);
  expect(uploadTokens.every((token) => token === "owner-1")).toBe(true);
});

test("cancelling an active upload removes its retained file only after server confirmation", async ({ page }) => {
  const api = process.env.UPLOAD_TEST_API || "http://localhost:5173/api";
  const sessionId = randomUUID();
  let metadata: Record<string, unknown> = {};
  let status = "RECEIVING";
  let chunks = 0;
  let cancelled = 0;
  let releaseChunk: (() => void) | undefined;
  const firstChunk = new Promise<void>((resolve) => { releaseChunk = resolve; });
  await page.addInitScript(() => localStorage.setItem("excel-translator-token", "upload-ui-token"));
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(new URL(api).pathname, "");
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/profile") return route.fulfill({ headers, json: {
      id: "owner-1", username: "owner", isAdmin: false, email: null, fullName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } });
    if (path === "/system/info") return route.fulfill({ headers, json: { year: 2026, maxUploadSizeMb: 50 } });
    if (path.startsWith("/upload-sessions")) {
      if (path === "/upload-sessions" && request.method() === "POST") metadata = request.postDataJSON();
      if (request.method() === "PUT") {
        chunks += 1;
        await firstChunk;
        return route.abort().catch(() => undefined);
      }
      if (request.method() === "DELETE") { status = "CANCELLED"; cancelled += 1; }
      return route.fulfill({ headers, json: {
        ...metadata, id: sessionId, chunkSize: 1048576, status,
        bytesReceived: 0, nextChunkIndex: 0,
        expiresAt: new Date(Date.now() + 60_000).toISOString(), jobId: null,
      } });
    }
    return route.fulfill({ headers, json: [] });
  });
  await page.goto(process.env.UPLOAD_TEST_URL || "/excel-convert/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cancel.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("workbook"),
  });
  await page.getByRole("button", { name: "Upload workbook" }).click();
  await expect.poll(() => chunks).toBe(1);
  await page.getByRole("button", { name: "Cancel upload" }).click();
  releaseChunk?.();
  await expect.poll(() => cancelled).toBe(1);
  await expect(page.getByRole("button", { name: "Browse files", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Browse files", exact: true })).toBeVisible();
  expect(chunks).toBe(1);
});

test("unavailable browser storage blocks upload instead of falling back to multipart", async ({ page }) => {
  const api = process.env.UPLOAD_TEST_API || "http://localhost:5173/api";
  let uploads = 0;
  await page.addInitScript(() => {
    localStorage.setItem("excel-translator-token", "upload-ui-token");
    Object.defineProperty(window, "indexedDB", { value: { open: () => {
      sessionStorage.setItem("storage-open-attempts", String(Number(sessionStorage.getItem("storage-open-attempts") || 0) + 1));
      throw new Error("storage blocked");
    } } });
  });
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(new URL(api).pathname, "");
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/profile") return route.fulfill({ headers, json: {
      id: "owner-1", username: "owner", isAdmin: false, email: null, fullName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } });
    if (path === "/system/info") return route.fulfill({ headers, json: { year: 2026, maxUploadSizeMb: 50 } });
    if (path === "/upload" || path.startsWith("/upload-sessions")) uploads += 1;
    return route.fulfill({ headers, json: [] });
  });
  await page.goto(process.env.UPLOAD_TEST_URL || "/excel-convert/");
  await expect(page.getByText("Browser upload storage is unavailable. Check site storage settings and retry.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "workbook.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("workbook"),
  });
  await page.getByRole("button", { name: "Upload workbook" }).click();
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("storage-open-attempts")))).toBeGreaterThan(1);
  await expect(page.getByText("Browser upload storage is unavailable. Check site storage settings and retry.")).toBeVisible();
  expect(uploads).toBe(0);
});
