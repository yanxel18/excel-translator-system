const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
const { JwtService } = require("@nestjs/jwt");
const { PrismaService } = require("../dist/modules/persistence/prisma.service");
const { AuthenticationService } = require("../dist/modules/authentication/authentication.service");
const { hashPassword } = require("../dist/modules/authentication/passwords");

const api = path.resolve(__dirname, "..");
const migrationName = "20261115181000_full_name_storage_limit_v6";
const migrationDir = path.join(api, "prisma/migrations", migrationName);

test("full-name storage changelog exactly matches built-in history", () => {
  const migration = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
  const history = fs.readFileSync(path.join(api, "../web/src/features/changelog/ChangelogPage.tsx"), "utf8");
  const id = "changelog-20261115-full-name-storage-limit-v6";
  const start = history.indexOf(`id: "${id}"`);
  assert.notEqual(start, -1);
  const entry = history.slice(start, history.indexOf("\n  },", start));
  for (const value of [
    id,
    "Enforce the 50-character full-name limit",
    "Stored full names are limited to 50 Unicode characters. OIDC sign-in rejects longer provider names and asks you to shorten your provider profile name. Existing accounts and names are never truncated or silently discarded.",
    "2026-11-15T09:10:00.000Z",
  ]) {
    assert.ok(migration.includes(value), value);
    assert.ok(entry.includes(value), value);
  }
});

// Opt-in only. This test creates its own local container; it never accepts a DB URL.
test("safe full-name migration, Unicode writes and reversal on disposable PostgreSQL", {
  skip: process.env.V6_DISPOSABLE_POSTGRES !== "true" && "Set V6_DISPOSABLE_POSTGRES=true to create an isolated container",
  timeout: 120000,
}, async () => {
  const forward = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(migrationDir, "rollback.sql"), "utf8");
  const name = `v6-fullname-test-${process.pid}-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000 });
  let containerId, client, scratch, prisma;
  const previousEnv = Object.fromEntries(["DATABASE_URL", "LOCAL_AUTH_ENABLED", "AUTH_BOOTSTRAP_ENABLED"].map((key) => [key, process.env[key]]));
  try {
    containerId = docker("run", "--rm", "--detach", "--name", name,
      "--label", `v6-fullname-test-owner=${name}`,
      "-e", `POSTGRES_PASSWORD=${password}`,
      "-e", "POSTGRES_DB=v6_full_name_disposable",
      "-p", "127.0.0.1::5432", "postgres:16-alpine").trim();
    const binding = docker("port", containerId, "5432/tcp").trim();
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    // TCP readiness excludes the image's temporary socket-only initialization server.
    for (let attempt = 0; ; attempt++) {
      try {
        docker("exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "v6_full_name_disposable");
        break;
      } catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const url = `postgresql://postgres:${password}@${binding}/v6_full_name_disposable`;
    scratch = fs.mkdtempSync(path.join(__dirname, ".v6-fullname-"));
    fs.copyFileSync(path.join(api, "prisma/schema.prisma"), path.join(scratch, "schema.prisma"));
    fs.mkdirSync(path.join(scratch, "migrations"));
    for (const entry of fs.readdirSync(path.join(api, "prisma/migrations"))) {
      if (entry !== migrationName) {
        fs.cpSync(path.join(api, "prisma/migrations", entry), path.join(scratch, "migrations", entry), { recursive: true });
      }
    }
    fs.writeFileSync(path.join(scratch, "prisma.config.ts"),
      "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: './schema.prisma', migrations: { path: './migrations' }, datasource: { url: process.env.V6_ISOLATED_URL! } });\n");
    const deploy = () => execFileSync(process.execPath, [
      path.join(api, "node_modules/prisma/build/index.js"), "migrate", "deploy",
      "--config", path.join(scratch, "prisma.config.ts"),
    ], { cwd: api, env: { ...process.env, V6_ISOLATED_URL: url }, timeout: 60000, stdio: "pipe" });
    deploy();
    client = new Client({ connectionString: url });
    await client.connect();
    assert.equal((await client.query("SHOW server_encoding")).rows[0].server_encoding, "UTF8");
    const baseId = randomUUID();
    const userId = randomUUID();
    const longId = randomUUID();
    await client.query('INSERT INTO "Base" ("id","code","name","updatedAt") VALUES ($1,$2,$3,now())', [baseId, "V6TEST", "Test base"]);
    const insert = (id, fullName) => client.query(
      'INSERT INTO "User" ("id","username","fullName","baseId","updatedAt") VALUES ($1,$1,$2,$3,now())',
      [id, fullName, baseId]);
    await insert(userId, "𠮷".repeat(50));
    await insert(longId, "𠮷".repeat(51));
    await client.query('UPDATE "User" SET "passwordHash"=$1 WHERE "id"=$2', [await hashPassword("disposable-password"), userId]);
    await client.query('INSERT INTO "UserIdentity" ("id","provider","subject","userId") VALUES ($1,\'LOCAL\',$2,$2),($3,\'KEYCLOAK\',\'stable-subject\',$2)',
      [randomUUID(), userId, randomUUID()]);
    process.env.DATABASE_URL = url;
    process.env.LOCAL_AUTH_ENABLED = "true";
    process.env.AUTH_BOOTSTRAP_ENABLED = "false";
    prisma = new PrismaService();
    let claims = { sub: "stable-subject", name: "𠮷".repeat(50), preferred_username: "provider-login" };
    const auth = new AuthenticationService(new JwtService({ secret: randomUUID() }), prisma, {
      verify: async () => claims,
      getSettings: async () => ({ mode: "HYBRID" }),
    });
    assert.equal((await auth.validateUser(userId, "disposable-password")).userId, userId);
    const snapshot = async () => ({
      users: (await client.query('SELECT * FROM "User" ORDER BY "id"')).rows,
      identities: (await client.query('SELECT * FROM "UserIdentity" ORDER BY "id"')).rows,
      bases: (await client.query('SELECT * FROM "Base" ORDER BY "id"')).rows,
    });
    const before = await snapshot();
    await assert.rejects(client.query(forward), (error) =>
      error.code === "23514" && /1 existing full name.*50 Unicode code points/.test(error.message));
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), before);
    assert.equal((await client.query("SELECT 1 FROM pg_constraint WHERE conname='User_fullName_code_points_check'")).rowCount, 0);
    assert.equal((await client.query('SELECT 1 FROM "ChangelogEntry" WHERE "id"=$1',
      ["changelog-20261115-full-name-storage-limit-v6"])).rowCount, 0);
    // Remediation occurs only in this disposable fixture, never against a user's database.
    await client.query('UPDATE "User" SET "fullName"=NULL WHERE "id"=$1', [longId]);
    const validBefore = await snapshot();
    fs.cpSync(migrationDir, path.join(scratch, "migrations", migrationName), { recursive: true });
    deploy();
    assert.deepEqual(await snapshot(), validBefore);
    assert.equal((await auth.validateUser(userId, "disposable-password")).userId, userId);
    const session = await auth.exchangeKeycloakToken("provider-token");
    assert.equal((await auth.verifySession(session.access_token)).userId, userId);
    assert.equal((await prisma.user.findUnique({ where: { id: userId } })).username, userId);
    const beforeRejectedOidc = await snapshot();
    claims = { ...claims, name: "𠮷".repeat(51) };
    await assert.rejects(auth.exchangeKeycloakToken("provider-token"), /Shorten your full name/);
    assert.deepEqual(await snapshot(), beforeRejectedOidc);
    claims = { sub: "new-subject", name: "𠮷".repeat(50), preferred_username: "new-provider" };
    await auth.exchangeKeycloakToken("provider-token");
    assert.equal((await prisma.user.findUnique({ where: { username: "keycloak-new-subject" } })).fullName, claims.name);
    const beforeRejectedCreate = await snapshot();
    claims = { ...claims, sub: "rejected-subject", name: "𠮷".repeat(51) };
    await assert.rejects(auth.exchangeKeycloakToken("provider-token"), /Shorten your full name/);
    assert.deepEqual(await snapshot(), beforeRejectedCreate);
    await assert.rejects(prisma.user.update({
      where: { id: userId }, data: { fullName: "𠮷".repeat(51) },
    }));
    assert.equal((await client.query("SELECT convalidated FROM pg_constraint WHERE conname='User_fullName_code_points_check'")).rows[0].convalidated, true);
    const cases = [null, "", "a".repeat(50), "山".repeat(50), "𠮷".repeat(50), "e\u0301".repeat(25)];
    for (const value of cases) {
      const id = randomUUID();
      await insert(id, value);
      assert.equal((await client.query('SELECT "fullName" FROM "User" WHERE "id"=$1', [id])).rows[0].fullName, value);
    }
    for (const value of ["a".repeat(51), "山".repeat(51), "𠮷".repeat(51), "e\u0301".repeat(25) + "a", "a".repeat(50) + " "]) {
      const isConstraintError = (error) => error.code === "23514" && error.constraint === "User_fullName_code_points_check";
      await assert.rejects(insert(randomUUID(), value), isConstraintError);
      await assert.rejects(client.query('UPDATE "User" SET "fullName"=$1 WHERE "id"=$2', [value, userId]), isConstraintError);
    }
    const beforeRollback = await snapshot();
    await client.query(rollback);
    assert.deepEqual(await snapshot(), beforeRollback);
    // Historical changelog is retained during rollback.
    assert.equal((await client.query('SELECT 1 FROM "ChangelogEntry" WHERE "id"=$1',
      ["changelog-20261115-full-name-storage-limit-v6"])).rowCount, 1);
    await client.query("BEGIN");
    await client.query('UPDATE "User" SET "fullName"=$1 WHERE "id"=$2', ["𠮷".repeat(51), userId]);
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), beforeRollback);
  } finally {
    if (prisma) await prisma.$disconnect();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (client) await client.end();
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    if (containerId) {
      assert.equal(docker("inspect", "--format", '{{index .Config.Labels "v6-fullname-test-owner"}}', containerId).trim(), name);
      docker("rm", "--force", "--volumes", containerId);
    }
  }
});
