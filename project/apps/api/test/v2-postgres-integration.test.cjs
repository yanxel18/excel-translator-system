const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");
const { Test } = require("@nestjs/testing");
const { JwtService } = require("@nestjs/jwt");
const { PrismaService } = require("../dist/modules/persistence/prisma.service");
const {
  AdminUsersService,
} = require("../dist/modules/admin-users/admin-users.service");
const {
  AdminUsersController,
} = require("../dist/modules/admin-users/admin-users.controller");
const { BaseService } = require("../dist/modules/base-management/base.service");
const {
  BaseController,
} = require("../dist/modules/base-management/base.controller");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  AuthenticationController,
} = require("../dist/modules/authentication/authentication.controller");
const {
  KeycloakVerifierService,
} = require("../dist/modules/authentication/keycloak-verifier.service");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  AdminAuthGuard,
} = require("../dist/modules/authentication/admin-auth.guard");
const { hashPassword } = require("../dist/modules/authentication/passwords");

const url = process.env.V2_TEST_DATABASE_URL;
const api = path.resolve(__dirname, "..");
const migrations = path.join(api, "prisma", "migrations");
const changelogEntries = [
  {
    id: "changelog-20261113-v2-branding-footer",
    title: "Add application branding and a backend-year footer",
    details:
      "Added an original workbook translation mark for the header and favicon, plus a responsive localized footer using the backend-provided Asia/Tokyo calendar year. The year endpoint uses a five-minute public cache, and the footer explains when year metadata is unavailable.",
    publishedAt: "2026-11-13T08:43:13.000Z",
    migration: "20261113084313_v2_branding_footer_integration",
  },
  {
    id: "changelog-20261112-v2-search-performance",
    title: "Speed up administration search",
    details:
      "Administrator user and translation-history searches now use query-specific database indexes for faster substring searches. Existing search fields and results are unchanged.",
    publishedAt: "2026-11-12T13:30:00.000Z",
    migration: "20261112133000_v2_search_indexes",
  },
  {
    id: "changelog-20261112-v2-admin-auth-guardrails",
    title: "Protect configured administrator access",
    details:
      "OIDC administrator identity follows the provider username claim. Username edits cannot transfer local administrator access, and disabling an administrator requires another usable administrator login in the configured authentication mode.",
    publishedAt: "2026-11-12T14:10:00.000Z",
    migration: "20261112141000_v2_admin_auth_guardrails",
    migrationAssertions: [
      'ALTER TABLE "UserIdentity"',
      'ADD COLUMN "providerUsername" TEXT',
    ],
  },
];
const searchChangelogEntry = changelogEntries[0];

for (const entryData of changelogEntries) {
  test(`${entryData.id} is mirrored in built-in history and migration`, () => {
    const builtInHistory = fs.readFileSync(
      path.join(api, "../web/src/features/changelog/ChangelogPage.tsx"),
      "utf8",
    );
    const entryStart = builtInHistory.indexOf(`id: "${entryData.id}"`);
    const entryEnd = builtInHistory.indexOf("\n  },", entryStart);
    const entry = builtInHistory.slice(entryStart, entryEnd);
    const migration = fs.readFileSync(
      path.join(migrations, entryData.migration, "migration.sql"),
      "utf8",
    );
    assert.notEqual(entryStart, -1);
    assert.ok(entry.includes(entryData.title));
    assert.ok(entry.includes(entryData.details));
    assert.ok(entry.includes(`publishedAt: "${entryData.publishedAt}"`));
    assert.ok(migration.includes(`'${entryData.id}'`));
    assert.ok(migration.includes(`'${entryData.title}'`));
    assert.ok(migration.includes(`'${entryData.details}'`));
    assert.ok(migration.includes(`'${entryData.publishedAt}'`));
    for (const statement of entryData.migrationAssertions || [])
      assert.ok(migration.includes(statement));
  });
}

test(
  "populated migration and real database management integration",
  {
    skip:
      !url &&
      "Set V2_TEST_DATABASE_URL to a fresh disposable v2_disposable_test database",
    timeout: 120000,
  },
  async () => {
    const parsed = new URL(url);
    assert.ok(
      ["/v2_disposable_test", "/v2_search_index_test"].includes(
        parsed.pathname,
      ),
      "Use only an explicitly named disposable V2 test database",
    );
    assert.ok(
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname),
      "Use only a local disposable database",
    );
    process.env.DATABASE_URL = url;
    process.env.LOCAL_AUTH_ENABLED = "true";
    process.env.ADMIN_USERNAMES = "legacy-admin";
    process.env.AUTH_BOOTSTRAP_ENABLED = "false";
    const scratch = fs.mkdtempSync(path.join(__dirname, ".v2-migration-"));
    const client = new Client({ connectionString: url });
    let prisma, app;
    try {
      await client.connect();
      const existing = await client.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
      );
      assert.equal(existing.rows[0].n, 0, "Database must be empty");
      fs.mkdirSync(path.join(scratch, "migrations"));
      fs.copyFileSync(
        path.join(api, "prisma", "schema.prisma"),
        path.join(scratch, "schema.prisma"),
      );
      fs.writeFileSync(
        path.join(scratch, "prisma.config.ts"),
        "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: './schema.prisma', migrations: { path: './migrations' }, datasource: { url: process.env.V2_TEST_DATABASE_URL! } });\n",
      );
      const names = fs.readdirSync(migrations);
      const copy = (name) =>
        fs.cpSync(
          path.join(migrations, name),
          path.join(scratch, "migrations", name),
          { recursive: true },
        );
      names
        .filter(
          (n) =>
            n === "migration_lock.toml" ||
            n < "20261112013000_account_session_revocation",
        )
        .forEach(copy);
      const deploy = () =>
        execFileSync(
          process.execPath,
          [
            path.join(api, "node_modules", "prisma", "build", "index.js"),
            "migrate",
            "deploy",
            "--config",
            path.join(scratch, "prisma.config.ts"),
          ],
          { cwd: api, env: process.env, stdio: "pipe" },
        );
      deploy();
      const userId = "cedd8acb-32de-45b3-954b-31c7cbf8c923";
      const jobId = "c6fc5688-d1a7-47e7-9a77-e55d95fd12a4";
      const secret = "a long exact legacy password";
      const hash = await hashPassword(secret);
      await client.query(
        'INSERT INTO "User" (id, username, email, gid, "passwordHash", "updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
        [userId, "legacy-admin", "legacy@example.com", "OLD-1", hash],
      );
      await client.query(
        'INSERT INTO "UserIdentity" (id, provider, subject, "userId") VALUES ($1,$2,$3,$4)',
        [
          "9ef9af94-8425-4c0b-b003-577b203b877a",
          "LOCAL",
          "legacy-admin",
          userId,
        ],
      );
      await client.query(
        'INSERT INTO "TranslationJob" (id, "ownerId", "fileName", "fileSize", "mimeType", "sourceLanguage", "targetLanguage", "selectedSheets", "sourcePath", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())',
        [
          jobId,
          userId,
          "legacy.xlsx",
          1,
          "application/xlsx",
          "JAPANESE",
          "ENGLISH",
          "[]",
          "/legacy",
        ],
      );
      await client.query(
        'INSERT INTO "OidcSettings" ("id", "enabled", "keycloakUrl", "realm", "clientId", "issuerUrl", "requiredGroup", "updatedAt") VALUES ($1, true, $2, $3, $4, $5, $6, now())',
        [
          "default",
          "https://identity.example.test",
          "employees",
          "translator",
          "https://identity.example.test/realms/employees",
          "",
        ],
      );
      names
        .filter(
          (n) =>
            n !== "migration_lock.toml" &&
            n >= "20261112013000_account_session_revocation",
        )
        .forEach(copy);
      deploy();
      deploy();
      const trigramExtension = await client.query(
        "SELECT installed_version FROM pg_available_extensions WHERE name = 'pg_trgm'",
      );
      assert.ok(
        trigramExtension.rows[0]?.installed_version,
        "Search migration installs the available pg_trgm extension",
      );
      const searchIndexes = await client.query(
        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)",
        [
          [
            "User_gid_trgm_idx",
            "User_username_trgm_idx",
            "User_email_trgm_idx",
            "TranslationJob_fileName_trgm_idx",
            "TranslationJob_ownerId_createdAt_id_idx",
            "TranslationJob_owner_langs_created_id_idx",
          ],
        ],
      );
      assert.equal(
        searchIndexes.rows.length,
        6,
        "Search and history composite indexes are deployed",
      );
      assert.ok(
        searchIndexes.rows
          .filter((row) => row.indexname.endsWith("_trgm_idx"))
          .every((row) => row.indexdef.includes("gin_trgm_ops")),
      );
      const replacedHistoryIndex = await client.query(
        "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'TranslationJob_ownerId_createdAt_idx'",
      );
      assert.equal(
        replacedHistoryIndex.rowCount,
        0,
        "The wider owner/createdAt/id index replaces rather than duplicates the old prefix index",
      );
      const searchChangelog = await client.query(
        `SELECT "title", "details",
                to_char("publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "publishedAt"
         FROM "ChangelogEntry" WHERE "id" = $1`,
        [searchChangelogEntry.id],
      );
      assert.deepEqual(searchChangelog.rows[0], {
        title: searchChangelogEntry.title,
        details: searchChangelogEntry.details,
        publishedAt: searchChangelogEntry.publishedAt.slice(0, -1),
      });
      const legacy = await client.query(
        'SELECT u.id, u.enabled, u."sessionVersion", u."baseId", i."userId", j."ownerId" FROM "User" u JOIN "UserIdentity" i ON i."userId"=u.id JOIN "TranslationJob" j ON j."ownerId"=u.id WHERE u.id=$1',
        [userId],
      );
      assert.deepEqual(legacy.rows[0], {
        id: userId,
        enabled: true,
        sessionVersion: 0,
        baseId: null,
        userId,
        ownerId: userId,
      });
      const seeded = await client.query(
        'SELECT code FROM "Base" ORDER BY code',
      );
      assert.deepEqual(
        seeded.rows.map((row) => row.code),
        ["CGTY", "JTY", "KKTY", "MSTY", "PTY"],
      );
      const migratedAuthMode = await client.query(
        'SELECT "mode"::text, "enabled" FROM "OidcSettings" WHERE "id" = $1',
        ["default"],
      );
      assert.deepEqual(
        migratedAuthMode.rows[0],
        { mode: "HYBRID", enabled: true },
        "Enabled legacy OIDC config preserves both sign-in methods",
      );

      prisma = new PrismaService();
      const users = new AdminUsersService(prisma);
      const bases = new BaseService(prisma);
      const base = await prisma.base.findFirst({ where: { code: "JTY" } });
      const register = (i) =>
        users.create(
          {
            gid: `G-${i}`,
            username: `user-${i}`,
            email: i === 1 ? "SAME@example.com" : "same@example.com",
            baseId: base.id,
            password: "a sufficiently long password",
          },
          userId,
        );
      const attempts = await Promise.allSettled([register(1), register(2)]);
      assert.equal(
        attempts.filter((a) => a.status === "fulfilled").length,
        1,
        "Exactly one concurrent case-insensitive duplicate email registration succeeds",
      );
      assert.equal(
        attempts.find((a) => a.status === "rejected").reason.status,
        409,
      );
      assert.equal(
        await prisma.user.count({
          where: { email: { equals: "same@example.com", mode: "insensitive" } },
        }),
        1,
      );
      const created = attempts.find((a) => a.status === "fulfilled").value;
      assert.equal(
        await prisma.userIdentity.count({
          where: { userId: created.id, provider: "LOCAL" },
        }),
        1,
      );
      const creationAudit = await prisma.managementAudit.findFirst({
        where: { action: "USER_CREATED", targetId: created.id },
      });
      assert.equal(creationAudit.actorId, userId);
      assert.deepEqual(creationAudit.changes, {
        fields: ["gid", "username", "email", "baseId", "localCredential"],
      });
      await assert.rejects(
        users.create({
          gid: "G-invalid",
          username: "invalid-base",
          email: "invalid-base@example.com",
          baseId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          password: "a sufficiently long password",
        }),
        (error) => error.status === 400,
      );
      assert.equal(
        await prisma.user.count({ where: { username: "invalid-base" } }),
        0,
      );
      await assert.rejects(
        bases.remove(base.id, userId),
        (error) => error.status === 409,
      );
      const filtered = await users.list({
        q: "JTY",
        baseId: base.id,
        enabled: "true",
        sort: "username",
        direction: "asc",
        page: "1",
        pageSize: "10",
      });
      assert.equal(filtered.total, 1);
      assert.equal(filtered.data[0].id, created.id);
      const directTextMatch = await users.list({ q: created.username });
      assert.equal(directTextMatch.total, 1);
      assert.equal(
        directTextMatch.data[0].id,
        created.id,
        "Text search remains correct after Base matches are resolved separately",
      );
      const retainedHistory = await client.query(
        'SELECT id FROM "TranslationJob" WHERE "ownerId"=$1 AND "sourceLanguage"=$2 AND "targetLanguage"=$3 ORDER BY "createdAt" DESC, id DESC LIMIT 10',
        [userId, "JAPANESE", "ENGLISH"],
      );
      assert.deepEqual(
        retainedHistory.rows.map((row) => row.id),
        [jobId],
        "Indexed history filters preserve the expected owner-scoped result",
      );

      const jwt = new JwtService({
        secret: "disposable-integration-only",
        signOptions: { expiresIn: "10m" },
      });
      const keycloak = new KeycloakVerifierService(prisma);
      await keycloak.updateSettings(
        {
          enabled: false,
          keycloakUrl: "",
          realm: "",
          clientId: "",
          issuerUrl: "",
          requiredGroup: "",
        },
        userId,
      );
      const reloadedSettings = await new KeycloakVerifierService(
        prisma,
      ).getSettings();
      assert.equal(
        reloadedSettings.mode,
        "LOCAL",
        "Mode persists when read through a fresh service instance",
      );
      assert.equal(reloadedSettings.enabled, false);
      const auth = new AuthenticationService(jwt, prisma, keycloak);
      const authenticationAudit = await prisma.managementAudit.findFirst({
        where: {
          action: "AUTHENTICATION_SETTINGS_UPDATED",
          targetId: "default",
        },
      });
      assert.equal(authenticationAudit.actorId, userId);
      assert.deepEqual(authenticationAudit.changes, {
        fields: [
          "mode",
          "enabled",
          "keycloakUrl",
          "realm",
          "clientId",
          "issuerUrl",
          "requiredGroup",
        ],
      });
      const admin = await auth.validateUser("legacy-admin", secret);
      assert.equal(admin.isAdmin, true);
      const adminToken = (await auth.login(admin)).access_token;
      const normal = await auth.validateUser(
        created.username,
        "a sufficiently long password",
      );
      const userToken = (await auth.login(normal)).access_token;
      const moduleRef = await Test.createTestingModule({
        controllers: [
          AdminUsersController,
          BaseController,
          AuthenticationController,
        ],
        providers: [
          JwtAuthGuard,
          AdminAuthGuard,
          { provide: AuthenticationService, useValue: auth },
          { provide: KeycloakVerifierService, useValue: keycloak },
          { provide: AdminUsersService, useValue: users },
          { provide: BaseService, useValue: bases },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0);
      const baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const request = (route, token, options = {}) =>
        fetch(`${baseUrl}${route}`, {
          ...options,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
          },
        });
      assert.equal((await request("/admin/users")).status, 401);
      assert.equal((await request("/admin/users", userToken)).status, 403);
      assert.equal((await request("/admin/bases", userToken)).status, 403);
      assert.equal((await request("/admin/users", adminToken)).status, 200);
      const nextBase = await prisma.base.findFirst({ where: { code: "KKTY" } });
      const patchBase = (token, baseId) =>
        request(`/admin/users/${created.id}/base`, token, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseId }),
        });
      assert.equal((await patchBase(userToken, nextBase.id)).status, 403);
      assert.equal(
        (await patchBase(adminToken, "ffffffff-ffff-ffff-ffff-ffffffffffff"))
          .status,
        400,
      );
      assert.equal(
        (await prisma.user.findUnique({ where: { id: created.id } })).baseId,
        base.id,
      );
      assert.equal((await patchBase(adminToken, nextBase.id)).status, 200);
      assert.equal(
        (await prisma.user.findUnique({ where: { id: created.id } })).baseId,
        nextBase.id,
      );
      const assignmentAudit = await prisma.managementAudit.findFirst({
        where: { action: "USER_BASE_ASSIGNED", targetId: created.id },
      });
      assert.equal(assignmentAudit.actorId, userId);
      assert.deepEqual(assignmentAudit.changes, { fields: ["baseId"] });
      const auditedBase = await bases.create(
        { code: "AUDITX", name: "Audit test" },
        userId,
      );
      await bases.update(
        auditedBase.id,
        { name: "Audit test updated" },
        userId,
      );
      await bases.remove(auditedBase.id, userId);
      for (const [action, expectedFields] of [
        ["BASE_CREATED", ["code", "name"]],
        ["BASE_UPDATED", ["name"]],
        ["BASE_DELETED", []],
      ]) {
        const event = await prisma.managementAudit.findFirst({
          where: { action, targetId: auditedBase.id },
        });
        assert.equal(event.actorId, userId);
        assert.deepEqual(event.changes, { fields: expectedFields });
      }
      await assert.rejects(
        bases.remove(nextBase.id, userId),
        (error) => error.status === 409,
      );
      const removableActor = await prisma.user.create({
        data: { username: "audit-delete-actor" },
      });
      const retainedAudit = await prisma.managementAudit.create({
        data: {
          actorId: removableActor.id,
          action: "ACTOR_DELETE_TEST",
          targetType: "USER",
          targetId: created.id,
          changes: { fields: [] },
        },
      });
      await prisma.user.delete({ where: { id: removableActor.id } });
      const afterActorDelete = await prisma.managementAudit.findUnique({
        where: { id: retainedAudit.id },
      });
      assert.ok(afterActorDelete, "Audit event survives actor removal");
      assert.equal(
        afterActorDelete.actorId,
        null,
        "Actor FK is nulled rather than cascading the audit event",
      );

      const detailResponse = await request(
        `/admin/users/${created.id}`,
        adminToken,
      );
      assert.equal(detailResponse.status, 200);
      const detail = await detailResponse.json();
      assert.equal(detail.hasLocalPassword, true);
      assert.equal(detail.passwordHash, undefined);
      const resetPassword = "a sufficiently long reset password";
      const resetResponse = await request(
        `/admin/users/${created.id}/password`,
        adminToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: resetPassword }),
        },
      );
      assert.equal(resetResponse.status, 200);
      assert.equal((await resetResponse.json()).passwordHash, undefined);
      await assert.rejects(
        auth.verifySession(userToken),
        (error) => error.status === 401,
        "Password reset revokes the active session",
      );
      const resetUser = await auth.validateUser(
        created.username,
        resetPassword,
      );
      const resetToken = (await auth.login(resetUser)).access_token;
      const changedPassword = "a sufficiently long changed password";
      const changeResponse = await request(
        "/auth/password/change",
        resetToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: resetPassword,
            newPassword: changedPassword,
          }),
        },
      );
      assert.equal(changeResponse.status, 201);
      await assert.rejects(
        auth.verifySession(resetToken),
        (error) => error.status === 401,
        "Owner password change revokes the active session",
      );
      const changedUser = await auth.validateUser(
        created.username,
        changedPassword,
      );
      const changedToken = (await auth.login(changedUser)).access_token;
      const disableResponse = await request(
        `/admin/users/${created.id}`,
        adminToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "edited-disabled-user",
            enabled: false,
          }),
        },
      );
      assert.equal(disableResponse.status, 200);
      await assert.rejects(
        auth.verifySession(changedToken),
        (error) => error.status === 401,
        "Disabling an account revokes the active session",
      );
      assert.equal(
        await auth.validateUser("edited-disabled-user", changedPassword),
        null,
      );
      for (const action of [
        "LOCAL_PASSWORD_RESET",
        "LOCAL_PASSWORD_CHANGED",
        "USER_UPDATED",
      ]) {
        const event = await prisma.managementAudit.findFirst({
          where: { action, targetId: created.id },
        });
        assert.ok(event, `${action} audit entry exists`);
        assert.equal(JSON.stringify(event).includes(resetPassword), false);
        assert.equal(JSON.stringify(event).includes(changedPassword), false);
      }
      await prisma.user.update({
        where: { id: userId },
        data: { enabled: false },
      });
      assert.equal(
        (await request("/admin/users", adminToken)).status,
        401,
        "Disablement revokes an already-issued token",
      );
      assert.equal(await auth.validateUser("legacy-admin", secret), null);
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
      await client.end();
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  },
);
