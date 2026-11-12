const test = require("node:test");
const assert = require("node:assert/strict");
const { recordManagementAudit } = require("../dist/common/management-audit");
const { BaseService } = require("../dist/modules/base-management/base.service");
const {
  AdminUsersService,
} = require("../dist/modules/admin-users/admin-users.service");
const {
  KeycloakVerifierService,
} = require("../dist/modules/authentication/keycloak-verifier.service");

const actorId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";
const targetId = "6bd767a6-b04e-4aaa-9eb6-574a26b135c1";

test("audit summaries record only changed field names, never supplied values", async () => {
  let audit;
  const tx = {
    managementAudit: {
      create: async (input) => {
        audit = input.data;
      },
    },
  };
  await recordManagementAudit(
    tx,
    actorId,
    "LOCAL_PASSWORD_RESET",
    "USER",
    targetId,
    ["password"],
  );
  assert.deepEqual(audit, {
    actorId,
    action: "LOCAL_PASSWORD_RESET",
    targetType: "USER",
    targetId,
    changes: { fields: ["password"] },
  });
  assert.equal(JSON.stringify(audit).includes("secret"), false);
  await assert.rejects(
    recordManagementAudit(tx, "", "USER_UPDATED", "USER", targetId, [
      "username",
    ]),
    /Audit actor is required/,
  );
});

test("Base mutation and audit write share the same transaction", async () => {
  const events = [];
  let audit;
  const tx = {
    base: {
      create: async ({ data }) => {
        events.push("base");
        return { id: targetId, ...data };
      },
    },
    managementAudit: {
      create: async ({ data }) => {
        events.push("audit");
        audit = data;
      },
    },
  };
  const service = new BaseService({
    $transaction: async (callback) => callback(tx),
  });
  const created = await service.create({ code: "JTY", name: "Tokyo" }, actorId);
  assert.deepEqual(created, { id: targetId, code: "JTY", name: "Tokyo" });
  assert.deepEqual(events, ["base", "audit"]);
  assert.deepEqual(audit, {
    actorId,
    action: "BASE_CREATED",
    targetType: "BASE",
    targetId,
    changes: { fields: ["code", "name"] },
  });
});

test("Base update and delete record redacted change summaries", async () => {
  const audits = [];
  const tx = {
    base: {
      update: async () => ({ id: targetId, code: "JTY", name: "Tokyo" }),
      delete: async () => ({ id: targetId, code: "JTY", name: "Tokyo" }),
    },
    managementAudit: {
      create: async ({ data }) => {
        audits.push(data);
      },
    },
  };
  const service = new BaseService({
    $transaction: async (callback) => callback(tx),
  });
  await service.update(targetId, { name: "Tokyo" }, actorId);
  await service.remove(targetId, actorId);
  assert.deepEqual(
    audits.map(({ action, changes }) => ({ action, changes })),
    [
      { action: "BASE_UPDATED", changes: { fields: ["name"] } },
      { action: "BASE_DELETED", changes: { fields: [] } },
    ],
  );
  assert.ok(
    audits.every(
      (entry) => entry.actorId === actorId && entry.targetId === targetId,
    ),
  );
});

test("user creation and password reset audit credential events without password data", async () => {
  let audit;
  const tx = {
    base: { findUnique: async () => ({ id: targetId }) },
    user: {
      findFirst: async () => null,
      create: async ({ data }) => ({
        id: targetId,
        gid: data.gid,
        username: data.username,
        email: data.email,
        baseId: data.baseId,
        enabled: true,
      }),
      findUnique: async () => ({ id: targetId, passwordHash: "$argon2id$old" }),
      update: async () => ({ id: targetId, enabled: true, sessionVersion: 1 }),
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
  await service.create(
    {
      gid: "G123",
      username: "alice",
      email: "alice@example.com",
      baseId: targetId,
      password: "a sufficiently long password",
    },
    actorId,
  );
  assert.equal(audit.action, "USER_CREATED");
  assert.deepEqual(audit.changes.fields, [
    "gid",
    "username",
    "email",
    "baseId",
    "localCredential",
  ]);
  await service.resetPassword(
    targetId,
    { password: "another sufficiently long password" },
    actorId,
  );
  assert.equal(audit.action, "LOCAL_PASSWORD_RESET");
  assert.deepEqual(audit.changes.fields, ["localCredential"]);
  assert.equal(
    JSON.stringify(audit).includes("another sufficiently long password"),
    false,
  );
});

test("user edit audit is atomic and contains only approved changed-field names", async () => {
  let audit;
  let updated;
  const tx = {
    user: {
      findUnique: async () => ({
        id: targetId,
        gid: "G123",
        username: "alice",
        enabled: true,
        sessionVersion: 0,
        identities: [],
      }),
      findFirst: async () => null,
      update: async (query) => {
        updated = query;
        return { id: targetId, ...query.data, identities: [] };
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
  await service.update(
    targetId,
    { username: "alice-new", email: "new@example.com" },
    actorId,
  );
  assert.equal(updated.data.username, "alice-new");
  assert.deepEqual(audit, {
    actorId,
    action: "USER_UPDATED",
    targetType: "USER",
    targetId,
    changes: { fields: ["username", "email"] },
  });
  assert.equal(JSON.stringify(audit).includes("new@example.com"), false);
});

test("authentication settings change and audit share one transaction", async () => {
  let audit;
  const tx = {
    oidcSettings: { upsert: async ({ update }) => update },
    managementAudit: {
      create: async ({ data }) => {
        audit = data;
      },
    },
  };
  const service = new KeycloakVerifierService({
    $transaction: async (callback) => callback(tx),
  });
  const value = await service.updateSettings(
    {
      enabled: false,
      keycloakUrl: "",
      realm: "",
      clientId: "",
      issuerUrl: "",
      requiredGroup: "",
    },
    actorId,
  );
  assert.equal(value.enabled, false);
  assert.deepEqual(audit, {
    actorId,
    action: "AUTHENTICATION_SETTINGS_UPDATED",
    targetType: "AUTHENTICATION",
    targetId: "default",
    changes: {
      fields: [
        "mode",
        "enabled",
        "keycloakUrl",
        "realm",
        "clientId",
        "issuerUrl",
        "requiredGroup",
      ],
    },
  });
});
