const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { BadRequestException, ConflictException } = require("@nestjs/common");
const {
  AdminUsersService,
} = require("../dist/modules/admin-users/admin-users.service");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  hashPassword,
} = require("../dist/modules/authentication/passwords");
const { BaseService } = require("../dist/modules/base-management/base.service");

const userId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";
const baseId = "d5a04720-d839-4d8c-bfc2-d6310970bca1";
const userInput = {
  username: "legacy-user",
  fullName: "Legacy User",
  email: "legacy@example.com",
  baseId,
  password: "correct horse battery",
};

function adminFixture({ duplicate = null } = {}) {
  let created;
  const queries = [];
  const tx = {
    base: { findUnique: async () => ({ id: baseId }) },
    user: {
      findFirst: async (query) => {
        queries.push(query);
        return duplicate;
      },
      create: async ({ data }) => {
        created = data;
        return {
          id: userId,
          ...data,
          gid: data.gid ?? null,
          fullName: data.fullName ?? null,
          enabled: true,
        };
      },
    },
    managementAudit: { create: async () => undefined },
  };
  return {
    service: new AdminUsersService({
      $transaction: async (callback) => callback(tx),
    }),
    queries,
    created: () => created,
  };
}

test("user input preserves UTF-16 identifier limits and the 50-code-point full-name limit", async () => {
  const { service, created } = adminFixture();
  const username = "𠮷".repeat(50);
  const gid = "𠮷".repeat(32);
  const fullName = "𠮷".repeat(50);

  const result = await service.create(
    {
      username: ` ${username} `,
      gid: ` ${gid} `,
      fullName,
      email: "person@example.com",
      baseId,
      password: userInput.password,
    },
    "admin-id",
  );

  assert.equal(result.username, username);
  assert.equal(result.gid, gid);
  assert.equal(result.fullName, fullName);
  assert.equal(created().username, username);
  assert.equal(created().gid, gid);
  await assert.rejects(
    service.create(
      { ...userInput, username: "𠮷".repeat(51) },
      "admin-id",
    ),
    BadRequestException,
  );
  await assert.rejects(
    service.create(
      { ...userInput, gid: "𠮷".repeat(33) },
      "admin-id",
    ),
    BadRequestException,
  );
  await assert.rejects(
    service.create(
      { ...userInput, fullName: "𠮷".repeat(51) },
      "admin-id",
    ),
    BadRequestException,
  );
});

test("legacy create payloads retain the login username and optional full name", async () => {
  const { service, created } = adminFixture();
  const result = await service.create(
    {
      gid: " LEGACY-123 ",
      username: "existing.login",
      email: userInput.email,
      baseId,
      password: userInput.password,
    },
    "admin-id",
  );

  assert.equal(result.username, "existing.login");
  assert.equal(created().username, "existing.login");
  assert.equal(created().gid, "LEGACY-123");
  assert.equal(created().fullName, undefined);
  assert.equal(result.fullName, null);
});

test("username collisions retain exact-case login semantics and return conflict", async () => {
  const duplicate = adminFixture({ duplicate: { id: "another-user" } });
  await assert.rejects(
    duplicate.service.create(userInput, "admin-id"),
    ConflictException,
  );
  assert.deepEqual(duplicate.queries[0].where.OR, [
    { username: "legacy-user" },
    { email: { equals: "legacy@example.com", mode: "insensitive" } },
  ]);

  const caseVariant = adminFixture();
  const result = await caseVariant.service.create(
    { ...userInput, username: "Legacy-User" },
    "admin-id",
  );
  assert.equal(result.username, "Legacy-User");
  assert.deepEqual(caseVariant.queries[0].where.OR[0], {
    username: "Legacy-User",
  });
});

test("legacy GID collisions compare trimmed values without case sensitivity", async () => {
  const duplicate = adminFixture({ duplicate: { id: "another-user" } });
  await assert.rejects(
    duplicate.service.create(
      { ...userInput, gid: "  legacy-123  " },
      "admin-id",
    ),
    ConflictException,
  );
  assert.deepEqual(duplicate.queries[0].where.OR, [
    { gid: { equals: "legacy-123", mode: "insensitive" } },
    { username: "legacy-user" },
    { email: { equals: "legacy@example.com", mode: "insensitive" } },
  ]);
});

test("username input preserves internal whitespace, case, and Unicode normalization form", async () => {
  const { service, queries } = adminFixture();
  const inputs = [" User Name ", "\u00e9", "e\u0301"];
  const stored = [];
  for (const username of inputs) {
    const result = await service.create(
      { ...userInput, username },
      "admin-id",
    );
    stored.push(result.username);
  }

  assert.deepEqual(stored, ["User Name", "\u00e9", "e\u0301"]);
  assert.equal(queries[0].where.OR[0].username, "User Name");
  assert.equal(queries[1].where.OR[0].username, "\u00e9");
  assert.equal(queries[2].where.OR[0].username, "e\u0301");
});

test("administrator username updates use the same UTF-16 length boundary", async () => {
  const updates = [];
  const current = {
    id: userId,
    username: "legacy-user",
    gid: "LEGACY-123",
    fullName: "Legacy User",
    email: "legacy@example.com",
    baseId,
    enabled: true,
    sessionVersion: 0,
    passwordHash: null,
    base: null,
    identities: [],
  };
  const tx = {
    user: {
      findUnique: async () => current,
      findFirst: async () => null,
      update: async ({ data }) => {
        updates.push(data);
        return { ...current, ...data, identities: [] };
      },
    },
    userIdentity: { updateMany: async () => ({ count: 0 }) },
    managementAudit: { create: async () => undefined },
  };
  const service = new AdminUsersService({
    $transaction: async (callback) => callback(tx),
  });
  await service.update(
    userId,
    { username: "𠮷".repeat(50) },
    "admin-id",
  );
  assert.equal(updates[0].username, "𠮷".repeat(50));
  await assert.rejects(
    service.update(
      userId,
      { username: "𠮷".repeat(51) },
      "admin-id",
    ),
    BadRequestException,
  );
});

test("local login continues to use the exact persisted username", async () => {
  const previous = process.env.LOCAL_AUTH_ENABLED;
  process.env.LOCAL_AUTH_ENABLED = "true";
  try {
    const auth = new AuthenticationService(
      {},
      {
        user: {
          findUnique: async ({ where }) =>
            where.username === "Existing.Login"
              ? {
                  id: userId,
                  username: "Existing.Login",
                  enabled: true,
                  passwordHash: await hashPassword("password"),
                }
              : null,
        },
      },
      { getSettings: async () => ({ mode: "LOCAL" }) },
    );
    assert.equal(await auth.validateUser("existing.login", "password"), null);
    assert.equal(
      (await auth.validateUser("Existing.Login", "password"))?.username,
      "Existing.Login",
    );
  } finally {
    if (previous === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = previous;
  }
});

test("OIDC keeps the provider subject and username separate from local login identity", async () => {
  const claim = {
    sub: "stable-provider-subject",
    preferred_username: "provider-name",
    name: "山".repeat(51),
    email: "provider@example.com",
  };
  let created;
  const auth = new AuthenticationService(
    {},
    {
      userIdentity: { findUnique: async () => null },
      user: {
        findUnique: async () => null,
        create: async ({ data }) => {
          created = data;
          return {
            id: userId,
            username: data.username,
            enabled: true,
            ...data,
          };
        },
      },
    },
    { verify: async () => claim },
  );

  const session = await auth.verifySession("provider-token");
  assert.equal(session.username, "provider-name");
  assert.equal(created.username, "keycloak-stable-provider-subject");
  assert.equal(created.fullName, "山".repeat(51));
  assert.deepEqual(created.identities.create, {
    provider: "KEYCLOAK",
    subject: "stable-provider-subject",
    providerUsername: "provider-name",
  });
});

test("existing OIDC links keep their database username when the provider name changes", async () => {
  const providerName = "new-provider-name";
  let identityUpdate;
  const auth = new AuthenticationService(
    {},
    {
      userIdentity: {
        findUnique: async () => ({
          id: "identity-id",
          user: {
            id: userId,
            username: "legacy-database-username",
            enabled: true,
          },
        }),
        update: async (query) => {
          identityUpdate = query;
        },
      },
    },
    {
      verify: async () => ({
        sub: "stable-provider-subject",
        preferred_username: providerName,
      }),
    },
  );

  const session = await auth.verifySession("provider-token");
  assert.equal(session.username, providerName);
  assert.deepEqual(identityUpdate, {
    where: { id: "identity-id" },
    data: { providerUsername: providerName },
  });
});

test("base acronym contract keeps the UUID relation while normalizing and bounding the code", async () => {
  let createData;
  let updateQuery;
  const tx = {
    base: {
      creates: 0,
      create: async ({ data }) => {
        tx.base.creates += 1;
        if (tx.base.creates === 3) throw { code: "P2002" };
        createData = data;
        return { id: baseId, ...data };
      },
      update: async (query) => {
        updateQuery = query;
        return { id: baseId, ...query.data };
      },
    },
    managementAudit: { create: async () => undefined },
  };
  const service = new BaseService({
    $transaction: async (callback) => callback(tx),
  });
  await service.create(
    { code: "A".repeat(32), name: "Maximum length" },
    "admin-id",
  );
  assert.equal(createData.code, "A".repeat(32));
  await service.create(
    { code: " jty ", name: "Japanese territory" },
    "admin-id",
  );
  assert.deepEqual(createData, { code: "JTY", name: "Japanese territory" });
  await service.update(
    baseId,
    { code: "msty" },
    "admin-id",
  );
  assert.deepEqual(updateQuery, {
    where: { id: baseId },
    data: { code: "MSTY" },
  });

  await assert.rejects(
    service.create({ code: "A".repeat(33), name: "Long" }, "admin-id"),
    BadRequestException,
  );
  await assert.rejects(
    service.create({ code: "東京", name: "Invalid acronym" }, "admin-id"),
    BadRequestException,
  );
  await assert.rejects(
    service.create({ code: "JTY", name: "Duplicate" }, "admin-id"),
    (error) => error instanceof ConflictException,
  );
});

test("existing storage keeps nullable legacy identity fields and stable UUID relations", () => {
  const schema = fs.readFileSync(
    path.join(__dirname, "../prisma/schema.prisma"),
    "utf8",
  );
  const migrations = fs.readFileSync(
    path.join(
      __dirname,
      "../prisma/migrations/20261112014000_base_management/migration.sql",
    ),
    "utf8",
  );
  assert.match(schema, /username\s+String\s+@unique/);
  assert.match(schema, /fullName\s+String\?/);
  assert.match(schema, /gid\s+String\?/);
  assert.match(schema, /baseId\s+String\?/);
  assert.match(schema, /references:\s*\[id\], onDelete:\s*Restrict/);
  assert.match(migrations, /lower\(trim\("gid"\)\)/);
  assert.match(migrations, /upper\("code"\)/);
});

test("identity contract changelog is synchronized between migration and built-in history", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../prisma/migrations/20261115174600_identity_base_contract_v6/migration.sql",
    ),
    "utf8",
  );
  const changelog = fs.readFileSync(
    path.join(
      __dirname,
      "../../web/src/features/changelog/ChangelogPage.tsx",
    ),
    "utf8",
  );
  const id = "changelog-20261115-identity-base-contract-v6";
  const title = "Clarify account identity and base rules";
  const details =
    "Documented and tested existing username, legacy GID, administrator and profile name rules. Existing account identities, OIDC links, and UUID-based base assignments remain unchanged while the acronym-key storage migration is planned.";
  const date = "2026-11-15T08:46:00.000Z";
  const start = changelog.indexOf(`id: "${id}"`);
  const end = changelog.indexOf("\n  },", start);
  const builtInEntry = changelog.slice(start, end);

  assert.notEqual(start, -1);
  for (const value of [id, title, details, date]) {
    assert.ok(migration.includes(value));
    assert.ok(builtInEntry.includes(value));
  }
});
