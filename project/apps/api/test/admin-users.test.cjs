const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BadRequestException, ConflictException } = require("@nestjs/common");
const {
  AdminUsersService,
} = require("../dist/modules/admin-users/admin-users.service");
const { verifyPassword } = require("../dist/modules/authentication/passwords");
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

const baseId = "d5a04720-d839-4d8c-bfc2-d6310970bca1";
const valid = {
  gid: "G123",
  username: "someone",
  email: "person@example.com",
  baseId,
  password: "correct horse battery",
};
function fixture() {
  let data;
  const tx = {
    base: { findUnique: async () => ({ id: baseId }) },
    managementAudit: { create: async () => undefined },
    user: {
      findFirst: async () => null,
      create: async (input) => {
        data = input.data;
        return { id: "created", ...input.data };
      },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  return { service: new AdminUsersService(prisma), tx, saved: () => data };
}

test("registers a local account transactionally without exposing a password", async () => {
  const { service, saved } = fixture();
  const response = await service.create(valid, "admin-id");
  assert.equal(response.id, "created");
  assert.equal(response.passwordHash, undefined);
  assert.equal(saved().identities.create.provider, "LOCAL");
  assert.equal(saved().identities.create.subject, "someone");
  assert.equal(
    await verifyPassword(valid.password, saved().passwordHash),
    true,
  );
});

test("registers a GID-style username and a separate Unicode full name", async () => {
  const { service, saved } = fixture();
  const fullName = "𠮷".repeat(50);
  const response = await service.create({
    username: "jt0191340",
    fullName,
    email: valid.email,
    baseId,
    password: valid.password,
  }, "admin-id");
  assert.equal(response.username, "jt0191340");
  assert.equal(response.fullName, fullName);
  assert.equal(saved().identities.create.subject, "jt0191340");
  await assert.rejects(service.create({
    username: "jt0191341",
    fullName: "山".repeat(51),
    email: valid.email,
    baseId,
    password: valid.password,
  }, "admin-id"), BadRequestException);
  for (const invalid of [
    { username: "jt0191341", fullName: "" },
    { username: "\njt0191341", fullName: "山田" },
  ]) {
    await assert.rejects(service.create({
      ...invalid,
      email: valid.email,
      baseId,
      password: valid.password,
    }, "admin-id"), BadRequestException);
  }
});

test("a newly created username can sign in using its local password", async () => {
  const { service, saved } = fixture();
  await service.create({
    username: "jt0191340",
    fullName: "山田 太郎",
    email: valid.email,
    baseId,
    password: valid.password,
  }, "admin-id");
  const previous = process.env.LOCAL_AUTH_ENABLED;
  process.env.LOCAL_AUTH_ENABLED = "true";
  try {
    const auth = new AuthenticationService(
      {},
      { user: { findUnique: async ({ where }) =>
        where.username === saved().username
          ? { id: "created", enabled: true, ...saved() }
          : null } },
      { getSettings: async () => ({ mode: "LOCAL" }) },
    );
    const result = await auth.validateUser("jt0191340", valid.password);
    assert.equal(result.username, "jt0191340");
    assert.equal(result.userId, "created");
  } finally {
    if (previous === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = previous;
  }
});

test("rejects malformed registration and privileged fields", async () => {
  const { service } = fixture();
  for (const input of [
    { ...valid, isAdmin: true },
    { ...valid, password: "short" },
    { ...valid, email: "invalid" },
    { ...valid, baseId: "bad" },
    { ...valid, gid: " " },
    { ...valid, gid: "a\u0001b" },
    { ...valid, gid: "\nabc" },
  ]) {
    await assert.rejects(service.create(input), BadRequestException);
  }
});

test("reports a Base deleted during registration as invalid input", async () => {
  const { service, tx } = fixture();
  tx.user.create = async () => {
    throw Object.assign(new Error("foreign key"), { code: "P2003" });
  };
  await assert.rejects(service.create(valid), BadRequestException);
});

test("rejects duplicate values and missing bases", async () => {
  const first = fixture();
  first.tx.user.findFirst = async () => ({ id: "existing" });
  await assert.rejects(first.service.create(valid), ConflictException);
  const second = fixture();
  second.tx.base.findUnique = async () => null;
  await assert.rejects(second.service.create(valid), BadRequestException);
});

test("validates list query and forwards combined filters and stable ordering", async () => {
  let query;
  const baseSearchQueries = [];
  const prisma = {
    base: {
      findMany: async (args) => {
        baseSearchQueries.push(args);
        return args.where.OR[0].code.contains === "山田"
          ? [{ id: baseId }]
          : [];
      },
    },
    user: {
      count: async () => 1,
      findMany: async (args) => {
        query = args;
        return [];
      },
    },
  };
  const service = new AdminUsersService(prisma);
  const result = await service.list({
    q: "山田",
    baseId,
    enabled: "true",
    sort: "base",
    direction: "desc",
    page: "2",
    pageSize: "20",
  });
  assert.equal(result.total, 1);
  assert.equal(result.page, 2);
  assert.equal(query.skip, 20);
  assert.deepEqual(query.orderBy, [{ base: { name: "desc" } }, { id: "asc" }]);
  assert.equal(query.where.baseId, baseId);
  assert.equal(query.where.enabled, true);
  assert.deepEqual(baseSearchQueries[0].where.OR, [
    { code: { contains: "山田", mode: "insensitive" } },
    { name: { contains: "山田", mode: "insensitive" } },
  ]);
  assert.deepEqual(query.where.OR, [
    { gid: { contains: "山田", mode: "insensitive" } },
    { username: { contains: "山田", mode: "insensitive" } },
    { fullName: { contains: "山田", mode: "insensitive" } },
    { email: { contains: "山田", mode: "insensitive" } },
    { baseId: { in: [baseId] } },
  ]);
  await service.list({ q: "disabled" });
  assert.deepEqual(query.where.OR, [
    { gid: { contains: "disabled", mode: "insensitive" } },
    { username: { contains: "disabled", mode: "insensitive" } },
    { fullName: { contains: "disabled", mode: "insensitive" } },
    { email: { contains: "disabled", mode: "insensitive" } },
    { enabled: false },
  ]);
  await assert.rejects(
    service.list({ sort: "passwordHash" }),
    BadRequestException,
  );
  await assert.rejects(service.list({ pageSize: "11" }), BadRequestException);
});

test("HTTP management endpoints require authenticated administrators", async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminUsersController],
    providers: [
      JwtAuthGuard,
      AdminAuthGuard,
      {
        provide: AuthenticationService,
        useValue: {
          verifySession: async (token) => ({
            userId: "u",
            isAdmin: token === "admin",
          }),
        },
      },
      {
        provide: AdminUsersService,
        useValue: {
          list: async () => ({ data: [] }),
          create: async () => ({ id: "new" }),
          assignBase: async () => ({ id: "u" }),
        },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/admin/users`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer user" } })).status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer user",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer admin" } })).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${url}/user/base`, {
          method: "PATCH",
          headers: {
            Authorization: "Bearer user",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${url}/user/base`, {
          method: "PATCH",
          headers: {
            Authorization: "Bearer admin",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("administrator assigns a valid Base to an existing user", async () => {
  let update;
  const userId = "6bd767a6-b04e-4aaa-9eb6-574a26b135c1";
  const tx = {
    user: {
      update: async (input) => {
        update = input;
        return { id: userId, baseId };
      },
    },
    managementAudit: { create: async () => undefined },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const service = new AdminUsersService(prisma);
  assert.deepEqual(await service.assignBase(userId, { baseId }, "actor-id"), {
    id: userId,
    baseId,
  });
  assert.equal(update.where.id, userId);
  assert.equal(update.data.baseId, baseId);
  for (const [id, input] of [
    ["bad", { baseId }],
    [userId, { baseId: "bad" }],
    [userId, { baseId, enabled: true }],
  ]) {
    await assert.rejects(
      service.assignBase(id, input, "actor-id"),
      BadRequestException,
    );
  }
  tx.user.update = async () => {
    throw Object.assign(new Error("foreign key"), { code: "P2003" });
  };
  await assert.rejects(
    service.assignBase(userId, { baseId }, "actor-id"),
    BadRequestException,
  );
  tx.user.update = async () => {
    throw Object.assign(new Error("missing"), { code: "P2025" });
  };
  await assert.rejects(service.assignBase(userId, { baseId }, "actor-id"), {
    status: 404,
  });
});
