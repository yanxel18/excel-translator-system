const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("../../../../node_modules/@playwright/test");
const XLSX = require("xlsx");

const api = path.resolve(__dirname, "..");

test("a started translation completes after browser logout and closure", { timeout: 180000 }, async (t) => {
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: "pipe" }).trim();
  const name = `background-translation-${process.pid}-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  const previous = Object.fromEntries(["DATABASE_URL", "DATA_DIR", "JWT_SECRET", "LOCAL_AUTH_ENABLED", "BASE_PATH"].map((key) => [key, process.env[key]]));
  let containerId, scratch, app, browser;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let workerStarted;
  const started = new Promise((resolve) => { workerStarted = resolve; });
  t.after(async () => {
    release();
    const errors = [];
    try { await browser?.close(); } catch (error) { errors.push(error); }
    try { await app?.close(); } catch (error) { errors.push(error); }
    if (containerId) {
      try {
        assert.equal(docker("inspect", "--format", '{{index .Config.Labels "background-test-owner"}}', containerId), name);
        docker("rm", "--force", "--volumes", containerId);
      } catch (error) { errors.push(error); }
    }
    try { if (scratch) await fs.rm(scratch, { recursive: true, force: true }); } catch (error) { errors.push(error); }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (errors.length) throw new AggregateError(errors, "Background test cleanup failed.");
  });
  scratch = await fs.mkdtemp(path.join(__dirname, ".background-test-"));
  containerId = docker("run", "--pull=never", "--rm", "--detach",
    "--name", name, "--label", `background-test-owner=${name}`,
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=background_test",
    "-v", "/var/lib/postgresql/data", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const binding = docker("port", containerId, "5432/tcp");
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  for (let attempt = 0; ; attempt++) {
    try {
      docker("exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "background_test");
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  process.env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${binding.split(":").pop()}/background_test`;
  process.env.DATA_DIR = path.join(scratch, "data");
  process.env.JWT_SECRET = randomUUID();
  process.env.LOCAL_AUTH_ENABLED = "true";
  delete process.env.BASE_PATH;
  await fs.mkdir(process.env.DATA_DIR);
  execFileSync(process.execPath, [path.join(api, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: api, env: process.env, encoding: "utf8", timeout: 120000, stdio: "pipe",
  });
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = require("../dist/app.module");
  const { PrismaService } = require("../dist/modules/persistence/prisma.service");
  const { TranslationService } = require("../dist/modules/translation/translation.service");
  const { hashPassword } = require("../dist/modules/authentication/passwords");
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  const translate = app.get(TranslationService);
  translate.sendTextForTranslation = async (texts) => {
    assert.ok(texts.some(({ value }) => value === "Original"), "The workbook text was extracted");
    workerStarted();
    await gate;
    return texts.map(({ id }) => ({ id, translated: "Translated" }));
  };
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const prisma = app.get(PrismaService);
  const user = await prisma.user.create({ data: { username: `background-${randomUUID()}`, passwordHash: await hashPassword("test-password") } });
  const other = await prisma.user.create({ data: { username: `other-${randomUUID()}`, passwordHash: await hashPassword("test-password") } });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Original"]]), "Sheet1");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const sourcePath = path.join(process.env.DATA_DIR, `${randomUUID()}.xlsx`);
  await fs.writeFile(sourcePath, bytes);
  const job = await prisma.translationJob.create({ data: {
    ownerId: user.id, fileName: "background.xlsx", fileSize: bytes.length,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sourceLanguage: "JAPANESE", targetLanguage: "ENGLISH", selectedSheets: ["Sheet1"], sourcePath,
  } });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${base}/api/auth/oidc/config`);
  const login = await page.evaluate(async ({ base, username }) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "test-password" }),
    });
    const result = await response.json();
    sessionStorage.setItem("token", result.access_token);
    return response.status;
  }, { base, username: user.username });
  assert.equal(login, 201);
  assert.equal(await page.evaluate(async ({ base, id }) => {
    const response = await fetch(`${base}/api/jobs/${id}/start`, {
      method: "POST", headers: { authorization: `Bearer ${sessionStorage.getItem("token")}` },
    });
    return response.status;
  }, { base, id: job.id }), 201);
  let timeout;
  try {
    await Promise.race([started, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Worker did not start")), 10000); })]);
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(await page.evaluate(async (base) => {
    const response = await fetch(`${base}/api/auth/logout`, { method: "POST" });
    sessionStorage.removeItem("token");
    return response.status;
  }, base), 201);
  await browser.close();
  browser = null;
  assert.equal((await prisma.translationJob.findUniqueOrThrow({ where: { id: job.id } })).status, "PROCESSING");
  release();
  for (let attempt = 0; ; attempt++) {
    const current = await prisma.translationJob.findUniqueOrThrow({ where: { id: job.id } });
    if (current.status === "COMPLETED") break;
    if (current.status === "FAILED" || attempt >= 100) throw new Error(`Job ended as ${current.status}: ${current.error}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: user.username, password: "test-password" }),
  });
  assert.equal(loginResponse.status, 201);
  const token = (await loginResponse.json()).access_token;
  const headers = { authorization: `Bearer ${token}` };
  const jobResponse = await fetch(`${base}/api/jobs/${job.id}`, { headers });
  assert.equal(jobResponse.status, 200);
  assert.equal((await jobResponse.json()).status, "COMPLETED");
  const notifications = await (await fetch(`${base}/api/notifications`, { headers })).json();
  assert.ok(notifications.data.some((item) => item.jobId === job.id && item.eventKey === "job.completed"));
  const download = await fetch(`${base}/api/jobs/${job.id}/download`, { headers });
  assert.equal(download.status, 200);
  const result = XLSX.read(Buffer.from(await download.arrayBuffer()), { type: "buffer" });
  assert.equal(result.Sheets.Sheet1.A1.v, "Translated");
  const otherLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: other.username, password: "test-password" }),
  });
  assert.equal(otherLogin.status, 201);
  const otherHeaders = { authorization: `Bearer ${(await otherLogin.json()).access_token}` };
  assert.equal((await fetch(`${base}/api/jobs/${job.id}`, { headers: otherHeaders })).status, 403);
  const otherNotifications = await (await fetch(`${base}/api/notifications`, { headers: otherHeaders })).json();
  assert.ok(!otherNotifications.data.some((item) => item.jobId === job.id));
});
