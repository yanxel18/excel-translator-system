const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
const { JwtService } = require("@nestjs/jwt");
const { Test } = require("@nestjs/testing");
const { PrismaService } = require("../dist/modules/persistence/prisma.service");
const { BaseService } = require("../dist/modules/base-management/base.service");
const { BaseController } = require("../dist/modules/base-management/base.controller");
const { AdminUsersService } = require("../dist/modules/admin-users/admin-users.service");
const { AdminUsersController } = require("../dist/modules/admin-users/admin-users.controller");
const { JwtAuthGuard } = require("../dist/modules/authentication/jwt-auth.guard");
const { AdminAuthGuard } = require("../dist/modules/authentication/admin-auth.guard");
const { KeycloakVerifierService } = require("../dist/modules/authentication/keycloak-verifier.service");
const { AuthenticationService } = require("../dist/modules/authentication/authentication.service");
const { hashPassword } = require("../dist/modules/authentication/passwords");

const api = path.resolve(__dirname, "..");
const migrationName = "20261115183000_base_primary_key_v6";
const validationName = "20261115183100_validate_base_compatibility_fk_v6";
const migrationDir = path.join(api, "prisma/migrations", migrationName);
const historyValues = [
  "changelog-20261115-base-primary-key-v6",
  "Use factory acronyms as base primary keys",
  "Factory acronyms now identify bases in storage. Existing UUID-based API requests and user assignments remain compatible; editing an acronym preserves every assigned user and account identity. Duplicate acronyms and deletion of assigned bases remain blocked.",
  "2026-11-15T09:30:00.000Z",
];

test("base primary key Prisma mapping and changelog are exact", () => {
  const schema = fs.readFileSync(path.join(api, "prisma/schema.prisma"), "utf8");
  const base = schema.match(/model Base \{([\s\S]*?)\n\}/)[1];
  assert.match(base, /id\s+String\s+@unique\(map: "Base_id_key"\)\s+@default\(uuid\(\)\)/);
  assert.match(base, /code\s+String\s+@id\(map: "Base_pkey"\)/);
  assert.match(schema, /base\s+Base\?\s+@relation\(fields: \[baseId\], references: \[id\], onDelete: Restrict/);
  const sql = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
  const history = fs.readFileSync(path.join(api, "../web/src/features/changelog/ChangelogPage.tsx"), "utf8");
  const start = history.indexOf(`id: "${historyValues[0]}"`);
  assert.notEqual(start, -1);
  const entry = history.slice(start, history.indexOf("\n  },", start));
  for (const value of historyValues) {
    assert.ok(sql.includes(value), value);
    assert.ok(entry.includes(value), value);
  }
});

// Never accepts DATABASE_URL or reuses a Compose service/volume.
test("populated prior-schema upgrade, key reversal, identities and concurrent writes", {
  skip: process.env.V6_DISPOSABLE_POSTGRES !== "true" && "Set V6_DISPOSABLE_POSTGRES=true",
  timeout: 180000,
}, async (t) => {
  const forward = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(migrationDir, "rollback.sql"), "utf8");
  const validate = fs.readFileSync(path.join(api, "prisma/migrations", validationName, "migration.sql"), "utf8");
  const name = `v6-base-test-${process.pid}-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: "pipe" });
  const envKeys = ["DATABASE_URL", "LOCAL_AUTH_ENABLED", "AUTH_BOOTSTRAP_ENABLED", "ADMIN_USERNAMES"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let containerId, client, blocker, scratch, prisma, oldPrisma, app;
  try {
    containerId = docker("run", "--pull=never", "--rm", "--detach", "--name", name,
      "--label", `v6-base-test-owner=${name}`, "-e", `POSTGRES_PASSWORD=${password}`,
      "-e", "POSTGRES_DB=v6_base_disposable", "-p", "127.0.0.1::5432", "postgres:16-alpine").trim();
    const binding = docker("port", containerId, "5432/tcp").trim();
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    for (let attempt = 0; ; attempt++) {
      try {
        docker("exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "v6_base_disposable");
        break;
      } catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const url = `postgresql://postgres:${password}@${binding}/v6_base_disposable`;
    scratch = fs.mkdtempSync(path.join(__dirname, ".v6-base-"));
    fs.mkdirSync(path.join(scratch, "migrations"));
    const schema = fs.readFileSync(path.join(api, "prisma/schema.prisma"), "utf8");
    // Generate a genuinely prior-schema client as well as deploying prior migrations.
    const oldSchema = schema.replace(
      /id\s+String\s+@unique\(map: "Base_id_key"\)\s+@default\(uuid\(\)\)/,
      "id String @id @default(uuid())",
    ).replace(/code\s+String\s+@id\(map: "Base_pkey"\)/, "code String @unique")
      .replace('output   = "../src/generated/prisma"', 'output   = "./old-client"')
      .replace('provider = "prisma-client"', 'provider = "prisma-client-js"');
    fs.writeFileSync(path.join(scratch, "schema.prisma"), oldSchema);
    fs.writeFileSync(path.join(scratch, "prisma.config.ts"),
      "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: './schema.prisma', migrations: { path: './migrations' }, datasource: { url: process.env.V6_ISOLATED_URL! } });\n");
    for (const entry of fs.readdirSync(path.join(api, "prisma/migrations"))) {
      if (entry === "migration_lock.toml" || entry < migrationName) {
        fs.cpSync(path.join(api, "prisma/migrations", entry), path.join(scratch, "migrations", entry), { recursive: true });
      }
    }
    const cli = (...args) => execFileSync(process.execPath, [
      path.join(api, "node_modules/prisma/build/index.js"), ...args,
      "--config", path.join(scratch, "prisma.config.ts"),
    ], { cwd: api, env: { ...process.env, V6_ISOLATED_URL: url }, timeout: 60000, stdio: "pipe" });
    cli("migrate", "deploy");
    cli("generate");
    const { PrismaClient } = require(path.join(scratch, "old-client"));
    const { PrismaPg } = require("@prisma/adapter-pg");
    oldPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    client = new Client({ connectionString: url });
    blocker = new Client({ connectionString: url });
    await client.connect();
    await blocker.connect();
    process.env.DATABASE_URL = url;
    process.env.LOCAL_AUTH_ENABLED = "true";
    process.env.AUTH_BOOTSTRAP_ENABLED = "false";
    process.env.ADMIN_USERNAMES = "v6-admin";
    prisma = new PrismaService();
    const base = await oldPrisma.base.create({ data: { code: "V6BASE", name: "Preserved name" } });
    const actorId = randomUUID();
    const userId = randomUUID();
    const localPassword = "disposable-base-password";
    await oldPrisma.user.create({ data: {
      id: actorId, username: "v6-admin", passwordHash: await hashPassword(localPassword),
    } });
    await oldPrisma.user.create({ data: {
      id: userId, username: "legacy-user", gid: "Legacy-GID", fullName: "山田𠮷",
      email: "legacy@example.test", baseId: base.id, passwordHash: await hashPassword(localPassword),
      identities: { create: [
        { provider: "LOCAL", subject: "legacy-user" },
        { provider: "KEYCLOAK", subject: "stable-sub", providerUsername: "provider-user" },
      ] },
    } });
    await oldPrisma.user.create({ data: { username: "second-assigned", baseId: base.id } });
    const bases = new BaseService(prisma);
    const auth = new AuthenticationService(new JwtService({ secret: randomUUID() }), prisma, {
      verify: async () => ({ sub: "stable-sub", preferred_username: "provider-user", name: "山田𠮷" }),
      getSettings: async () => ({ mode: "HYBRID" }),
    });
    const snapshot = async () => ({
      bases: (await client.query('SELECT * FROM "Base" ORDER BY "id"')).rows,
      users: (await client.query('SELECT * FROM "User" ORDER BY "id"')).rows,
      identities: (await client.query('SELECT * FROM "UserIdentity" ORDER BY "id"')).rows,
      audits: (await client.query('SELECT * FROM "ManagementAudit" ORDER BY "id"')).rows,
    });
    const pk = async () => (await client.query(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='\"Base\"'::regclass AND contype='p'",
    )).rows[0].definition;
    const assertLogin = async () => {
      assert.equal((await auth.validateUser("legacy-user", localPassword)).userId, userId);
      const session = await auth.exchangeKeycloakToken("provider-token");
      assert.equal((await auth.verifySession(session.access_token)).userId, userId);
      assert.equal((await prisma.user.findUnique({ where: { id: userId } })).baseId, base.id);
    };
    await assertLogin();
    const before = await snapshot();
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    assert.equal((await client.query("SELECT convalidated FROM pg_constraint WHERE conname='User_baseId_fkey'")).rows[0].convalidated, true);
    // Contention must fail without changing keys, data, FK or changelog.
    await blocker.query("BEGIN");
    await blocker.query('SELECT * FROM "User" LIMIT 1');
    await assert.rejects(client.query(forward), (error) => error.code === "55P03");
    await client.query("ROLLBACK");
    await blocker.query("ROLLBACK");
    assert.deepEqual(await snapshot(), before);
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    // Conflicting legacy codes: remove only fixture indexes, never real data.
    await client.query('DROP INDEX "Base_code_case_insensitive_key"');
    const conflict = await oldPrisma.base.create({ data: { code: "v6base", name: "Conflict fixture" } });
    const conflicted = await snapshot();
    await assert.rejects(client.query(forward), (error) => error.code === "23505" && /acronym/.test(error.message));
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), conflicted);
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    await oldPrisma.base.delete({ where: { id: conflict.id } });
    await client.query('CREATE UNIQUE INDEX "Base_code_case_insensitive_key" ON "Base" (upper("code"))');
    // Invalid legacy code is rejected, not normalized or truncated.
    await client.query('UPDATE "Base" SET "code"=$1 WHERE "id"=$2', ["bad code", base.id]);
    const invalid = await snapshot();
    await assert.rejects(client.query(forward), (error) => error.code === "23514");
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), invalid);
    await client.query('UPDATE "Base" SET "code"=$1 WHERE "id"=$2', [base.code, base.id]);
    // A previously unknown dependent FK blocks cutover, never CASCADE-drops it.
    await client.query('CREATE TABLE "UnexpectedBaseRef" ("baseId" TEXT REFERENCES "Base"("id"))');
    await assert.rejects(client.query(forward), /unexpected.*foreign key/i);
    await client.query("ROLLBACK");
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    await client.query('DROP TABLE "UnexpectedBaseRef"');
    // Inject a late server-side error after structural DDL to prove full cutover rollback.
    const preError = await snapshot();
    await assert.rejects(client.query(forward.replace("COMMIT;", "SELECT 1/0;\nCOMMIT;")),
      (error) => error.code === "22012");
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), preError);
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    assert.equal((await client.query("SELECT 1 FROM pg_indexes WHERE indexname='Base_id_key'")).rowCount, 0);
    assert.equal((await client.query('SELECT 1 FROM "ChangelogEntry" WHERE "id"=$1', [historyValues[0]])).rowCount, 0);
    // Validation lock failure is separately atomic; the cutover remains enforced.
    await client.query(forward);
    assert.equal((await client.query("SELECT convalidated FROM pg_constraint WHERE conname='User_baseId_fkey'")).rows[0].convalidated, false);
    await blocker.query("BEGIN");
    await blocker.query('LOCK TABLE "User" IN SHARE UPDATE EXCLUSIVE MODE');
    await assert.rejects(client.query(validate), (error) => error.code === "55P03");
    await client.query("ROLLBACK");
    await blocker.query("ROLLBACK");
    assert.equal(await pk(), 'PRIMARY KEY (code)');
    await assert.rejects(client.query('UPDATE "User" SET "baseId"=$1 WHERE "id"=$2', [randomUUID(), userId]),
      (error) => error.code === "23503");
    await client.query(rollback);
    await client.query(validate);
    // Rollback retains history; clear only this disposable rehearsal's history so
    // the unchanged migration can be exercised through Prisma deploy below.
    await client.query('DELETE FROM "ChangelogEntry" WHERE "id"=$1', [historyValues[0]]);
    // Real Prisma deploy upgrade from populated prior schema.
    const preDeploy = await snapshot();
    fs.cpSync(migrationDir, path.join(scratch, "migrations", migrationName), { recursive: true });
    fs.cpSync(path.join(api, "prisma/migrations", validationName), path.join(scratch, "migrations", validationName), { recursive: true });
    await blocker.query("BEGIN");
    await blocker.query('SELECT * FROM "User" LIMIT 1');
    // Prisma 7 can mask the original 55P03 with 25P02 while attempting to
    // record an error inside our aborted explicit transaction. State is the proof.
    assert.throws(() => cli("migrate", "deploy"), (error) =>
      error.status !== 0 && String(error.stderr).includes(migrationName)
      && /lock timeout|current transaction is aborted/.test(String(error.stderr)));
    await blocker.query("ROLLBACK");
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    assert.deepEqual(await snapshot(), preDeploy);
    const failedMigration = (await client.query('SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1 ORDER BY started_at DESC LIMIT 1', [migrationName])).rows[0];
    assert.equal(failedMigration.finished_at, null);
    assert.equal(failedMigration.rolled_back_at, null);
    cli("migrate", "resolve", "--rolled-back", migrationName);
    cli("migrate", "deploy");
    assert.deepEqual(await snapshot(), preDeploy);
    assert.equal(await pk(), 'PRIMARY KEY (code)');
    const fk = (await client.query("SELECT convalidated, confdeltype, confupdtype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='User_baseId_fkey'")).rows[0];
    assert.equal(fk.convalidated, true);
    assert.equal(fk.confdeltype, "r");
    assert.equal(fk.confupdtype, "c");
    assert.match(fk.definition, /REFERENCES "Base"\(id\)/);
    await assertLogin();
    // Real HTTP boundary with the actual auth guards, services and PostgreSQL.
    const users = new AdminUsersService(prisma);
    const moduleRef = await Test.createTestingModule({
      controllers: [BaseController, AdminUsersController],
      providers: [
        JwtAuthGuard, AdminAuthGuard,
        { provide: BaseService, useValue: bases },
        { provide: AdminUsersService, useValue: users },
        { provide: AuthenticationService, useValue: auth },
        { provide: KeycloakVerifierService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    const httpUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const adminToken = (await auth.login(await auth.validateUser("v6-admin", localPassword))).access_token;
    const normalToken = (await auth.login(await auth.validateUser("legacy-user", localPassword))).access_token;
    const request = (route, method = "GET", body, token = adminToken) => fetch(`${httpUrl}${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal((await request("/admin/bases", "GET", undefined, normalToken)).status, 403);
    assert.equal((await request("/admin/bases", "GET", undefined, "")).status, 401);
    const apiRename = await request(`/admin/bases/${base.id}`, "PATCH", { code: "v6http" });
    assert.equal(apiRename.status, 200);
    assert.equal((await apiRename.json()).id, base.id);
    const detail = await request(`/admin/users/${userId}`);
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.baseId, base.id);
    assert.equal(detailBody.base.code, "V6HTTP");
    assert.equal((await request(`/admin/bases/${base.id}`, "PATCH", { code: "JTY" })).status, 409);
    assert.equal((await request(`/admin/bases/${base.id}`, "DELETE")).status, 409);
    assert.equal((await request(`/admin/bases/${base.id}`, "PATCH", { id: randomUUID() })).status, 400);
    // Assignment, creation and search continue accepting UUIDs, not acronyms.
    const createdResponse = await request("/admin/users", "POST", {
      username: "http-created", gid: "HTTP-GID", email: "http@example.test",
      baseId: base.id, password: localPassword,
    });
    assert.equal(createdResponse.status, 201);
    const createdUser = await createdResponse.json();
    assert.equal(createdUser.baseId, base.id);
    assert.equal((await auth.validateUser("http-created", localPassword)).userId, createdUser.id);
    assert.equal((await request(`/admin/users/${createdUser.id}/base`, "PATCH", { baseId: base.id })).status, 200);
    const filtered = await request(`/admin/users?q=V6HTTP&baseId=${base.id}`);
    assert.equal(filtered.status, 200);
    assert.ok((await filtered.json()).data.some((item) => item.id === userId));
    assert.equal((await oldPrisma.user.findUnique({ where: { id: userId }, include: { base: true } })).base.code, "V6HTTP");
    assert.equal((await bases.list({})).data.find((item) => item.id === base.id).name, base.name);
    // Existing UUID clients and new primary-key clients can both rename the acronym.
    const assignedBefore = (await snapshot()).users;
    await oldPrisma.base.update({ where: { id: base.id }, data: { code: "V6OLD" } });
    const renamed = await bases.update(base.id, { code: "v6new" }, actorId);
    assert.equal(renamed.code, "V6NEW");
    assert.equal(renamed.id, base.id);
    assert.deepEqual((await snapshot()).users, assignedBefore);
    assert.equal((await prisma.base.findUnique({ where: { code: "V6NEW" }, include: { users: true } })).users.length, 3);
    await assertLogin();
    await assert.rejects(bases.update(base.id, { code: "JTY" }, actorId), (error) => error.getStatus() === 409);
    await assert.rejects(bases.remove(base.id, actorId), (error) => error.getStatus() === 409);
    await assert.rejects(prisma.base.update({ where: { id: base.id }, data: { id: randomUUID() } }));
    await assert.rejects(client.query('UPDATE "Base" SET "id"=$1 WHERE "id"=$2', [randomUUID(), base.id]),
      (error) => error.code === "23514");
    await assert.rejects(client.query('INSERT INTO "Base" ("id","code","name","updatedAt") VALUES ($1,\'v6new\',\'duplicate\',now())', [randomUUID()]),
      (error) => error.code === "23505");
    const races = await Promise.allSettled([
      bases.create({ code: "RACE", name: "One" }, actorId),
      bases.create({ code: "race", name: "Two" }, actorId),
    ]);
    assert.equal(races.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(races.find((result) => result.status === "rejected").reason.getStatus(), 409);
    // Actual overlapping insert/delete transactions: FK waits then restricts delete.
    const raceBase = await bases.create({ code: "ASSIGNRACE", name: "Race" }, actorId);
    await blocker.query("BEGIN");
    await blocker.query('INSERT INTO "User" ("id","username","baseId","updatedAt") VALUES ($1,$1,$2,now())', [randomUUID(), raceBase.id]);
    const deleting = bases.remove(raceBase.id, actorId).then(
      () => ({ deleted: true }), (error) => ({ error }),
    );
    for (let attempt = 0; ; attempt++) {
      const waiting = await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%DELETE%'");
      if (waiting.rowCount) break;
      assert.ok(attempt < 100, "Delete must wait for the uncommitted assignment");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await blocker.query("COMMIT");
    assert.equal((await deleting).error.getStatus(), 409);
    const beforeRollback = await snapshot();
    // Rollback also fails atomically under contention.
    await blocker.query("BEGIN");
    await blocker.query('SELECT * FROM "Base" LIMIT 1');
    await assert.rejects(client.query(rollback), (error) => error.code === "55P03");
    await client.query("ROLLBACK");
    await blocker.query("ROLLBACK");
    assert.equal(await pk(), 'PRIMARY KEY (code)');
    assert.deepEqual(await snapshot(), beforeRollback);
    await client.query(rollback);
    await client.query(validate);
    assert.equal(await pk(), 'PRIMARY KEY (id)');
    assert.deepEqual(await snapshot(), beforeRollback);
    await assertLogin();
    // Both clients still operate after reversal, including code uniqueness and RESTRICT.
    await oldPrisma.base.update({ where: { id: base.id }, data: { code: "V6BACK" } });
    assert.equal((await prisma.base.findUnique({ where: { code: "V6BACK" } })).id, base.id);
    await assert.rejects(bases.remove(base.id, actorId), (error) => error.getStatus() === 409);
    await assert.rejects(oldPrisma.base.create({ data: { code: "V6BACK", name: "Duplicate" } }),
      (error) => error.code === "P2002");
    assert.equal((await client.query('SELECT 1 FROM "ChangelogEntry" WHERE "id"=$1', [historyValues[0]])).rowCount, 1);
    assert.equal((await request(`/admin/users/${userId}`)).status, 200);
    assert.equal((await request(`/admin/bases/${base.id}`, "DELETE")).status, 409);
    t.diagnostic("PostgreSQL 16: populated Prisma deploy, old/new clients, local/OIDC, forward/rollback, conflict/error/lock and concurrency checks passed.");
  } finally {
    if (app) await app.close();
    if (blocker) { await blocker.query("ROLLBACK"); await blocker.end(); }
    if (prisma) await prisma.$disconnect();
    if (oldPrisma) await oldPrisma.$disconnect();
    if (client) await client.end();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    if (containerId) {
      assert.equal(docker("inspect", "--format", '{{index .Config.Labels "v6-base-test-owner"}}', containerId).trim(), name);
      docker("rm", "--force", "--volumes", containerId);
    }
  }
});
