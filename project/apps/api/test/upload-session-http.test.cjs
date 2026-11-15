const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");

const api = path.resolve(__dirname, "..");
const databaseName = "v6_upload_sessions_disposable";
const MiB = 1024 * 1024;
const sessionPath = (baseUrl, id) => `${baseUrl}/api/upload-sessions/${id}`;
const intent = (size = 1) => ({
  clientUploadId: randomUUID(),
  fileName: "report.xlsx",
  fileSize: size,
  chunkHashes: Array(Math.ceil(size / MiB)).fill("a".repeat(64)),
});

test("authenticated upload-session lifecycle is private, retryable and cleanup-safe", {
  timeout: 240000,
}, async (t) => {
  const docker = (...args) =>
    execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: "pipe" }).trim();
  const containerName = `v6-session-http-${process.pid}-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  let containerId;
  let scratch;
  let app;
  let client;
  let url;
  const previousEnv = Object.fromEntries(
    ["DATABASE_URL", "V6_UPLOAD_TEST_DATABASE_URL", "JWT_SECRET", "DATA_DIR", "BASE_PATH"]
      .map((key) => [key, process.env[key]]),
  );
  t.after(async () => {
    const cleanupErrors = [];
    try { await app?.close(); } catch (error) { cleanupErrors.push(error); }
    try { await client?.end(); } catch (error) { cleanupErrors.push(error); }
    if (containerId) {
      try {
        assert.equal(
          docker("inspect", "--format", `{{index .Config.Labels "v6-session-http-owner"}}`, containerId),
          containerName,
        );
        docker("rm", "--force", "--volumes", containerId);
      } catch (error) { cleanupErrors.push(error); }
    }
    try {
      if (scratch) await fs.rm(scratch, { recursive: true, force: true });
    } catch (error) { cleanupErrors.push(error); }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, "Lifecycle test fixture cleanup failed.");
  });

  scratch = await fs.mkdtemp(path.join(__dirname, ".upload-session-http-"));

  containerId = docker(
    "run", "--pull=never", "--rm", "--detach",
    "--name", containerName, "--label", `v6-session-http-owner=${containerName}`,
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${databaseName}`,
    "-v", "/var/lib/postgresql/data", "-p", "127.0.0.1::5432", "postgres:16-alpine",
  );
  const binding = docker("port", containerId, "5432/tcp");
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const port = Number(binding.slice(binding.lastIndexOf(":") + 1));
  assert.ok(port > 0 && port !== 5432);
  url = `postgresql://postgres:${password}@127.0.0.1:${port}/${databaseName}`;
  const readiness = () =>
    docker("exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", databaseName);
  for (let attempt = 0; ; attempt++) {
    try {
      readiness();
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Never allow this fixture to inherit or fall back to a developer/Compose database.
  const isolated = new URL(url);
  assert.equal(isolated.hostname, "127.0.0.1");
  assert.ok(Number(isolated.port) > 0 && isolated.port !== "5432");
  assert.equal(isolated.pathname, `/${databaseName}`);
  process.env.DATABASE_URL = url;
  process.env.V6_UPLOAD_TEST_DATABASE_URL = url;
  process.env.JWT_SECRET = `test-only-${randomUUID()}`;
  process.env.DATA_DIR = path.join(scratch, "data");
  delete process.env.BASE_PATH;

  const config = path.join(scratch, "prisma.config.ts");
  const migrations = path.join(scratch, "migrations");
  await fs.mkdir(migrations);
  await fs.copyFile(path.join(api, "prisma/schema.prisma"), path.join(scratch, "schema.prisma"));
  await fs.writeFile(config,
    "import { defineConfig } from 'prisma/config';\n" +
    "export default defineConfig({ schema: './schema.prisma', migrations: { path: './migrations' }, " +
    "datasource: { url: process.env.V6_UPLOAD_TEST_DATABASE_URL! } });\n");

  client = new Client({ connectionString: url });
  await client.connect();
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, databaseName);
  assert.equal(
    (await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count,
    0,
    "Refusing to migrate a previously populated disposable database.",
  );
  for (const name of await fs.readdir(path.join(api, "prisma/migrations"))) {
    await fs.cp(path.join(api, "prisma/migrations", name), path.join(migrations, name), { recursive: true });
  }
  const deploy = () => execFileSync(process.execPath, [
    path.join(api, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config,
  ], {
    cwd: api,
    env: { ...process.env, DATABASE_URL: url, V6_UPLOAD_TEST_DATABASE_URL: url },
    encoding: "utf8",
    timeout: 120000,
    stdio: "pipe",
  });
  deploy();
  const history = (await client.query(
    `SELECT "id", "title", "details",
      to_char("publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt"
     FROM "ChangelogEntry" WHERE "id" = $1`,
    ["changelog-20261115-upload-session-lifecycle-v6"],
  )).rows[0];
  assert.ok(history, "The lifecycle changelog migration was applied.");
  const builtInHistory = await fs.readFile(
    path.join(api, "../web/src/features/changelog/ChangelogPage.tsx"), "utf8",
  );
  for (const value of Object.values(history)) assert.ok(builtInHistory.includes(value), value);

  const { NestFactory } = require("@nestjs/core");
  const { JwtService } = require("@nestjs/jwt");
  const { AppModule } = require("../dist/app.module");
  const { PrismaService } = require("../dist/modules/persistence/prisma.service");
  const { UploadAdmissionService } = require("../dist/modules/file-upload/upload-admission.service");
  const { UploadSessionService } = require("../dist/modules/file-upload/upload-session.service");
  const startApp = async () => {
    const instance = await NestFactory.create(AppModule, { logger: false });
    instance.setGlobalPrefix("api");
    app = instance;
    await instance.listen(0, "127.0.0.1");
    return {
      baseUrl: await instance.getUrl(),
      prisma: instance.get(PrismaService),
      tokens: instance.get(JwtService),
      admission: instance.get(UploadAdmissionService),
      sessions: instance.get(UploadSessionService),
    };
  };
  let runtime = await startApp();
  const addUser = async (label) =>
    runtime.prisma.user.create({ data: { username: `${label}-${randomUUID()}` } });
  const tokenFor = (user) =>
    runtime.tokens.sign({ sub: user.id, username: user.username, sessionVersion: 0 });
  const request = (base, method, token, body) =>
    fetch(base, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const create = async (base, token, input) => {
    const response = await request(`${base}/api/upload-sessions`, "POST", token, input);
    return { response, body: await response.json() };
  };
  const safeFields = [
    "bytesReceived", "chunkHashes", "chunkSize", "clientUploadId", "expiresAt",
    "fileName", "fileSize", "id", "jobId", "nextChunkIndex", "status",
  ].sort();
  const storageDir = path.join(process.env.DATA_DIR, "upload-sessions");
  const budget = async () =>
    (await runtime.prisma.uploadStorageBudget.findUniqueOrThrow({ where: { id: "default" } })).reservedBytes;
  const writeOwnedStorage = async (id, name = "part") => {
    const directory = await runtime.sessions.ensureSessionStorage(id);
    await fs.writeFile(path.join(directory, name), "temporary upload bytes");
    return directory;
  };

  await t.test("real JWT routes return allowlisted metadata and enforce owner isolation", async () => {
    const owner = await addUser("owner");
    const stranger = await addUser("stranger");
    const payload = intent();
    const unauthenticated = await request(`${runtime.baseUrl}/api/upload-sessions`, "POST", null, payload);
    assert.equal(unauthenticated.status, 401);
    const created = await create(runtime.baseUrl, tokenFor(owner), payload);
    assert.equal(created.response.status, 201);
    assert.deepEqual(Object.keys(created.body).sort(), safeFields);
    assert.equal(created.body.status, "RECEIVING");
    assert.equal(created.body.fileSize, payload.fileSize);
    assert.equal(created.body.jobId, null);
    assert.equal(created.body.expiresAt, new Date(
      new Date(created.body.expiresAt).getTime(),
    ).toISOString());
    for (const forbidden of ["ownerId", "reservedBytes", "completionJobId", "storagePath", "path", "createdAt"])
      assert.equal(Object.hasOwn(created.body, forbidden), false);
    const strangerStatus = await request(sessionPath(runtime.baseUrl, created.body.id), "GET", tokenFor(stranger));
    const strangerCancel = await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(stranger));
    assert.equal(strangerStatus.status, 404);
    assert.equal(strangerCancel.status, 404);
    const ownStatus = await request(sessionPath(runtime.baseUrl, created.body.id), "GET", tokenFor(owner));
    assert.equal(ownStatus.status, 200);
    assert.deepEqual(await ownStatus.json(), created.body);
    const stored = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: created.body.id } });
    assert.equal(stored.expiresAt.getTime() - stored.createdAt.getTime(), 24 * 60 * 60 * 1000);
    assert.equal((await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner))).status, 200);
    assert.equal(await budget(), 0);
  });

  await t.test("cancellation is repeatable and cannot erase a completed job receipt or file", async () => {
    const owner = await addUser("completed-owner");
    const payload = intent(MiB);
    const created = await create(runtime.baseUrl, tokenFor(owner), payload);
    assert.equal(created.response.status, 201);
    const record = await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: created.body.id } });
    const temporaryDirectory = await writeOwnedStorage(record.id);
    await runtime.prisma.uploadSession.update({
      where: { id: record.id },
      data: { status: "FINALIZING", bytesReceived: MiB, nextChunkIndex: 1 },
    });
    await runtime.prisma.uploadSession.update({
      where: { id: record.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const jobSource = path.join(scratch, "completed-job-source.xlsx");
    await fs.writeFile(jobSource, "completed workbook");
    await runtime.prisma.translationJob.create({ data: {
      id: record.completionJobId,
      ownerId: owner.id,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      selectedSheets: ["Sheet1"],
      sourcePath: jobSource,
    } });
    for (let count = 0; count < 2; count++) {
      const deleted = await request(sessionPath(runtime.baseUrl, record.id), "DELETE", tokenFor(owner));
      assert.equal(deleted.status, 200);
      const receipt = await deleted.json();
      assert.equal(receipt.status, "COMPLETED");
      assert.equal(receipt.jobId, record.completionJobId);
    }
    assert.equal(await runtime.prisma.translationJob.count({ where: { id: record.completionJobId } }), 1);
    assert.equal(await fs.readFile(jobSource, "utf8"), "completed workbook");
    await assert.rejects(fs.lstat(temporaryDirectory), { code: "ENOENT" });
    assert.equal(await budget(), 0);
  });

  await t.test("uppercase UUID lookup uses the canonical session path during cancellation", async () => {
    const owner = await addUser("uppercase-path");
    const created = await create(runtime.baseUrl, tokenFor(owner), intent());
    assert.equal(created.response.status, 201);
    const uppercaseId = created.body.id.toUpperCase();
    const directory = await runtime.sessions.ensureSessionStorage(uppercaseId);
    const bytes = path.join(directory, "part");
    await fs.writeFile(bytes, "temporary upload bytes");
    assert.equal(await fs.readFile(bytes, "utf8"), "temporary upload bytes");

    try {
      const cancelled = await request(
        sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner),
      );
      assert.equal(cancelled.status, 200);
      await assert.rejects(fs.lstat(directory), { code: "ENOENT" });
      assert.equal(await budget(), 0);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
      const row = await runtime.prisma.uploadSession.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      if (row.reservedBytes > 0) {
        const retry = await request(
          sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner),
        );
        assert.equal(retry.status, 200);
      }
    }
  });

  await t.test("capacity conflicts include Retry-After and do not evict paused reservations", async () => {
    const admitted = [];
    try {
      for (let index = 0; index < 20; index++) {
        const user = await addUser(`capacity-${index}`);
        const result = await create(runtime.baseUrl, tokenFor(user), intent(50 * MiB));
        assert.equal(result.response.status, 201);
        admitted.push({ user, id: result.body.id });
      }
      const lastOwner = await addUser("capacity-remainder");
      const last = await create(runtime.baseUrl, tokenFor(lastOwner), intent(24 * MiB));
      assert.equal(last.response.status, 201);
      admitted.push({ user: lastOwner, id: last.body.id });
      assert.equal(await budget(), 1024 * MiB);
      const waiting = await addUser("capacity-waiting");
      const rejected = await create(runtime.baseUrl, tokenFor(waiting), intent(1));
      assert.equal(rejected.response.status, 409);
      assert.equal(rejected.body.code, "UPLOAD_CAPACITY_BUSY");
      assert.equal(rejected.response.headers.get("retry-after"), "1");
      assert.equal(await budget(), 1024 * MiB);
    } finally {
      for (const item of admitted) {
        const cancelled = await request(sessionPath(runtime.baseUrl, item.id), "DELETE", tokenFor(item.user));
        assert.equal(cancelled.status, 200);
      }
    }
    assert.equal(await budget(), 0);
  });

  await t.test("busy cancellation uses the shared admission slot and advertises retry", async () => {
    const owner = await addUser("busy");
    const created = await create(runtime.baseUrl, tokenFor(owner), intent());
    const release = runtime.admission.acquire();
    try {
      const response = await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner));
      assert.equal(response.status, 409);
      assert.equal(response.headers.get("retry-after"), "1");
      assert.equal((await response.json()).code, "UPLOAD_BUSY");
    } finally {
      release();
      const cancelled = await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner));
      assert.equal(cancelled.status, 200);
    }
    assert.equal(await budget(), 0);
  });

  await t.test("lowered administrator limits block active status without losing reservation", async () => {
    const owner = await addUser("lowered-limit");
    const payload = intent(2 * MiB);
    const created = await create(runtime.baseUrl, tokenFor(owner), payload);
    assert.equal(created.response.status, 201);
    try {
      await runtime.prisma.applicationSettings.update({
        where: { id: "default" }, data: { maxUploadSizeMb: 1 },
      });
      const status = await request(sessionPath(runtime.baseUrl, created.body.id), "GET", tokenFor(owner));
      assert.equal(status.status, 413);
      assert.equal((await status.json()).code, "UPLOAD_LIMIT_CHANGED");
      const replay = await create(runtime.baseUrl, tokenFor(owner), payload);
      assert.equal(replay.response.status, 413);
      assert.equal(replay.body.code, "UPLOAD_LIMIT_CHANGED");
      assert.equal(await budget(), 2 * MiB);
    } finally {
      await runtime.prisma.applicationSettings.update({
        where: { id: "default" }, data: { maxUploadSizeMb: 50 },
      });
      const cancelled = await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner));
      assert.equal(cancelled.status, 200);
    }
    assert.equal(await budget(), 0);
  });

  await t.test("cancel/create races never overlap owner reservations", async () => {
    const owner = await addUser("race");
    const existing = await create(runtime.baseUrl, tokenFor(owner), intent());
    const cancellation = request(sessionPath(runtime.baseUrl, existing.body.id), "DELETE", tokenFor(owner));
    const competing = create(runtime.baseUrl, tokenFor(owner), intent());
    const [cancelResponse, createResult] = await Promise.all([cancellation, competing]);
    assert.equal(cancelResponse.status, 200);
    assert.ok([201, 409].includes(createResult.response.status));
    if (createResult.response.status === 409) {
      assert.equal(createResult.body.code, "UPLOAD_SESSION_EXISTS");
      const retried = await create(runtime.baseUrl, tokenFor(owner), intent());
      assert.equal(retried.response.status, 201);
    }
    const ownerReservations = await runtime.prisma.uploadSession.count({
      where: { ownerId: owner.id, OR: [{ status: { in: ["RECEIVING", "FINALIZING"] } }, { reservedBytes: { gt: 0 } }] },
    });
    assert.equal(ownerReservations, 1);
    const rows = await runtime.prisma.uploadSession.findMany({ where: { ownerId: owner.id } });
    assert.equal(rows.filter((row) => row.reservedBytes > 0).length, 1);
    for (const row of rows)
      if (row.reservedBytes > 0)
        assert.equal((await request(sessionPath(runtime.baseUrl, row.id), "DELETE", tokenFor(owner))).status, 200);
    assert.equal(await budget(), 0);
  });

  await t.test("startup after restart expires and removes only its owned temporary data", async () => {
    const owner = await addUser("restart-expiry");
    const started = Date.now() - 25 * 60 * 60 * 1000;
    const payload = intent(1);
    const expired = await runtime.prisma.uploadSession.create({
      data: {
        ...payload, ownerId: owner.id, reservedBytes: 1,
        createdAt: new Date(started), expiresAt: new Date(started + 24 * 60 * 60 * 1000),
      },
    });
    const directory = await writeOwnedStorage(expired.id);
    for (let index = 0; index < 20; index++) {
      const anotherOwner = await addUser(`restart-expiry-${index}`);
      const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const another = await runtime.prisma.uploadSession.create({
        data: {
          ...intent(1), ownerId: anotherOwner.id, reservedBytes: 1, createdAt,
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await writeOwnedStorage(another.id, `part-${index}`);
    }
    await app.close();
    app = undefined;
    runtime = await startApp();
    assert.equal(await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: expired.id } }).then((row) => row.status), "EXPIRED");
    assert.equal(await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: expired.id } }).then((row) => row.reservedBytes), 0);
    await assert.rejects(fs.lstat(directory), { code: "ENOENT" });
    assert.equal(await budget(), 1, "Startup removes no more than one 20-session cleanup batch.");
    assert.equal(await runtime.sessions.sweepExpiredSessions(), 1);
    assert.equal(await budget(), 0);
    const response = await request(sessionPath(runtime.baseUrl, expired.id), "GET", tokenFor(owner));
    assert.equal(response.status, 410);
    assert.equal((await response.json()).code, "UPLOAD_EXPIRED");
  });

  await t.test("bounded sweeps preserve budget on unsafe symlink and malformed storage", async () => {
    const failures = [];
    for (const label of ["unsafe-link", "malformed-owner"]) {
      const owner = await addUser(label);
      const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const record = await runtime.prisma.uploadSession.create({
        data: {
          ...intent(1), ownerId: owner.id, reservedBytes: 1,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      failures.push({ owner, record, label });
    }
    const foreign = path.join(scratch, "foreign-storage");
    await fs.mkdir(foreign);
    const foreignFile = path.join(foreign, "keep.txt");
    await fs.writeFile(foreignFile, "foreign data");
    const unsafe = failures.find((item) => item.label === "unsafe-link");
    const linkPath = path.join(storageDir, unsafe.record.id);
    await fs.symlink(foreign, linkPath, "junction");
    const malformed = failures.find((item) => item.label === "malformed-owner");
    const malformedPath = path.join(storageDir, malformed.record.id);
    await fs.mkdir(malformedPath);
    await fs.writeFile(path.join(malformedPath, ".upload-session-owner"), "foreign-session\n");
    const sweep = await runtime.sessions.sweepExpiredSessions();
    assert.equal(sweep, 0);
    for (const item of failures)
      assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: item.record.id } })).reservedBytes, 1);
    assert.equal(await fs.readFile(foreignFile, "utf8"), "foreign data");
    const blockedCancel = await request(
      sessionPath(runtime.baseUrl, unsafe.record.id), "DELETE", tokenFor(unsafe.owner),
    );
    assert.equal(blockedCancel.status, 503);
    assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: unsafe.record.id } })).reservedBytes, 1);

    await fs.unlink(linkPath);
    await fs.rm(malformedPath, { recursive: true });
    assert.equal(await runtime.sessions.sweepExpiredSessions(), 2);
    for (const item of failures)
      assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: item.record.id } })).reservedBytes, 0);

    const pending = [];
    for (let index = 0; index < 21; index++) {
      const owner = await addUser(`bounded-${index}`);
      const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const record = await runtime.prisma.uploadSession.create({
        data: {
          ...intent(1), ownerId: owner.id, reservedBytes: 1, createdAt,
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await writeOwnedStorage(record.id, `part-${index}`);
      pending.push(record.id);
    }
    assert.equal(await runtime.sessions.sweepExpiredSessions(), 20);
    const remaining = await runtime.prisma.uploadSession.count({
      where: { id: { in: pending }, reservedBytes: { gt: 0 } },
    });
    assert.equal(remaining, 1);
    assert.equal(await runtime.sessions.sweepExpiredSessions(), 1);
    assert.equal(await runtime.prisma.uploadSession.count({
      where: { id: { in: pending }, reservedBytes: { gt: 0 } },
    }), 0);
    assert.equal(await budget(), 0);

    const failedCreatedAt = new Date(Date.now() - 55 * 60 * 60 * 1000);
    const laterCreatedAt = new Date(Date.now() - 44 * 60 * 60 * 1000);
    const blocked = [];
    for (let index = 0; index < 20; index++) {
      const owner = await addUser(`fairness-blocked-${index}`);
      const record = await runtime.prisma.uploadSession.create({
        data: {
          ...intent(1),
          ownerId: owner.id,
          reservedBytes: 1,
          createdAt: failedCreatedAt,
          expiresAt: new Date(failedCreatedAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      const directory = path.join(storageDir, record.id);
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, ".upload-session-owner"), `foreign-${index}\n`);
      await fs.writeFile(path.join(directory, "keep.txt"), `foreign bytes ${index}`);
      blocked.push({ record, directory, content: `foreign bytes ${index}` });
    }
    const laterOwner = await addUser("fairness-later-valid");
    const later = await runtime.prisma.uploadSession.create({
      data: {
        ...intent(1),
        ownerId: laterOwner.id,
        reservedBytes: 1,
        createdAt: laterCreatedAt,
        expiresAt: new Date(laterCreatedAt.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    const laterDirectory = await writeOwnedStorage(later.id);

    await app.close();
    app = undefined;
    runtime = await startApp();

    for (const item of blocked) {
      const session = await runtime.prisma.uploadSession.findUniqueOrThrow({
        where: { id: item.record.id },
      });
      assert.equal(session.status, "EXPIRED");
      assert.equal(session.reservedBytes, 1);
      assert.equal(await fs.readFile(path.join(item.directory, "keep.txt"), "utf8"), item.content);
    }
    assert.equal(
      (await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: later.id } })).reservedBytes,
      1,
      "The first bounded pass is occupied by the 20 older storage failures.",
    );

    assert.equal(await runtime.sessions.sweepExpiredSessions(), 1);
    assert.equal(
      (await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: later.id } })).reservedBytes,
      0,
    );
    await assert.rejects(fs.lstat(laterDirectory), { code: "ENOENT" });
    assert.equal(await budget(), 20);
    for (const item of blocked) {
      assert.equal((await fs.readdir(item.directory)).length, 2);
      assert.equal((await fs.readFile(path.join(item.directory, "keep.txt"), "utf8")), item.content);
    }
  });
});
