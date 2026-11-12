const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BadRequestException,
  UnauthorizedException,
} = require("@nestjs/common");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  AdminUsersService,
} = require("../dist/modules/admin-users/admin-users.service");
const {
  hashPassword,
  verifyPassword,
} = require("../dist/modules/authentication/passwords");
const { Test } = require("@nestjs/testing");
const {
  AuthenticationController,
} = require("../dist/modules/authentication/authentication.controller");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  KeycloakVerifierService,
} = require("../dist/modules/authentication/keycloak-verifier.service");

const userId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";
const oldPassword = "old secure password";
const newPassword = "new secure password";

async function authFixture(hasPassword = true) {
  const user = {
    id: userId,
    enabled: true,
    sessionVersion: 6,
    passwordHash: hasPassword ? await hashPassword(oldPassword) : null,
  };
  let update;
  let audit;
  const tx = {
    user: {
      findUnique: async () => ({ ...user }),
      update: async (query) => {
        update = query;
        Object.assign(user, query.data, {
          sessionVersion: user.sessionVersion + 1,
        });
        return user;
      },
    },
    managementAudit: {
      create: async ({ data }) => {
        audit = data;
      },
    },
  };
  const prisma = {
    user: { findUnique: async () => ({ ...user }) },
    $transaction: async (callback) => callback(tx),
  };
  return {
    user,
    getUpdate: () => update,
    getAudit: () => audit,
    service: new AuthenticationService(
      {
        verifyAsync: async () => {
          throw new Error("not a local token");
        },
      },
      prisma,
      {},
    ),
  };
}

test("owner password change verifies current password and rejects weak, oversized, and reused values", async () => {
  const fixture = await authFixture();
  await assert.rejects(
    fixture.service.changeOwnPassword(userId, {
      currentPassword: "wrong",
      newPassword,
    }),
    UnauthorizedException,
  );
  await assert.rejects(
    fixture.service.changeOwnPassword(userId, {
      currentPassword: oldPassword,
      newPassword: "short",
    }),
    BadRequestException,
  );
  await assert.rejects(
    fixture.service.changeOwnPassword(userId, {
      currentPassword: oldPassword,
      newPassword: "x".repeat(129),
    }),
    BadRequestException,
  );
  await assert.rejects(
    fixture.service.changeOwnPassword(userId, {
      currentPassword: oldPassword,
      newPassword: oldPassword,
    }),
    BadRequestException,
  );
});

test("owner password change stores a new hash and revokes existing local sessions", async () => {
  const fixture = await authFixture();
  assert.deepEqual(
    await fixture.service.changeOwnPassword(userId, {
      currentPassword: oldPassword,
      newPassword,
    }),
    { success: true },
  );
  assert.equal(fixture.getUpdate().where.id, userId);
  assert.deepEqual(fixture.getUpdate().data.sessionVersion, { increment: 1 });
  assert.equal(
    await verifyPassword(newPassword, fixture.getUpdate().data.passwordHash),
    true,
  );
  assert.equal(
    fixture.getUpdate().data.passwordHash.includes(newPassword),
    false,
  );
  assert.deepEqual(fixture.getAudit(), {
    actorId: userId,
    action: "LOCAL_PASSWORD_CHANGED",
    targetType: "USER",
    targetId: userId,
    changes: { fields: ["localCredential"] },
  });
});

test("owner cannot use local password change for an OIDC-only account", async () => {
  const fixture = await authFixture(false);
  await assert.rejects(
    fixture.service.changeOwnPassword(userId, {
      currentPassword: oldPassword,
      newPassword,
    }),
    /Local password is not configured/,
  );
});

test("administrator reset requires a local credential and revokes sessions without exposing the hash", async () => {
  const user = {
    id: userId,
    passwordHash: await hashPassword(oldPassword),
    enabled: true,
  };
  let update;
  let audit;
  const tx = {
    user: {
      findUnique: async () => ({ ...user }),
      findUnique: async () => ({ ...user }),
      update: async (query) => {
        update = query;
        return { id: userId, enabled: true, sessionVersion: 7 };
      },
    },
    managementAudit: {
      create: async ({ data }) => {
        audit = data;
      },
    },
  };
  const service = new AdminUsersService({
    $transaction: async (callback) => callback(tx),
  });
  const result = await service.resetPassword(
    userId,
    { password: newPassword },
    "admin-id",
  );
  assert.equal(result.passwordHash, undefined);
  assert.deepEqual(update.data.sessionVersion, { increment: 1 });
  assert.equal(
    await verifyPassword(newPassword, update.data.passwordHash),
    true,
  );
  assert.deepEqual(audit, {
    actorId: "admin-id",
    action: "LOCAL_PASSWORD_RESET",
    targetType: "USER",
    targetId: userId,
    changes: { fields: ["localCredential"] },
  });
  user.passwordHash = null;
  await assert.rejects(
    service.resetPassword(userId, { password: newPassword }, "admin-id"),
    /Local password is not configured/,
  );
});

test("password change endpoint is authenticated and uses the session owner, not a body-supplied identity", async () => {
  let actor;
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthenticationController],
    providers: [
      JwtAuthGuard,
      {
        provide: AuthenticationService,
        useValue: {
          verifySession: async () => ({
            userId,
            username: "alice",
            isAdmin: false,
          }),
          changeOwnPassword: async (id, body) => {
            actor = { id, body };
            return { success: true };
          },
        },
      },
      { provide: KeycloakVerifierService, useValue: {} },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/auth/password/change`;
    const payload = {
      currentPassword: oldPassword,
      newPassword,
      userId: "attacker-chosen-id",
    };
    const unauthorized = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(unauthorized.status, 401);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 201);
    assert.equal(actor.id, userId);
  } finally {
    await app.close();
  }
});
