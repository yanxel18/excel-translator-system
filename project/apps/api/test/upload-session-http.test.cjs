const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createHash } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const { Client } = require("pg");
const { request: httpRequest } = require("node:http");
const { once } = require("node:events");
const net = require("node:net");

const api = path.resolve(__dirname, "..");
const databaseName = "v6_upload_sessions_disposable";
const MiB = 1024 * 1024;
const sessionPath = (baseUrl, id) => `${baseUrl}/api/upload-sessions/${id}`;
const chunkPath = (baseUrl, id, index) => `${sessionPath(baseUrl, id)}/chunks/${index}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readHttpBody = (response) => new Promise((resolve, reject) => {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => { body += chunk; });
  response.on("end", () => resolve(body));
  response.on("error", reject);
});
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
  const externalDatabaseUrl = process.env.V6_UPLOAD_HTTP_TEST_DATABASE_URL;
  let containerId;
  let scratch;
  let app;
  let client;
  let url;
  const ownedWorkers = new Set();
  const previousEnv = Object.fromEntries(
    ["DATABASE_URL", "V6_UPLOAD_TEST_DATABASE_URL", "JWT_SECRET", "DATA_DIR", "BASE_PATH"]
      .map((key) => [key, process.env[key]]),
  );
  t.after(async () => {
    const cleanupErrors = [];
    try { await app?.close(); } catch (error) { cleanupErrors.push(error); }
    try { await client?.end(); } catch (error) { cleanupErrors.push(error); }
    for (const worker of ownedWorkers) {
      try {
        if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
        if (worker.exitCode === null && worker.signalCode === null)
          await Promise.race([once(worker, "exit"), new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Owned API worker ${worker.pid} did not exit.`)), 5000))]);
      } catch (error) { cleanupErrors.push(error); }
    }
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

  if (externalDatabaseUrl) {
    const isolated = new URL(externalDatabaseUrl);
    assert.ok(["postgres:", "postgresql:"].includes(isolated.protocol));
    assert.equal(isolated.hostname, "127.0.0.1");
    assert.ok(Number(isolated.port) > 0 && isolated.port !== "5432");
    assert.equal(isolated.pathname, `/${databaseName}`);
    assert.equal(isolated.search, "");
    assert.equal(isolated.hash, "");
    url = externalDatabaseUrl;
  } else {
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
    process.env.V6_UPLOAD_BUILTIN_HISTORY_PATH ||
      path.join(api, "../web/src/features/changelog/ChangelogPage.tsx"),
    "utf8",
  );
  for (const value of Object.values(history)) assert.ok(builtInHistory.includes(value), value);

  const { NestFactory } = require("@nestjs/core");
  const { installRequestBodyParsers } = require("../dist/common/request-body-parsers");
  const { JwtService } = require("@nestjs/jwt");
  const { AppModule } = require("../dist/app.module");
  const { mountProductSurfacesGraphql } = require("../dist/modules/product-surfaces/graphql-http");
  const { PrismaService } = require("../dist/modules/persistence/prisma.service");
  const { UploadAdmissionService } = require("../dist/modules/file-upload/upload-admission.service");
  const { UploadSessionService } = require("../dist/modules/file-upload/upload-session.service");
  const startApp = async () => {
    const instance = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
    instance.enableCors({ origin: ["http://localhost:5173"], credentials: true });
    installRequestBodyParsers(instance);
    instance.setGlobalPrefix("api");
    await mountProductSurfacesGraphql(instance);
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
  const putChunk = async (base, token, id, index, bytes, contentType = "application/octet-stream") => {
    const response = await fetch(chunkPath(base, id, index), {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": contentType,
      },
      body: bytes,
    });
    return { response, body: await response.json() };
  };
  const unusedLoopbackPort = async () => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = server.address().port;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    return port;
  };
  const waitForWorkerMessage = (worker, type) => new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message?.type !== type) return;
      worker.off("message", onMessage);
      resolve(message);
    };
    worker.on("message", onMessage);
    worker.once("exit", (code, signal) => {
      worker.off("message", onMessage);
      reject(new Error(`Owned API worker exited before ${type} (code ${code}, signal ${signal}).`));
    });
  });
  const startOwnedApiWorker = async (holdSessionId, holdStage = "after-commit") => {
    const port = await unusedLoopbackPort();
    const source = `
      const {NestFactory}=require('@nestjs/core');
      const {AppModule}=require('./dist/app.module');
      const {UploadSessionService}=require('./dist/modules/file-upload/upload-session.service');
      const {installRequestBodyParsers}=require('./dist/common/request-body-parsers');
      (async()=>{
        const app=await NestFactory.create(AppModule,{logger:false,bodyParser:false});
        app.setGlobalPrefix('api');
        installRequestBodyParsers(app);
        const hold=process.env.V6_TEST_HOLD_SESSION;
        if(hold){
          const sessions=app.get(UploadSessionService);
          if(process.env.V6_TEST_HOLD_STAGE==='before-commit'){
            const original=sessions.commitChunkProgress.bind(sessions);
            sessions.commitChunkProgress=async(...args)=>{
              if(String(args[1].id).toLowerCase()===hold){
                process.send({type:'before-commit'});
                await new Promise(resolve=>process.once('message',resolve));
              }
              return original(...args);
            };
          } else {
            const original=sessions.receiveChunk.bind(sessions);
            sessions.receiveChunk=async(...args)=>{
              const result=await original(...args);
              if(String(args[1]).toLowerCase()===hold){
                process.send({type:'after-commit'});
                await new Promise(resolve=>process.once('message',resolve));
              }
              return result;
            };
          }
        }
        await app.listen(Number(process.env.PORT),'127.0.0.1');
        process.send({type:'ready'});
      })().catch(error=>{console.error(error);process.exit(1);});
    `;
    const worker = spawn(process.execPath, ["-e", source], {
      cwd: api,
      env: {
        ...process.env,
        DATABASE_URL: url,
        V6_UPLOAD_TEST_DATABASE_URL: url,
        JWT_SECRET: previousEnv.JWT_SECRET || process.env.JWT_SECRET,
        DATA_DIR: process.env.DATA_DIR,
        BASE_PATH: "api",
        PORT: String(port),
        ...(holdSessionId ? { V6_TEST_HOLD_SESSION: holdSessionId.toLowerCase() } : {}),
        V6_TEST_HOLD_STAGE: holdStage,
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    worker.output = "";
    worker.stderr.on("data", (chunk) => { worker.output += chunk.toString(); });
    ownedWorkers.add(worker);
    try {
      await waitForWorkerMessage(worker, "ready");
    } catch (error) {
      throw new Error(`Owned API worker failed to start: ${worker.output}`, { cause: error });
    }
    return { worker, baseUrl: `http://127.0.0.1:${port}` };
  };
  const killOwnedWorker = async (worker) => {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
    if (worker.exitCode === null && worker.signalCode === null)
      await Promise.race([once(worker, "exit"), new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Owned API worker ${worker.pid} did not exit.`)), 5000))]);
    ownedWorkers.delete(worker);
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

  await t.test("raw chunks are sequential, exact, durable and safely replayable", async () => {
    const budgetBefore = await budget();
    const owner = await addUser("chunk-owner");
    const file = Buffer.concat([Buffer.alloc(MiB, 0x41), Buffer.alloc(37, 0x7a)]);
    const first = file.subarray(0, MiB);
    const last = file.subarray(MiB);
    const payload = {
      clientUploadId: randomUUID(), fileName: "chunked.xlsx", fileSize: file.length,
      chunkHashes: [sha256(first), sha256(last)],
    };
    const created = await create(runtime.baseUrl, tokenFor(owner), payload);
    assert.equal(created.response.status, 201);

    const ack = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, first);
    assert.equal(ack.response.status, 200, JSON.stringify(ack.body));
    assert.equal(ack.body.bytesReceived, MiB);
    assert.equal(ack.body.nextChunkIndex, 1);
    const directory = path.join(storageDir, created.body.id);
    assert.deepEqual(await fs.readFile(path.join(directory, "assembled.bin")), first);

    const replay = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id.toUpperCase(), 0, first);
    assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.bytesReceived, MiB);
    assert.deepEqual(await fs.readFile(path.join(directory, "assembled.bin")), first);

    const final = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 1, last);
    assert.equal(final.response.status, 200, JSON.stringify(final.body));
    assert.equal(final.body.status, "RECEIVING", "Task 5 must not finalize or queue a job.");
    assert.equal(final.body.bytesReceived, file.length);
    assert.equal(final.body.nextChunkIndex, 2);
    assert.deepEqual(await fs.readFile(path.join(directory, "assembled.bin")), file);
    assert.equal(await runtime.prisma.translationJob.count({ where: { ownerId: owner.id } }), 0);

    assert.equal((await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner))).status, 200);
    assert.equal(await budget(), budgetBefore);
  });

  await t.test("chunked transfer encoding enforces exact size without Content-Length", async () => {
    const owner = await addUser("chunked-transfer");
    const token = tokenFor(owner);
    const bytes = Buffer.alloc(128, 0x31);
    const created = await create(runtime.baseUrl, token, {
      clientUploadId: randomUUID(), fileName: "streamed.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    const send = async (body) => {
      const url = new URL(chunkPath(runtime.baseUrl, created.body.id, 0));
      const outgoing = httpRequest({
        hostname: url.hostname, port: url.port, path: url.pathname, method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
      });
      const response = new Promise((resolve, reject) => {
        outgoing.on("response", resolve);
        outgoing.on("error", reject);
      });
      outgoing.write(body.subarray(0, 1));
      outgoing.end(body.subarray(1));
      const incoming = await response;
      return { status: incoming.statusCode, body: JSON.parse(await readHttpBody(incoming)) };
    };
    try {
      for (const body of [bytes.subarray(0, 127), Buffer.concat([bytes, Buffer.from([0])])]) {
        const rejected = await send(body);
        assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
        assert.equal(rejected.body.code, "UPLOAD_CHUNK_LENGTH");
      }
      const accepted = await send(bytes);
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      assert.equal(accepted.body.bytesReceived, bytes.length);
    } finally {
      assert.equal((await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", token)).status, 200);
    }
  });

  await t.test("receiving a partial chunk does not duplicate reserved bytes on disk", async () => {
    const owner = await addUser("no-chunk-spool");
    const token = tokenFor(owner);
    const bytes = Buffer.alloc(MiB, 0x32);
    const created = await create(runtime.baseUrl, token, {
      clientUploadId: randomUUID(), fileName: "bounded.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    const url = new URL(chunkPath(runtime.baseUrl, created.body.id, 0));
    const outgoing = httpRequest({
      hostname: url.hostname, port: url.port, path: url.pathname, method: "PUT",
      headers: {
        authorization: `Bearer ${token}`, "content-type": "application/octet-stream",
        "content-length": String(bytes.length),
      },
    });
    const result = new Promise((resolve, reject) => {
      outgoing.on("response", resolve);
      outgoing.on("error", reject);
    });
    try {
      outgoing.write(bytes.subarray(0, 64 * 1024));
      const directory = path.join(storageDir, created.body.id);
      let entries;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { entries = await fs.readdir(directory); } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (entries) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(entries, "Receiver prepared its owned session directory.");
      assert.equal(entries.some((name) => name.startsWith(".chunk-")), false);
      outgoing.end(bytes.subarray(64 * 1024));
      const response = await result;
      assert.equal(response.statusCode, 200, await readHttpBody(response));
    } finally {
      outgoing.destroy();
      await result.catch(() => {});
      let canceled = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const response = await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", token);
        if (response.status === 200) { canceled = true; break; }
        assert.equal(response.status, 409);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(canceled, true);
    }
  });

  await t.test("chunk validation, ownership, length, expiry and current limits fail explicitly", async () => {
    const budgetBefore = await budget();
    const owner = await addUser("chunk-validation-owner");
    const stranger = await addUser("chunk-validation-stranger");
    const bytes = Buffer.alloc(128, 0x42);
    const payload = {
      clientUploadId: randomUUID(), fileName: "small.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    };
    const created = await create(runtime.baseUrl, tokenFor(owner), payload);
    assert.equal(created.response.status, 201);
    const id = created.body.id;
    for (const [index, body, type, status, code] of [
      [0, bytes, "text/plain", 415, "UPLOAD_CHUNK_CONTENT_TYPE"],
      [0, Buffer.alloc(bytes.length - 1, 0x42), "application/octet-stream", 400, "UPLOAD_CHUNK_LENGTH"],
      [0, Buffer.concat([bytes, Buffer.from([1])]), "application/octet-stream", 400, "UPLOAD_CHUNK_LENGTH"],
      [1, bytes, "application/octet-stream", 400, "UPLOAD_CHUNK_INDEX"],
    ]) {
      const result = await putChunk(runtime.baseUrl, tokenFor(owner), id, index, body, type);
      assert.equal(result.response.status, status, JSON.stringify(result.body));
      assert.equal(result.body.code, code);
    }
    const foreign = await putChunk(runtime.baseUrl, tokenFor(stranger), id, 0, bytes);
    assert.equal(foreign.response.status, 404);
    const unauthenticated = await fetch(chunkPath(runtime.baseUrl, id, 0), {
      method: "PUT", headers: { "content-type": "application/octet-stream" }, body: bytes,
    });
    assert.equal(unauthenticated.status, 401);
    const invalidId = await putChunk(runtime.baseUrl, tokenFor(owner), "not-a-uuid", 0, bytes);
    assert.equal(invalidId.response.status, 400);
    assert.equal(invalidId.body.code, "UPLOAD_SESSION_ID");
    const malformedIndex = await putChunk(
      runtime.baseUrl, tokenFor(owner), id, "00", bytes,
    );
    assert.equal(malformedIndex.response.status, 400);
    assert.equal(malformedIndex.body.code, "UPLOAD_CHUNK_INDEX");
    const altered = await putChunk(runtime.baseUrl, tokenFor(owner), id, 0, Buffer.alloc(bytes.length, 0x43));
    assert.equal(altered.response.status, 422);
    assert.equal(altered.body.code, "UPLOAD_CHUNK_HASH_MISMATCH");
    assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id } })).bytesReceived, 0);
    assert.equal((await request(sessionPath(runtime.baseUrl, id), "DELETE", tokenFor(owner))).status, 200);

    const orderBytes = Buffer.alloc(MiB + 1, 0x53);
    const ordered = await create(runtime.baseUrl, tokenFor(owner), {
      clientUploadId: randomUUID(), fileName: "ordered.xlsx", fileSize: orderBytes.length,
      chunkHashes: [sha256(orderBytes.subarray(0, MiB)), sha256(orderBytes.subarray(MiB))],
    });
    assert.equal(ordered.response.status, 201);
    const skipped = await putChunk(
      runtime.baseUrl, tokenFor(owner), ordered.body.id, 1, orderBytes.subarray(MiB),
    );
    assert.equal(skipped.response.status, 409);
    assert.equal(skipped.body.code, "UPLOAD_CHUNK_ORDER");
    assert.equal((await request(sessionPath(runtime.baseUrl, ordered.body.id), "DELETE", tokenFor(owner))).status, 200);

    const reducedOwner = await addUser("reduced-limit-owner");
    const reduced = await create(runtime.baseUrl, tokenFor(reducedOwner), {
      clientUploadId: randomUUID(), fileName: "reduced.xlsx", fileSize: 2 * MiB,
      chunkHashes: ["a".repeat(64), "b".repeat(64)],
    });
    assert.equal(reduced.response.status, 201);
    await runtime.prisma.applicationSettings.update({ where: { id: "default" }, data: { maxUploadSizeMb: 1 } });
    const limitedChunk = await putChunk(
      runtime.baseUrl, tokenFor(reducedOwner), reduced.body.id, 0, Buffer.alloc(MiB, 0x41),
    );
    assert.equal(limitedChunk.response.status, 413);
    assert.equal(limitedChunk.body.code, "UPLOAD_LIMIT_CHANGED");
    const loweredOwner = await addUser("lowered-create-owner");
    const lowered = await create(runtime.baseUrl, tokenFor(loweredOwner), {
      clientUploadId: randomUUID(), fileName: "too-large.xlsx", fileSize: MiB + 1,
      chunkHashes: ["a".repeat(64), "b".repeat(64)],
    });
    assert.equal(lowered.response.status, 413);
    assert.equal((await runtime.prisma.uploadSession.count({ where: { ownerId: owner.id, fileName: "too-large.xlsx" } })), 0);
    await runtime.prisma.applicationSettings.update({ where: { id: "default" }, data: { maxUploadSizeMb: 50 } });
    assert.equal((await request(sessionPath(runtime.baseUrl, reduced.body.id), "DELETE", tokenFor(reducedOwner))).status, 200);

    const limitRaceOwner = await addUser("commit-limit-race");
    const limitRaceBytes = Buffer.alloc(MiB, 0x55);
    const limitRace = await create(runtime.baseUrl, tokenFor(limitRaceOwner), {
      clientUploadId: randomUUID(), fileName: "limit-race.xlsx", fileSize: 2 * MiB,
      chunkHashes: [sha256(limitRaceBytes), sha256(Buffer.alloc(MiB, 0x56))],
    });
    assert.equal(limitRace.response.status, 201);
    const originalTransaction = runtime.prisma.$transaction;
    try {
      runtime.prisma.$transaction = async function (...args) {
        runtime.prisma.$transaction = originalTransaction;
        await runtime.prisma.applicationSettings.update({
          where: { id: "default" }, data: { maxUploadSizeMb: 1 },
        });
        return originalTransaction.apply(this, args);
      };
      const lateLimit = await putChunk(
        runtime.baseUrl, tokenFor(limitRaceOwner), limitRace.body.id, 0, limitRaceBytes,
      );
      assert.equal(lateLimit.response.status, 413);
      assert.equal(lateLimit.body.code, "UPLOAD_LIMIT_CHANGED");
      assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({
        where: { id: limitRace.body.id },
      })).bytesReceived, 0);
      const limitRaceDirectory = path.join(storageDir, limitRace.body.id);
      assert.deepEqual(await fs.readFile(path.join(limitRaceDirectory, "assembled.bin")), limitRaceBytes);
      await runtime.prisma.applicationSettings.update({
        where: { id: "default" }, data: { maxUploadSizeMb: 50 },
      });
      const limitRetry = await putChunk(
        runtime.baseUrl, tokenFor(limitRaceOwner), limitRace.body.id, 0, limitRaceBytes,
      );
      assert.equal(limitRetry.response.status, 200, JSON.stringify(limitRetry.body));
      assert.equal(limitRetry.body.bytesReceived, MiB);
      assert.deepEqual(await fs.readFile(path.join(limitRaceDirectory, "assembled.bin")), limitRaceBytes);
    } finally {
      runtime.prisma.$transaction = originalTransaction;
      await runtime.prisma.applicationSettings.update({
        where: { id: "default" }, data: { maxUploadSizeMb: 50 },
      });
      assert.equal((await request(
        sessionPath(runtime.baseUrl, limitRace.body.id), "DELETE", tokenFor(limitRaceOwner),
      )).status, 200);
    }

    const expiredOwner = await addUser("expired-chunk-owner");
    const expiredBytes = Buffer.alloc(128, 0x57);
    const expiredCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
    const expired = await runtime.prisma.uploadSession.create({
      data: {
        ownerId: expiredOwner.id,
        clientUploadId: randomUUID(),
        fileName: "expired-chunk.xlsx",
        fileSize: expiredBytes.length,
        chunkHashes: [sha256(expiredBytes)],
        reservedBytes: expiredBytes.length,
        createdAt: expiredCreatedAt,
        expiresAt: new Date(expiredCreatedAt.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    const expiredChunk = await putChunk(
      runtime.baseUrl, tokenFor(expiredOwner), expired.id, 0, expiredBytes,
    );
    assert.equal(expiredChunk.response.status, 410);
    assert.equal(expiredChunk.body.code, "UPLOAD_EXPIRED");
    assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({
      where: { id: expired.id },
    })).bytesReceived, 0);
    assert.equal((await request(
      sessionPath(runtime.baseUrl, expired.id), "DELETE", tokenFor(expiredOwner),
    )).status, 200);

    assert.equal(await budget(), budgetBefore);
  });

  await t.test("busy chunk rejection precedes body reception and aborted bodies settle admission", async () => {
    const budgetBefore = await budget();
    const owner = await addUser("chunk-busy");
    const bytes = Buffer.alloc(MiB, 0x44);
    const created = await create(runtime.baseUrl, tokenFor(owner), {
      clientUploadId: randomUUID(), fileName: "busy.xlsx", fileSize: MiB,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    const release = runtime.admission.acquire();
    const address = new URL(chunkPath(runtime.baseUrl, created.body.id, 0));
    const clientRequest = httpRequest({
      hostname: address.hostname, port: address.port, path: address.pathname, method: "PUT",
      headers: {
        authorization: `Bearer ${tokenFor(owner)}`,
        "content-type": "application/octet-stream",
        "content-length": String(MiB),
      },
    });
    clientRequest.on("error", () => {});
    const responsePromise = once(clientRequest, "response").then(([response]) => response);
    clientRequest.write(Buffer.alloc(16, 0x44));
    const busy = await Promise.race([
      responsePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Busy response waited for the request body.")), 3000)),
    ]).catch((error) => { throw new Error(`Manual busy response: ${error.message}`, { cause: error }); });
    assert.equal(busy.statusCode, 409);
    assert.equal(busy.headers["retry-after"], "1");
    const responseBody = await readHttpBody(busy).catch((error) => {
      throw new Error(`Manual busy response body: ${error.message}`, { cause: error });
    });
    assert.equal(JSON.parse(responseBody).code, "UPLOAD_BUSY");
    clientRequest.destroy();
    release();

    const abort = httpRequest({
      hostname: address.hostname, port: address.port, path: address.pathname, method: "PUT",
      headers: {
        authorization: `Bearer ${tokenFor(owner)}`,
        "content-type": "application/octet-stream",
        "content-length": String(MiB),
      },
    });
    abort.on("error", () => {});
    abort.write(Buffer.alloc(64, 0x44));
    abort.destroy();
    let released = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const probe = runtime.admission.acquire();
        probe();
        released = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.equal(released, true, "The raw receiver must settle before releasing its lease.");
    const retry = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, bytes);
    assert.equal(retry.response.status, 200, JSON.stringify(retry.body));
    assert.equal((await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner))).status, 200);

    const concurrentOwner = await addUser("chunk-concurrent");
    const concurrentBytes = Buffer.alloc(MiB, 0x45);
    const concurrent = await create(runtime.baseUrl, tokenFor(concurrentOwner), {
      clientUploadId: randomUUID(), fileName: "concurrent.xlsx", fileSize: MiB,
      chunkHashes: [sha256(concurrentBytes)],
    });
    assert.equal(concurrent.response.status, 201);
    let first;
    try {
      const concurrentAddress = new URL(chunkPath(runtime.baseUrl, concurrent.body.id, 0));
      first = httpRequest({
        hostname: concurrentAddress.hostname,
        port: concurrentAddress.port,
        path: concurrentAddress.pathname,
        method: "PUT",
        headers: {
          authorization: `Bearer ${tokenFor(concurrentOwner)}`,
          "content-type": "application/octet-stream",
          "content-length": String(MiB),
        },
      });
      first.on("error", () => {});
      const firstResult = new Promise((resolve, reject) => {
        first.on("response", (response) => {
          readHttpBody(response).then((body) => {
            resolve({ status: response.statusCode, body: JSON.parse(body) });
          }, reject);
        });
        first.on("error", reject);
      }).then((value) => ({ value }), (error) => ({ error }));
      first.write(concurrentBytes.subarray(0, 64 * 1024));
      let receiving = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          await fs.access(path.join(storageDir, concurrent.body.id, ".upload-session-owner"));
          receiving = true;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (receiving) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(receiving, true);
      const competingAddress = new URL(chunkPath(runtime.baseUrl, concurrent.body.id, 0));
      const competingRequest = httpRequest({
        hostname: competingAddress.hostname,
        port: competingAddress.port,
        path: competingAddress.pathname,
        method: "PUT",
        headers: {
          authorization: `Bearer ${tokenFor(concurrentOwner)}`,
          "content-type": "application/octet-stream",
          "content-length": String(MiB),
        },
      });
      competingRequest.on("error", () => {});
      const competingResponse = new Promise((resolve, reject) => {
        competingRequest.on("response", resolve);
        competingRequest.on("error", reject);
      });
      competingRequest.write(concurrentBytes.subarray(0, 16));
      const rejected = await competingResponse.catch((error) => {
        throw new Error(`Concurrent busy response: ${error.message}`, { cause: error });
      });
      const rejectedBody = await readHttpBody(rejected).catch((error) => {
        throw new Error(`Concurrent busy response body: ${error.message}`, { cause: error });
      });
      assert.equal(rejected.statusCode, 409, rejectedBody);
      assert.equal(rejected.headers["retry-after"], "1");
      assert.equal(JSON.parse(rejectedBody).code, "UPLOAD_BUSY");
      competingRequest.destroy();
      first.end(concurrentBytes.subarray(64 * 1024));
      const acceptedOutcome = await firstResult;
      if (acceptedOutcome.error)
        throw new Error(`First concurrent upload response: ${acceptedOutcome.error.message}`, {
          cause: acceptedOutcome.error,
        });
      const accepted = acceptedOutcome.value;
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      assert.equal(accepted.body.bytesReceived, MiB);
    } finally {
      first?.destroy();
      let released = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const probe = runtime.admission.acquire();
          probe();
          released = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      assert.equal(released, true);
      let cleaned;
      for (let attempt = 0; attempt < 20; attempt++) {
        cleaned = await request(
          sessionPath(runtime.baseUrl, concurrent.body.id), "DELETE", tokenFor(concurrentOwner),
        );
        if (cleaned.status !== 409) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(cleaned.status, 200);
    }
    assert.equal(await budget(), budgetBefore);
  });

  await t.test("unsafe spool type fails explicitly without releasing the session reservation", async () => {
    const budgetBefore = await budget();
    const owner = await addUser("chunk-storage-failure");
    const bytes = Buffer.alloc(128, 0x46);
    const created = await create(runtime.baseUrl, tokenFor(owner), {
      clientUploadId: randomUUID(), fileName: "storage-failure.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    const directory = await runtime.sessions.ensureSessionStorage(created.body.id);
    await fs.mkdir(path.join(directory, "assembled.bin"));
    const failure = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, bytes);
    assert.equal(failure.response.status, 503);
    assert.equal(failure.body.code, "UPLOAD_STORAGE_FAILURE");
    assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({
      where: { id: created.body.id },
    })).bytesReceived, 0);
    assert.equal(await budget(), budgetBefore + bytes.length);
    await fs.rmdir(path.join(directory, "assembled.bin"));
    assert.equal((await request(
      sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner),
    )).status, 200);
    assert.equal(await budget(), budgetBefore);
  });

  await t.test("global parser still rejects malformed and oversized metadata JSON", async () => {
    const budgetBefore = await budget();
    const token = tokenFor(await addUser("chunk-json-parser"));
    const malformed = await fetch(`${runtime.baseUrl}/api/upload-sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "http://localhost:5173" },
      body: '{"clientUploadId":',
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const oversized = await fetch(`${runtime.baseUrl}/api/upload-sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(110 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(await budget(), budgetBefore);
  });

  await t.test("production GraphQL parser leaves chunk bodies for authenticated admission", async () => {
    const owner = await addUser("parser-chunk-owner");
    const token = tokenFor(owner);
    const created = await create(runtime.baseUrl, token, intent());
    assert.equal(created.response.status, 201);
    const response = await fetch(chunkPath(runtime.baseUrl, created.body.id, 0), {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{",
    });
    assert.equal(response.status, 415);
    assert.equal((await response.json()).code, "UPLOAD_CHUNK_CONTENT_TYPE");
    assert.equal((await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", token)).status, 200);
  });

  await t.test("failed progress commit leaves an unacknowledged tail that is reconciled before retry", async () => {
    const budgetBefore = await budget();
    const owner = await addUser("chunk-commit-failure");
    const bytes = Buffer.alloc(MiB, 0x61);
    const created = await create(runtime.baseUrl, tokenFor(owner), {
      clientUploadId: randomUUID(), fileName: "commit-failure.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    await client.query(`
      CREATE FUNCTION fail_test_upload_progress() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."nextChunkIndex" > OLD."nextChunkIndex" THEN
          RAISE EXCEPTION 'injected progress commit failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_test_upload_progress
        BEFORE UPDATE ON "UploadSession"
        FOR EACH ROW EXECUTE FUNCTION fail_test_upload_progress();
    `);
    try {
      const failed = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, bytes);
      assert.equal(failed.response.status, 503);
      assert.equal(failed.body.code, "UPLOAD_STORAGE_FAILURE");
      assert.equal(
        (await runtime.prisma.uploadSession.findUniqueOrThrow({ where: { id: created.body.id } })).bytesReceived,
        0,
      );
      const assembled = path.join(storageDir, created.body.id, "assembled.bin");
      assert.deepEqual(await fs.readFile(assembled), bytes,
        "The unacknowledged tail remains intact until fresh persisted progress authorizes reconciliation.");

      await client.query('DROP TRIGGER fail_test_upload_progress ON "UploadSession"');
      await client.query("DROP FUNCTION fail_test_upload_progress()");
      const retried = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, bytes);
      assert.equal(retried.response.status, 200, JSON.stringify(retried.body));
      assert.equal(retried.body.bytesReceived, bytes.length);
      assert.deepEqual(await fs.readFile(assembled), bytes,
        "The retry truncates only the freshly confirmed unacknowledged tail and appends exactly once.");
    } finally {
      await client.query('DROP TRIGGER IF EXISTS fail_test_upload_progress ON "UploadSession"');
      await client.query("DROP FUNCTION IF EXISTS fail_test_upload_progress()");
      assert.equal((await request(
        sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner),
      )).status, 200);
    }
    assert.equal(await budget(), budgetBefore);
  });

  await t.test("a filesystem sync failure after request EOF is a storage error and closes the handle", async () => {
    const owner = await addUser("chunk-sync-failure");
    const token = tokenFor(owner);
    const bytes = Buffer.alloc(128, 0x63);
    const created = await create(runtime.baseUrl, token, {
      clientUploadId: randomUUID(), fileName: "sync-failure.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    const originalOpen = fs.open;
    let injected = false;
    let closed = false;
    try {
      fs.open = async (...args) => {
        const handle = await originalOpen(...args);
        const file = String(args[0]);
        const target = file.includes(`.chunk-`) ||
          (file.endsWith("assembled.bin") && typeof args[1] === "number");
        if (!injected && target) {
          injected = true;
          const close = handle.close.bind(handle);
          handle.sync = async () => { throw new Error("Injected filesystem sync failure"); };
          handle.close = async () => { await close(); closed = true; };
        }
        return handle;
      };
      const failed = await putChunk(runtime.baseUrl, token, created.body.id, 0, bytes);
      assert.equal(failed.response.status, 503, JSON.stringify(failed.body));
      assert.equal(failed.body.code, "UPLOAD_STORAGE_FAILURE");
      assert.equal(injected, true);
      assert.equal(closed, true);
      assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({
        where: { id: created.body.id },
      })).bytesReceived, 0);
    } finally {
      fs.open = originalOpen;
    }
    const retried = await putChunk(runtime.baseUrl, token, created.body.id, 0, bytes);
    assert.equal(retried.response.status, 200, JSON.stringify(retried.body));
    assert.equal((await request(sessionPath(runtime.baseUrl, created.body.id), "DELETE", token)).status, 200);
  });

  await t.test("expiry between the transaction check and update never acknowledges a chunk", {
    timeout: 20000,
  }, async () => {
    const owner = await addUser("commit-expiry-race");
    const token = tokenFor(owner);
    const bytes = Buffer.alloc(128, 0x64);
    const [{ created }] = (await client.query(
      "SELECT clock_timestamp() - interval '24 hours' + interval '3 seconds' AS created",
    )).rows;
    const expiresAt = new Date(created.getTime() + 24 * 60 * 60 * 1000);
    const session = await runtime.prisma.uploadSession.create({
      data: {
        ownerId: owner.id, clientUploadId: randomUUID(), fileName: "expiry-race.xlsx",
        fileSize: bytes.length, chunkHashes: [sha256(bytes)], reservedBytes: bytes.length,
        createdAt: created, expiresAt,
      },
    });
    await client.query("BEGIN");
    const originalTransaction = runtime.prisma.$transaction;
    try {
      runtime.prisma.$transaction = function (callback, ...options) {
        if (typeof callback !== "function") return originalTransaction.call(this, callback, ...options);
        return originalTransaction.call(this, async (tx) => {
          const wrapped = new Proxy(tx, {
            get(target, property) {
              const value = target[property];
              if (property === "$queryRaw") return async (...args) => {
                const result = await value.apply(target, args);
                const sql = Array.isArray(args[0]) ? args[0].join("?") : "";
                if (sql.includes('FROM "UploadSession"') && sql.includes("FOR UPDATE"))
                  await client.query(`SELECT "id" FROM "ApplicationSettings" WHERE "id"='default' FOR UPDATE`);
                return result;
              };
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          return callback(wrapped);
        }, ...options);
      };
      const pending = putChunk(runtime.baseUrl, token, session.id, 0, bytes);
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await client.query("SELECT pg_stat_clear_snapshot()");
        const observed = await client.query(`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
            AND query LIKE '%maxUploadSizeMb%FOR SHARE%'
        `);
        if (observed.rows[0].count > 0) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      assert.equal(blocked, true, "The progress transaction passed its expiry check and is waiting for settings.");
      await client.query(
        "SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp())) + 0.1))",
        [expiresAt],
      );
      await client.query("COMMIT");
      const expired = await pending;
      assert.equal(expired.response.status, 410, JSON.stringify(expired.body));
      assert.equal(expired.body.code, "UPLOAD_EXPIRED");
      assert.equal((await runtime.prisma.uploadSession.findUniqueOrThrow({
        where: { id: session.id },
      })).bytesReceived, 0);
    } finally {
      runtime.prisma.$transaction = originalTransaction;
      await client.query("ROLLBACK");
      assert.equal((await request(sessionPath(runtime.baseUrl, session.id), "DELETE", token)).status, 200);
    }
  });

  await t.test("a committed transaction with a lost response is confirmed by replay, not appended twice", async () => {
    const budgetBefore = await budget();
    const owner = await addUser("chunk-lost-ack");
    const bytes = Buffer.alloc(MiB, 0x62);
    const created = await create(runtime.baseUrl, tokenFor(owner), {
      clientUploadId: randomUUID(), fileName: "lost-ack.xlsx", fileSize: bytes.length,
      chunkHashes: [sha256(bytes)],
    });
    assert.equal(created.response.status, 201);
    const originalTransaction = runtime.prisma.$transaction;
    runtime.prisma.$transaction = async function (...args) {
      const committed = await originalTransaction.apply(this, args);
      runtime.prisma.$transaction = originalTransaction;
      throw new Error("Injected lost outcome after the real PostgreSQL commit.");
    };
    const uncertain = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, bytes);
    runtime.prisma.$transaction = originalTransaction;
    assert.equal(uncertain.response.status, 503);
    assert.equal(uncertain.body.code, "UPLOAD_STORAGE_FAILURE");
    const committed = await runtime.prisma.uploadSession.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    assert.equal(committed.bytesReceived, bytes.length);
    assert.equal(committed.nextChunkIndex, 1);
    const assembled = path.join(storageDir, created.body.id, "assembled.bin");
    assert.deepEqual(await fs.readFile(assembled), bytes);

    const replay = await putChunk(runtime.baseUrl, tokenFor(owner), created.body.id, 0, bytes);
    assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.bytesReceived, bytes.length);
    assert.deepEqual(await fs.readFile(assembled), bytes);
    assert.equal((await fs.stat(assembled)).size, bytes.length);
    assert.equal((await request(
      sessionPath(runtime.baseUrl, created.body.id), "DELETE", tokenFor(owner),
    )).status, 200);
    assert.equal(await budget(), budgetBefore);
  });

  await t.test("owned API process crashes before commit and after commit-before-response recover exact spool progress", {
    timeout: 60000,
  }, async () => {
    const budgetBefore = await budget();
    const ownerBefore = await addUser("process-before-commit");
    const ownerAfter = await addUser("process-after-commit");
    const ownerTail = await addUser("process-synced-tail");
    const beforeBytes = Buffer.alloc(MiB, 0x71);
    const afterBytes = Buffer.alloc(MiB, 0x72);
    const prefixBytes = Buffer.alloc(MiB, 0x73);
    const tailBytes = Buffer.alloc(123, 0x74);
    const beforeSession = await create(runtime.baseUrl, tokenFor(ownerBefore), {
      clientUploadId: randomUUID(), fileName: "before-commit.xlsx", fileSize: MiB,
      chunkHashes: [sha256(beforeBytes)],
    });
    const afterSession = await create(runtime.baseUrl, tokenFor(ownerAfter), {
      clientUploadId: randomUUID(), fileName: "after-commit.xlsx", fileSize: MiB,
      chunkHashes: [sha256(afterBytes)],
    });
    const tailSession = await create(runtime.baseUrl, tokenFor(ownerTail), {
      clientUploadId: randomUUID(), fileName: "synced-tail.xlsx", fileSize: MiB + tailBytes.length,
      chunkHashes: [sha256(prefixBytes), sha256(tailBytes)],
    });
    assert.equal(beforeSession.response.status, 201);
    assert.equal(afterSession.response.status, 201);
    assert.equal(tailSession.response.status, 201);
    await app.close();
    app = undefined;

    const beforeDirectory = path.join(storageDir, beforeSession.body.id);
    const beforeSpool = path.join(beforeDirectory, "assembled.bin");
    let active = await startOwnedApiWorker();
    const beforeAddress = new URL(chunkPath(active.baseUrl, beforeSession.body.id, 0));
    const partial = httpRequest({
      hostname: beforeAddress.hostname,
      port: beforeAddress.port,
      path: beforeAddress.pathname,
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenFor(ownerBefore)}`,
        "content-type": "application/octet-stream",
        "content-length": String(MiB),
      },
    });
    partial.on("error", () => {});
    partial.write(beforeBytes.subarray(0, 128 * 1024));
    let receiving = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await fs.access(path.join(beforeDirectory, ".upload-session-owner"));
        receiving = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (receiving) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(receiving, "The child API began receiving the incomplete raw chunk.");
    await killOwnedWorker(active.worker);
    partial.destroy();
    const beforeProgress = (await client.query(
      'SELECT "bytesReceived", "nextChunkIndex" FROM "UploadSession" WHERE "id"=$1', [beforeSession.body.id],
    )).rows[0];
    assert.deepEqual(beforeProgress, { bytesReceived: 0, nextChunkIndex: 0 });
    await assert.rejects(fs.stat(beforeSpool), { code: "ENOENT" });

    active = await startOwnedApiWorker();
    let recovered;
    try {
      recovered = await putChunk(active.baseUrl, tokenFor(ownerBefore), beforeSession.body.id, 0, beforeBytes);
    } catch (error) {
      throw new Error(`Retry after pre-commit process crash failed: ${active.worker.output}`, { cause: error });
    }
    assert.equal(recovered.response.status, 200, JSON.stringify(recovered.body));
    assert.equal(recovered.body.bytesReceived, MiB);
    assert.deepEqual(await fs.readFile(beforeSpool), beforeBytes);
    await killOwnedWorker(active.worker);

    active = await startOwnedApiWorker(afterSession.body.id);
    const uncertainRequest = putChunk(
      active.baseUrl, tokenFor(ownerAfter), afterSession.body.id, 0, afterBytes,
    ).then((value) => ({ value }), (error) => ({ error }));
    await waitForWorkerMessage(active.worker, "after-commit");
    await killOwnedWorker(active.worker);
    const uncertainOutcome = await uncertainRequest;
    assert.ok(uncertainOutcome.error, "The client lost the response after the real commit.");
    const afterProgress = (await client.query(
      'SELECT "bytesReceived", "nextChunkIndex" FROM "UploadSession" WHERE "id"=$1', [afterSession.body.id],
    )).rows[0];
    assert.deepEqual(afterProgress, { bytesReceived: MiB, nextChunkIndex: 1 });
    const afterSpool = path.join(storageDir, afterSession.body.id, "assembled.bin");
    assert.deepEqual(await fs.readFile(afterSpool), afterBytes);

    active = await startOwnedApiWorker();
    const replay = await putChunk(
      active.baseUrl, tokenFor(ownerAfter), afterSession.body.id, 0, afterBytes,
    );
    assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.bytesReceived, MiB);
    assert.deepEqual(await fs.readFile(afterSpool), afterBytes);
    const first = await putChunk(active.baseUrl, tokenFor(ownerTail), tailSession.body.id, 0, prefixBytes);
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    await killOwnedWorker(active.worker);

    active = await startOwnedApiWorker(tailSession.body.id, "before-commit");
    const tailRequest = putChunk(
      active.baseUrl, tokenFor(ownerTail), tailSession.body.id, 1, tailBytes,
    ).then((value) => ({ value }), (error) => ({ error }));
    await waitForWorkerMessage(active.worker, "before-commit");
    const tailSpool = path.join(storageDir, tailSession.body.id, "assembled.bin");
    assert.deepEqual(await fs.readFile(tailSpool), Buffer.concat([prefixBytes, tailBytes]));
    assert.deepEqual((await client.query(
      'SELECT "bytesReceived", "nextChunkIndex" FROM "UploadSession" WHERE "id"=$1', [tailSession.body.id],
    )).rows[0], { bytesReceived: MiB, nextChunkIndex: 1 });
    await killOwnedWorker(active.worker);
    assert.ok((await tailRequest).error, "The client lost the response before the progress commit.");
    active = await startOwnedApiWorker();
    const tailRetry = await putChunk(active.baseUrl, tokenFor(ownerTail), tailSession.body.id, 1, tailBytes);
    assert.equal(tailRetry.response.status, 200, JSON.stringify(tailRetry.body));
    assert.equal(tailRetry.body.bytesReceived, MiB + tailBytes.length);
    assert.deepEqual(await fs.readFile(tailSpool), Buffer.concat([prefixBytes, tailBytes]));
    const canceledBefore = await request(
      sessionPath(active.baseUrl, beforeSession.body.id), "DELETE", tokenFor(ownerBefore),
    );
    const canceledAfter = await request(
      sessionPath(active.baseUrl, afterSession.body.id), "DELETE", tokenFor(ownerAfter),
    );
    const canceledTail = await request(
      sessionPath(active.baseUrl, tailSession.body.id), "DELETE", tokenFor(ownerTail),
    );
    assert.equal(canceledBefore.status, 200);
    assert.equal(canceledAfter.status, 200);
    assert.equal(canceledTail.status, 200);
    assert.equal((await client.query(
      'SELECT "reservedBytes" FROM "UploadStorageBudget" WHERE "id"=\'default\'',
    )).rows[0].reservedBytes, budgetBefore,
    "Both process-test reservations are released only after their spool directories are removed.");
    await killOwnedWorker(active.worker);
  });
});
