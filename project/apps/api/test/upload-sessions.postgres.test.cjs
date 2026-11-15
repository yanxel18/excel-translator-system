const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");

const api = path.resolve(__dirname, "..");
const migrationName = "20261115215500_upload_session_storage_v6";
const databaseUrl = process.env.V6_UPLOAD_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set V6_UPLOAD_TEST_DATABASE_URL to a disposable upload test database.");
const parsed = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== "127.0.0.1" || !parsed.port || parsed.port === "5432" ||
    parsed.pathname !== "/v6_upload_sessions_disposable" || parsed.search || parsed.hash) {
  throw new Error("Upload tests require v6_upload_sessions_disposable on an isolated loopback port.");
}

test("populated upgrade and durable replay-safe upload reservations", { timeout: 180000 }, async (t) => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  t.after(() => client.end());
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name,
    "v6_upload_sessions_disposable");
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count, 0,
    "Refusing to migrate a previously populated test target.");
  const scratch = fs.mkdtempSync(path.join(__dirname, ".upload-sessions-"));
  t.after(() => fs.rmSync(scratch, { recursive: true }));
  fs.mkdirSync(path.join(scratch, "migrations"));
  fs.copyFileSync(path.join(api, "prisma/schema.prisma"), path.join(scratch, "schema.prisma"));
  fs.writeFileSync(path.join(scratch, "prisma.config.ts"),
    "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: './schema.prisma', migrations: { path: './migrations' }, datasource: { url: process.env.V6_UPLOAD_TEST_DATABASE_URL! } });\n");
  for (const name of fs.readdirSync(path.join(api, "prisma/migrations"))) {
    if (name === "migration_lock.toml" || name < migrationName)
      fs.cpSync(path.join(api, "prisma/migrations", name), path.join(scratch, "migrations", name), { recursive: true });
  }
  const deploy = () => execFileSync(process.execPath, [
    path.join(api, "node_modules/prisma/build/index.js"), "migrate", "deploy",
    "--config", path.join(scratch, "prisma.config.ts"),
  ], { cwd: api, timeout: 60000, stdio: "pipe" });
  deploy();
  const legacyOwner = randomUUID();
  await client.query('INSERT INTO "User" ("id","username","gid","fullName","updatedAt") VALUES ($1,$2,$3,$4,now())',
    [legacyOwner, "preserved-upload-user", "jt0191340", "Preserved name"]);
  await client.query(`INSERT INTO "ApplicationSettings" ("id","maxUploadSizeMb","maxConcurrentTranslations","updatedAt")
    VALUES ('default',17,5,now()) ON CONFLICT ("id") DO UPDATE SET "maxUploadSizeMb"=17`);
  await client.query(`INSERT INTO "TranslationJob" ("id","ownerId","fileName","fileSize","mimeType",
    "sourceLanguage","targetLanguage","selectedSheets","sourcePath","updatedAt")
    VALUES ($1,$2,'preserved.xlsx',1,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'JAPANESE','ENGLISH','["Sheet1"]','preserved.source.xlsx',now())`, [randomUUID(), legacyOwner]);
  const before = (await client.query('SELECT * FROM "User"')).rows;
  const jobsBefore = (await client.query('SELECT * FROM "TranslationJob"')).rows;
  const settingsBefore = (await client.query('SELECT * FROM "ApplicationSettings"')).rows;
  fs.cpSync(path.join(api, "prisma/migrations", migrationName),
    path.join(scratch, "migrations", migrationName), { recursive: true });
  deploy();
  assert.deepEqual((await client.query('SELECT * FROM "User"')).rows, before);
  assert.deepEqual((await client.query('SELECT * FROM "TranslationJob"')).rows, jobsBefore);
  assert.deepEqual((await client.query('SELECT * FROM "ApplicationSettings"')).rows, settingsBefore);
  const history = (await client.query(`SELECT *, to_char("publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedIso"
    FROM "ChangelogEntry" WHERE "id"=$1`,
    ["changelog-20261115-upload-session-storage-v6"])).rows[0];
  const builtIn = fs.readFileSync(path.join(api, "../web/src/features/changelog/ChangelogPage.tsx"), "utf8");
  for (const value of [history.id, history.title, history.details, history.publishedIso])
    assert.ok(builtIn.includes(value), value);
  await client.query(fs.readFileSync(path.join(api, "prisma/migrations", migrationName, "rollback.sql"), "utf8"));
  assert.deepEqual((await client.query('SELECT * FROM "User"')).rows, before);
  assert.deepEqual((await client.query('SELECT * FROM "TranslationJob"')).rows, jobsBefore);
  assert.deepEqual((await client.query('SELECT * FROM "ApplicationSettings"')).rows, settingsBefore);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "ChangelogEntry" WHERE "id"=$1', [history.id])).rows[0].count, 1);
  await client.query(fs.readFileSync(path.join(api, "prisma/migrations", migrationName, "migration.sql"), "utf8"));

  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const { PrismaService } = require("../dist/modules/persistence/prisma.service");
  const { ApplicationSettingsService } = require("../dist/modules/application-settings/application-settings.service");
  const { UploadSessionService } = require("../dist/modules/file-upload/upload-session.service");
  const prisma = new PrismaService();
  const secondPrisma = new PrismaService();
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
  t.after(async () => { await secondPrisma.$disconnect(); await prisma.$disconnect(); });
  const service = new UploadSessionService(prisma, new ApplicationSettingsService(prisma));
  const second = new UploadSessionService(secondPrisma, new ApplicationSettingsService(secondPrisma));
  const MiB = 1024 * 1024;
  const intent = (size = MiB) => ({
    clientUploadId: randomUUID(), fileName: "report.xlsx", fileSize: size,
    chunkHashes: Array(Math.ceil(size / MiB)).fill("a".repeat(64)),
  });
  const owner = async () => (await prisma.user.create({ data: { username: `upload-${randomUUID()}` } })).id;
  const total = async () => (await prisma.uploadStorageBudget.findUniqueOrThrow({ where: { id: "default" } })).reservedBytes;
  const reset = async () => {
    await prisma.uploadSession.updateMany({ where: { status: { in: ["RECEIVING", "FINALIZING"] } },
      data: { status: "CANCELLED", reservedBytes: 0 } });
    await prisma.uploadSession.updateMany({ data: { reservedBytes: 0 } });
    await prisma.uploadSession.deleteMany();
    assert.equal(await total(), 0);
  };
  const conflict = (code) => (error) => error.getStatus?.() === 409 && error.getResponse().code === code;

  await t.test("simultaneous retries replay one immutable intent across service instances", async () => {
    const id = await owner();
    const input = intent();
    const sessions = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? second : service).create(id, input)));
    assert.equal(new Set(sessions.map((session) => session.id)).size, 1);
    assert.equal(await total(), MiB);
    const saved = sessions[0];
    await assert.rejects(client.query(fs.readFileSync(path.join(api, "prisma/migrations", migrationName, "rollback.sql"), "utf8")),
      /Cannot remove upload storage with retained intents/);
    await client.query("ROLLBACK");
    assert.equal(saved.expiresAt.getTime() - saved.createdAt.getTime(), 24 * 60 * 60 * 1000);
    assert.equal(saved.bytesReceived, 0);
    assert.equal(saved.nextChunkIndex, 0);
    assert.equal(saved.status, "RECEIVING");
    assert.match(saved.completionJobId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await second.create(id, input), saved);
    assert.deepEqual(await second.create(id, { ...input, clientUploadId: input.clientUploadId.toUpperCase() }), saved);
    const restarted = execFileSync(process.execPath, ["-e", `
      const {PrismaService}=require('./dist/modules/persistence/prisma.service');
      const {ApplicationSettingsService}=require('./dist/modules/application-settings/application-settings.service');
      const {UploadSessionService}=require('./dist/modules/file-upload/upload-session.service');
      const prisma=new PrismaService();
      new UploadSessionService(prisma,new ApplicationSettingsService(prisma))
        .create(process.argv[1],JSON.parse(process.argv[2]))
        .then(session=>console.log(JSON.stringify(session)))
        .finally(()=>prisma.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
    `, id, JSON.stringify(input)], { cwd: api, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", timeout: 10000 });
    assert.deepEqual(JSON.parse(restarted), JSON.parse(JSON.stringify(saved)));
    for (const change of [{ fileName: "other.xlsx" }, { chunkHashes: ["b".repeat(64)] }, { fileSize: MiB - 1 }])
      await assert.rejects(service.create(id, { ...input, ...change }), conflict("UPLOAD_INTENT_CONFLICT"));
    await assert.rejects(service.create(id, intent()), conflict("UPLOAD_SESSION_EXISTS"));
    await assert.rejects(prisma.uploadSession.create({ data: {
      ownerId: id, ...intent(), reservedBytes: MiB, completionJobId: randomUUID(),
      createdAt: saved.createdAt, expiresAt: saved.expiresAt,
    } }), (error) => error.code === "P2002");
    await assert.rejects(prisma.user.delete({ where: { id } }));
    assert.equal(await total(), MiB);
    const other = await service.create(await owner(), input);
    assert.notEqual(other.id, saved.id);
    assert.equal(await total(), 2 * MiB);
    await reset();
  });

  await t.test("expired replay preserves its original deadline and reservation until cleanup", async () => {
    const id = await owner();
    const input = intent(1);
    const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const expired = await prisma.uploadSession.create({ data: {
      ...input, ownerId: id, reservedBytes: 1, createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
    } });
    await assert.rejects(service.create(id, input), (error) =>
      error.getStatus?.() === 410 && error.getResponse().code === "UPLOAD_EXPIRED");
    assert.deepEqual(await prisma.uploadSession.findUniqueOrThrow({ where: { id: expired.id } }), expired);
    assert.equal(await total(), 1);
    await reset();
  });

  await t.test("metadata validation and administrator limits reject before reservation", async () => {
    const id = await owner();
    for (const change of [
      { fileSize: 0 }, { fileSize: MiB + 0.5 }, { fileSize: 50 * MiB + 1 },
      { chunkHashes: [] }, { chunkHashes: ["bad"] }, { chunkHashes: ["A".repeat(64)] },
      { fileName: "../report.xlsx" }, { fileName: "report\u0000.xlsx" },
      { clientUploadId: "not-a-uuid" }, { unexpected: true },
    ]) await assert.rejects(service.create(id, { ...intent(), ...change }), (error) => error.getStatus?.() === 400);
    await assert.rejects(service.create(id, intent(17 * MiB + 1)), (error) => error.getStatus?.() === 413);
    assert.equal(await total(), 0);
    const input = intent(17 * MiB);
    const session = await service.create(id, input);
    await prisma.applicationSettings.update({ where: { id: "default" }, data: { maxUploadSizeMb: 1 } });
    assert.deepEqual(await service.create(id, input), session, "Replay does not discard saved metadata when settings change.");
    await assert.rejects(service.create(await owner(), intent(MiB + 1)), (error) => error.getStatus?.() === 413);
    await reset();
    await prisma.applicationSettings.update({ where: { id: "default" }, data: { maxUploadSizeMb: 50 } });
  });

  await t.test("concurrent distinct intents cannot exceed owner or exact 1 GiB global reservation", async () => {
    const id = await owner();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.create(id, intent())));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of results.filter((result) => result.status === "rejected"))
      assert.ok(conflict("UPLOAD_SESSION_EXISTS")(result.reason));
    await reset();
    const ids = await Promise.all(Array.from({ length: 24 }, () => owner()));
    const capacity = await Promise.allSettled(ids.map((id, index) =>
      (index % 2 ? service : second).create(id, intent(50 * MiB))));
    assert.equal(capacity.filter((result) => result.status === "fulfilled").length, 20);
    for (const result of capacity.filter((result) => result.status === "rejected"))
      assert.ok(conflict("UPLOAD_CAPACITY_BUSY")(result.reason));
    assert.equal(await total(), 1000 * MiB);
    const remainder = await service.create(await owner(), intent(24 * MiB));
    assert.equal(await total(), 1024 * MiB);
    await assert.rejects(service.create(await owner(), intent(1)), conflict("UPLOAD_CAPACITY_BUSY"));
    await prisma.uploadSession.update({ where: { id: remainder.id }, data: { status: "CANCELLED" } });
    assert.equal(await total(), 1024 * MiB, "Terminal status alone must not release uncleaned bytes.");
    await assert.rejects(service.create(remainder.ownerId, intent()), conflict("UPLOAD_SESSION_EXISTS"));
    await prisma.uploadSession.update({ where: { id: remainder.id }, data: { reservedBytes: 0 } });
    assert.equal(await total(), 1000 * MiB);
    await service.create(await owner(), intent(24 * MiB));
    await assert.rejects(prisma.uploadSession.create({ data: {
      ownerId: await owner(), ...intent(1), reservedBytes: 1, completionJobId: randomUUID(),
      createdAt: remainder.createdAt, expiresAt: remainder.expiresAt,
    } }), (error) => /UploadStorageBudget_capacity_check/.test(error.message),
    "Database capacity constraint protects direct writers too.");
    await reset();
  });

  await t.test("database invariants survive bypassed validation and transaction rollback", async () => {
    const input = intent(MiB + 7);
    const saved = await prisma.uploadSession.create({ data: {
      ...input, ownerId: await owner(), reservedBytes: input.fileSize,
    } });
    assert.deepEqual(await service.create(saved.ownerId, input), saved);
    for (const data of [
      { fileName: "changed.xlsx" }, { chunkHashes: ["b".repeat(64), "b".repeat(64)] },
      { expiresAt: new Date(saved.expiresAt.getTime() + 1) }, { completionJobId: randomUUID() },
      { bytesReceived: 1, nextChunkIndex: 1 }, { reservedBytes: 0 }, { status: "COMPLETED" },
    ]) await assert.rejects(prisma.uploadSession.update({ where: { id: saved.id }, data }));
    await assert.rejects(prisma.uploadSession.delete({ where: { id: saved.id } }));
    await assert.rejects(prisma.uploadStorageBudget.update({ where: { id: "default" }, data: { reservedBytes: 0 } }));
    await assert.rejects(prisma.uploadStorageBudget.delete({ where: { id: "default" } }));
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.uploadSession.update({ where: { id: saved.id }, data: { status: "CANCELLED", reservedBytes: 0 } });
      await tx.$queryRaw`SELECT 1 / 0`;
    }));
    assert.deepEqual(await prisma.uploadSession.findUniqueOrThrow({ where: { id: saved.id } }), saved);
    assert.equal(await total(), input.fileSize);
    await prisma.uploadSession.update({ where: { id: saved.id }, data: { nextChunkIndex: 1, bytesReceived: MiB } });
    await assert.rejects(prisma.uploadSession.update({ where: { id: saved.id }, data: { nextChunkIndex: 0, bytesReceived: 0 } }));
    await prisma.uploadSession.update({ where: { id: saved.id }, data: { nextChunkIndex: 2, bytesReceived: MiB + 7, status: "FINALIZING" } });
    await prisma.uploadSession.update({ where: { id: saved.id }, data: { status: "COMPLETED", completedAt: new Date(), reservedBytes: 0 } });
    const receipt = await second.create(saved.ownerId, input);
    assert.equal(receipt.id, saved.id);
    assert.equal(receipt.completionJobId, saved.completionJobId);
    assert.equal(receipt.status, "COMPLETED");
    assert.equal(await total(), 0);
    await assert.rejects(prisma.uploadSession.update({ where: { id: saved.id }, data: { status: "RECEIVING", reservedBytes: input.fileSize } }));
    await service.create(saved.ownerId, intent());
    await reset();
  });
});
