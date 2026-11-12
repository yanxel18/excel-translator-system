const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Test } = require("@nestjs/testing");
const {
  KeycloakVerifierService,
} = require("../dist/modules/authentication/keycloak-verifier.service");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  AuthenticationController,
} = require("../dist/modules/authentication/authentication.controller");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  AdminAuthGuard,
} = require("../dist/modules/authentication/admin-auth.guard");

const actorId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";
const validOidc = {
  keycloakUrl: "https://identity.example.test",
  realm: "employees",
  clientId: "translator",
  issuerUrl: "https://identity.example.test/realms/employees",
  requiredGroup: "",
};

function storedSettings(settings) {
  return {
    id: "default",
    enabled: settings.enabled ?? false,
    mode: settings.mode,
    keycloakUrl: settings.keycloakUrl ?? null,
    realm: settings.realm ?? null,
    clientId: settings.clientId ?? null,
    issuerUrl: settings.issuerUrl ?? null,
    requiredGroup: settings.requiredGroup ?? null,
  };
}

test("settings expose a coherent mode and retain compatibility with rows predating mode", async () => {
  const service = new KeycloakVerifierService({
    oidcSettings: {
      findUnique: async () => storedSettings({ enabled: true, ...validOidc }),
    },
  });
  const settings = await service.getSettings();
  assert.equal(settings.mode, "HYBRID");
  assert.equal(settings.enabled, true);
  assert.deepEqual(await service.getPublicConfig(), {
    mode: "HYBRID",
    enabled: true,
    url: validOidc.keycloakUrl,
    realm: validOidc.realm,
    clientId: validOidc.clientId,
  });

  const localService = new KeycloakVerifierService({
    oidcSettings: {
      findUnique: async () => storedSettings({ enabled: false }),
    },
  });
  const localSettings = await localService.getSettings();
  assert.equal(localSettings.mode, "LOCAL");
  assert.equal(localSettings.enabled, false);
});

test("mode updates persist the mode, synchronize legacy enabled, and audit changed field names transactionally", async () => {
  const events = [];
  let saved;
  let audit;
  const tx = {
    oidcSettings: {
      upsert: async ({ create, update }) => {
        events.push("settings");
        saved = { ...create, ...update };
        return saved;
      },
    },
    managementAudit: {
      create: async ({ data }) => {
        events.push("audit");
        audit = data;
      },
    },
  };
  const service = new KeycloakVerifierService({
    $transaction: async (callback) => callback(tx),
  });
  const result = await service.updateSettings(
    { mode: "OIDC", ...validOidc },
    actorId,
  );

  assert.equal(result.mode, "OIDC");
  assert.equal(result.enabled, true);
  assert.deepEqual(events, ["settings", "audit"]);
  assert.equal(audit.actorId, actorId);
  assert.deepEqual(audit.changes.fields, [
    "mode",
    "enabled",
    "keycloakUrl",
    "realm",
    "clientId",
    "issuerUrl",
    "requiredGroup",
  ]);
});

test("legacy enabled-only updates preserve the prior combined sign-in behavior", async () => {
  let saved;
  const service = new KeycloakVerifierService({
    $transaction: async (callback) =>
      callback({
        oidcSettings: {
          upsert: async ({ create, update }) =>
            (saved = { ...create, ...update }),
        },
        managementAudit: { create: async () => {} },
      }),
  });

  await service.updateSettings({ enabled: true, ...validOidc }, actorId);
  assert.equal(saved.mode, "HYBRID");
  assert.equal(saved.enabled, true);
  await service.updateSettings({ enabled: false }, actorId);
  assert.equal(saved.mode, "LOCAL");
  assert.equal(saved.enabled, false);
});

test("rejects inconsistent mode and enabled values and incomplete provider configuration", async () => {
  const service = new KeycloakVerifierService({});
  await assert.rejects(
    service.updateSettings(
      { mode: "OIDC", enabled: false, ...validOidc },
      actorId,
    ),
    (error) => error.status === 400,
  );
  await assert.rejects(
    service.updateSettings({ mode: "OIDC" }, actorId),
    (error) => error.status === 400,
  );
  await assert.rejects(
    service.updateSettings(
      { mode: "HYBRID", ...validOidc, clientId: "" },
      actorId,
    ),
    (error) => error.status === 400,
  );
  await assert.rejects(
    service.updateSettings({ mode: "PASSWORDLESS" }, actorId),
    (error) => error.status === 400,
  );
});

test("rejects malformed, credentialed, remotely insecure, and mismatched issuer URLs", async () => {
  const service = new KeycloakVerifierService({});
  const invalidIssuers = [
    "not a URL",
    "ftp://identity.example.test/realms/employees",
    "http://identity.example.test/realms/employees",
    "https://user:password@identity.example.test/realms/employees",
    "https://identity.example.test/realms/employees?next=https://attacker.test",
    "https://identity.example.test/realms/employees#fragment",
    "https://other.example.test/realms/employees",
    "https://identity.example.test/realms/other",
  ];
  for (const issuerUrl of invalidIssuers) {
    await assert.rejects(
      service.updateSettings(
        { mode: "OIDC", ...validOidc, issuerUrl },
        actorId,
      ),
      (error) => error.status === 400,
      `expected unsafe issuer to be rejected: ${issuerUrl}`,
    );
  }

  let saved;
  const localService = new KeycloakVerifierService({
    $transaction: async (callback) =>
      callback({
        oidcSettings: {
          upsert: async ({ create, update }) =>
            (saved = { ...create, ...update }),
        },
        managementAudit: { create: async () => {} },
      }),
  });
  await localService.updateSettings(
    {
      mode: "OIDC",
      keycloakUrl: "http://127.0.0.1:8080",
      realm: "employees",
      clientId: "translator",
      issuerUrl: "http://127.0.0.1:8080/realms/employees",
      requiredGroup: "",
    },
    actorId,
  );
  assert.equal(saved.issuerUrl, "http://127.0.0.1:8080/realms/employees");
});

test("LOCAL settings do not allow Keycloak token verification", async () => {
  const service = new KeycloakVerifierService({
    oidcSettings: {
      findUnique: async () => storedSettings({ mode: "LOCAL", enabled: false }),
    },
  });
  await assert.rejects(
    service.verify("untrusted-token"),
    (error) => error.status === 401,
  );
});

test("OIDC-only mode blocks local credentials even when the deployment permits local authentication", async (t) => {
  const previous = process.env.LOCAL_AUTH_ENABLED;
  process.env.LOCAL_AUTH_ENABLED = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = previous;
  });
  let userLookups = 0;
  const service = new AuthenticationService(
    {},
    {
      oidcSettings: {
        findUnique: async () =>
          storedSettings({ mode: "OIDC", enabled: true, ...validOidc }),
      },
      user: {
        findUnique: async () => {
          userLookups += 1;
          return null;
        },
      },
    },
    { getSettings: async () => ({ mode: "OIDC" }) },
  );
  assert.equal(await service.validateUser("alice", "password"), null);
  assert.equal(userLookups, 0);
});

test("OIDC settings API remains administrator-only and accepts the explicit mode contract", async () => {
  let persisted;
  let persistedActorId;
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthenticationController],
    providers: [
      { provide: AuthenticationService, useValue: {} },
      {
        provide: KeycloakVerifierService,
        useValue: {
          updateSettings: async (settings, actor) => {
            persisted = settings;
            persistedActorId = actor;
          },
          getSettings: async () => ({ mode: "LOCAL", enabled: false }),
          getPublicConfig: async () => ({ mode: "LOCAL", enabled: false }),
        },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context) => {
        context.switchToHttp().getRequest().user = {
          userId: actorId,
          isAdmin: false,
        };
        return true;
      },
    })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const patch = (body) =>
      fetch(`${base}/auth/oidc/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await patch({ mode: "LOCAL" })).status, 403);
    await app.close();
  } finally {
    if (app.getHttpServer().listening) await app.close();
  }

  const adminModule = await Test.createTestingModule({
    controllers: [AuthenticationController],
    providers: [
      { provide: AuthenticationService, useValue: {} },
      {
        provide: KeycloakVerifierService,
        useValue: {
          updateSettings: async (settings, actor) => {
            persisted = settings;
            persistedActorId = actor;
          },
          getSettings: async () => ({ mode: "LOCAL", enabled: false }),
          getPublicConfig: async () => ({ mode: "LOCAL", enabled: false }),
        },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context) => {
        context.switchToHttp().getRequest().user = {
          userId: actorId,
          isAdmin: true,
        };
        return true;
      },
    })
    .overrideGuard(AdminAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const adminApp = adminModule.createNestApplication();
  await adminApp.listen(0);
  try {
    const base = `http://127.0.0.1:${adminApp.getHttpServer().address().port}`;
    const response = await fetch(`${base}/auth/oidc/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "HYBRID", ...validOidc }),
    });
    assert.equal(response.status, 200);
    assert.equal(persisted.mode, "HYBRID");
    assert.equal(persistedActorId, actorId);
  } finally {
    await adminApp.close();
  }
});

test("mode migration and built-in changelog are synchronized and preserve enabled legacy rows", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../prisma/migrations/20261112120000_v2_authentication_modes/migration.sql",
    ),
    "utf8",
  );
  const changelog = fs.readFileSync(
    path.join(__dirname, "../../web/src/features/changelog/ChangelogPage.tsx"),
    "utf8",
  );
  const details =
    "Administrators can select LOCAL, OIDC, or HYBRID authentication from one persisted setting. Existing enabled Keycloak configurations migrate to HYBRID to preserve local and provider sign-in; unsafe issuer URLs are rejected, and deployment guidance documents administrator lockout recovery.";
  assert.match(
    migration,
    /CASE\s+WHEN\s+"enabled"\s+THEN\s+'HYBRID'::"AuthenticationMode"\s+ELSE\s+'LOCAL'::"AuthenticationMode"\s+END/s,
  );
  assert.match(
    migration,
    /CHECK\s*\("enabled"\s*=\s*\("mode"\s*<>\s*'LOCAL'\)\)/,
  );
  assert.match(migration, /changelog-20261112-v2-authentication-modes/);
  const entryStart = changelog.indexOf(
    'id: "changelog-20261112-v2-authentication-modes"',
  );
  const entryEnd = changelog.indexOf("\n  },", entryStart);
  const builtInEntry = changelog.slice(entryStart, entryEnd);
  assert.notEqual(entryStart, -1);
  assert.ok(migration.includes(`'${details}'`));
  assert.ok(builtInEntry.includes(details));
  assert.match(
    migration,
    /'Choose an authentication mode with safer recovery'/,
  );
  assert.match(
    builtInEntry,
    /title:\s*["']Choose an authentication mode with safer recovery["']/,
  );
  assert.match(migration, /'2026-11-12T12:00:00\.000Z'/);
  assert.match(
    builtInEntry,
    /publishedAt:\s*["']2026-11-12T12:00:00\.000Z["']/,
  );
});
