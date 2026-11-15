const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BadRequestException,
  ConflictException,
  NotFoundException,
} = require("@nestjs/common");
const {
  AdminUsersService,
} = require("../dist/modules/admin-users/admin-users.service");
const { Test } = require("@nestjs/testing");
const {
  AdminUsersController,
} = require("../dist/modules/admin-users/admin-users.controller");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  AdminAuthGuard,
} = require("../dist/modules/authentication/admin-auth.guard");

const userId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";
const baseId = "d5a04720-d839-4d8c-bfc2-d6310970bca1";
const target = {
  id: userId,
  gid: "G123",
  username: "alice",
  email: "alice@example.com",
  baseId,
  enabled: true,
  sessionVersion: 4,
  passwordHash: "secret-hash",
  base: { id: baseId, code: "JTY", name: "JTY" },
  identities: [{ provider: "LOCAL" }],
};

function fixture(overrides = {}) {
  const calls = { findFirst: [], update: [] };
  const tx = {
    base: { findUnique: async () => ({ id: baseId }) },
    user: {
      findUnique: async () => ({ ...target }),
      findFirst: async (query) => {
        calls.findFirst.push(query);
        return null;
      },
      findMany: async () => [],
      update: async (query) => {
        calls.update.push(query);
        return {
          ...target,
          ...query.data,
          passwordHash: undefined,
          sessionVersion: 5,
        };
      },
      ...overrides.user,
    },
    managementAudit: { create: async () => undefined },
    userIdentity: {
      updateMany: async (query) => {
        calls.identityUpdate = query;
        return { count: 1 };
      },
    },
    oidcSettings: { findUnique: async () => null, ...overrides.oidcSettings },
  };
  const prisma = {
    user: { findUnique: async () => ({ ...target }), ...overrides.prismaUser },
    $transaction: async (callback) => callback(tx),
  };
  return { service: new AdminUsersService(prisma), calls, tx };
}

test("returns user detail without password hashes and identifies available login methods", async () => {
  const { service } = fixture();
  const detail = await service.get(userId);
  assert.equal(detail.id, userId);
  assert.equal(detail.passwordHash, undefined);
  assert.equal(detail.hasLocalPassword, true);
  assert.deepEqual(detail.identityProviders, ["LOCAL"]);
});

test("updates a Unicode full name and rejects names longer than 50 characters", async () => {
  const { service, calls } = fixture();
  const fullName = "𠮷".repeat(50);
  const response = await service.update(userId, { fullName }, "actor-id");
  assert.equal(response.fullName, fullName);
  assert.equal(calls.update[0].data.fullName, fullName);
  await assert.rejects(
    service.update(userId, { fullName: "山".repeat(51) }, "actor-id"),
    BadRequestException,
  );
});

test("updates approved user fields and increments session version when disabling", async () => {
  const { service, calls } = fixture();
  const response = await service.update(
    userId,
    {
      gid: " G-456 ",
      username: "alice2",
      email: "alice2@example.com",
      baseId,
      enabled: false,
    },
    "actor-id",
  );
  assert.deepEqual(calls.update[0].data, {
    gid: "G-456",
    username: "alice2",
    email: "alice2@example.com",
    baseId,
    enabled: false,
    sessionVersion: { increment: 1 },
  });
  assert.equal(response.passwordHash, undefined);
  assert.equal(response.sessionVersion, 5);
  assert.deepEqual(calls.identityUpdate, {
    where: { userId, provider: "LOCAL" },
    data: { subject: "alice2" },
  });
});

test("renaming a username invalidates previous sessions", async () => {
  const { service, calls } = fixture();
  await service.update(userId, { username: "alice2" }, "actor-id");
  assert.deepEqual(calls.update[0].data.sessionVersion, { increment: 1 });
});

test("rejects duplicate identifiers and malformed or privileged update fields", async () => {
  const duplicate = fixture({
    user: { findFirst: async () => ({ id: "another-user" }) },
  });
  await assert.rejects(
    duplicate.service.update(userId, { username: "taken" }, "actor-id"),
    ConflictException,
  );
  const { service } = fixture();
  for (const [id, input] of [
    ["bad", { username: "changed" }],
    [userId, { isAdmin: true }],
    [userId, { gid: "bad\u0001gid" }],
    [userId, { username: "  " }],
    [userId, { email: "not-an-email" }],
    [userId, { baseId: "not-a-uuid" }],
    [userId, { enabled: "false" }],
    [userId, {}],
  ])
    await assert.rejects(
      service.update(id, input, "actor-id"),
      BadRequestException,
    );
});

test("returns not found for a missing user detail", async () => {
  const { service } = fixture({ prismaUser: { findUnique: async () => null } });
  await assert.rejects(service.get(userId), NotFoundException);
});

test("prevents disabling the only usable configured administrator", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "alice";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({ user: { findMany: async () => [] } });
  await assert.rejects(
    service.update(userId, { enabled: false }, "actor-id"),
    BadRequestException,
  );
  assert.equal(calls.update.length, 0);
});

test("allows disabling an administrator when another enabled administrator has a usable local login", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "alice,bob";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({
    user: {
      findMany: async () => [
        {
          id: "another-admin",
          username: "bob",
          passwordHash: "hash",
          identities: [],
        },
      ],
    },
  });
  await service.update(userId, { enabled: false }, "actor-id");
  assert.equal(calls.update.length, 1);
});

test("does not count a local-only administrator in OIDC mode", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "alice,bob";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({
    user: {
      findMany: async () => [
        {
          id: "another-admin",
          username: "bob",
          passwordHash: "hash",
          identities: [],
        },
      ],
    },
    oidcSettings: {
      findUnique: async () => ({
        mode: "OIDC",
        enabled: true,
        keycloakUrl: "https://identity.example.test",
        realm: "employees",
        clientId: "translator",
        issuerUrl: "https://identity.example.test/realms/employees",
      }),
    },
  });
  await assert.rejects(
    service.update(userId, { enabled: false }, "actor-id"),
    BadRequestException,
  );
  assert.equal(calls.update.length, 0);
});

test("protects an OIDC administrator identified by provider username", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "alice";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({
    user: {
      findUnique: async () => ({
        ...target,
        username: "keycloak-provider-id",
        identities: [
          { provider: "KEYCLOAK", providerUsername: "alice" },
        ],
      }),
      findMany: async () => [],
    },
    oidcSettings: {
      findUnique: async () => ({
        mode: "OIDC",
        enabled: true,
        keycloakUrl: "https://identity.example.test",
        realm: "employees",
        clientId: "translator",
        issuerUrl: "https://identity.example.test/realms/employees",
      }),
    },
  });

  await assert.rejects(
    service.update(userId, { enabled: false }, "actor-id"),
    BadRequestException,
  );
  assert.equal(calls.update.length, 0);
});

test("fails closed when a legacy OIDC identity has no stored provider username", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "alice";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({
    user: {
      findUnique: async () => ({
        ...target,
        username: "keycloak-provider-id",
        identities: [{ provider: "KEYCLOAK" }],
      }),
      findMany: async () => [],
    },
    oidcSettings: {
      findUnique: async () => ({
        mode: "OIDC",
        enabled: true,
        keycloakUrl: "https://identity.example.test",
        realm: "employees",
        clientId: "translator",
        issuerUrl: "https://identity.example.test/realms/employees",
      }),
    },
  });

  await assert.rejects(
    service.update(userId, { enabled: false }, "actor-id"),
    BadRequestException,
  );
  assert.equal(calls.update.length, 0);
});

test("allows disabling an unmapped OIDC identity when no administrators are configured", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({
    user: {
      findUnique: async () => ({
        ...target,
        username: "keycloak-provider-id",
        identities: [{ provider: "KEYCLOAK" }],
      }),
    },
    oidcSettings: {
      findUnique: async () => ({
        mode: "OIDC",
        enabled: true,
        keycloakUrl: "https://identity.example.test",
        realm: "employees",
        clientId: "translator",
        issuerUrl: "https://identity.example.test/realms/employees",
      }),
    },
  });

  await service.update(userId, { enabled: false }, "actor-id");
  assert.equal(calls.update.length, 1);
});

test("allows disabling an administrator when another OIDC admin can sign in in OIDC mode", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  const oldLocal = process.env.LOCAL_AUTH_ENABLED;
  process.env.ADMIN_USERNAMES = "alice,bob";
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
    if (oldLocal === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = oldLocal;
  });
  const { service, calls } = fixture({
    user: {
      findMany: async () => [
        {
          id: "another-admin",
          username: "bob",
          passwordHash: null,
          identities: [
            { provider: "KEYCLOAK", providerUsername: "bob" },
          ],
        },
      ],
    },
    oidcSettings: {
      findUnique: async () => ({
        mode: "OIDC",
        enabled: true,
        keycloakUrl: "https://identity.example.test",
        realm: "employees",
        clientId: "translator",
        issuerUrl: "https://identity.example.test/realms/employees",
      }),
    },
  });
  await service.update(userId, { enabled: false }, "actor-id");
  assert.equal(calls.update.length, 1);
});

test("user edits cannot change configured administrator membership", async (t) => {
  const oldNames = process.env.ADMIN_USERNAMES;
  process.env.ADMIN_USERNAMES = "alice";
  t.after(() => {
    if (oldNames === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = oldNames;
  });

  const admin = fixture();
  await assert.rejects(
    admin.service.update(userId, { username: "alice-renamed" }, "actor-id"),
    BadRequestException,
  );

  const nonAdmin = fixture({
    user: {
      findUnique: async () => ({ ...target, username: "charlie" }),
    },
  });
  await assert.rejects(
    nonAdmin.service.update(userId, { username: "alice" }, "actor-id"),
    BadRequestException,
  );
  assert.equal(admin.calls.update.length, 0);
  assert.equal(nonAdmin.calls.update.length, 0);
});

test("user detail routes require an administrator for both reads and updates", async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminUsersController],
    providers: [
      JwtAuthGuard,
      AdminAuthGuard,
      {
        provide: AuthenticationService,
        useValue: {
          verifySession: async (token) => ({
            userId,
            isAdmin: token === "admin",
          }),
        },
      },
      {
        provide: AdminUsersService,
        useValue: {
          get: async (id) => ({ id }),
          update: async (id) => ({ id }),
          resetPassword: async (id) => ({ id }),
        },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/admin/users/${userId}`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer user" } })).status,
      403,
    );
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer admin" } })).status,
      200,
    );
    const patch = (token) =>
      fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      });
    assert.equal((await patch("user")).status, 403);
    assert.equal((await patch("admin")).status, 200);
    const reset = (token) =>
      fetch(`${url}/password`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: "a secure temporary password" }),
      });
    assert.equal((await reset("user")).status, 403);
    assert.equal((await reset("admin")).status, 200);
  } finally {
    await app.close();
  }
});
