const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BadRequestException } = require("@nestjs/common");
const { Test } = require("@nestjs/testing");
const {
  ApplicationSettingsController,
} = require("../dist/modules/application-settings/application-settings.controller");
const {
  ApplicationSettingsService,
} = require("../dist/modules/application-settings/application-settings.service");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  AdminAuthGuard,
} = require("../dist/modules/authentication/admin-auth.guard");

function fixture() {
  let settings = null;
  const audits = [];
  const applicationSettings = {
    upsert: async ({ create }) => {
      settings ??= { ...create };
      return {
        maxUploadSizeMb: settings.maxUploadSizeMb,
        maxConcurrentTranslations: settings.maxConcurrentTranslations,
      };
    },
    update: async ({ data }) => {
      settings = { ...settings, ...data };
      return {
        maxUploadSizeMb: settings.maxUploadSizeMb,
        maxConcurrentTranslations: settings.maxConcurrentTranslations,
      };
    },
  };
  const transaction = {
    applicationSettings,
    managementAudit: {
      create: async ({ data }) => audits.push(data),
    },
  };
  const prisma = {
    applicationSettings,
    $transaction: async (operation) => operation(transaction),
  };
  return {
    service: new ApplicationSettingsService(prisma),
    audits,
    settings: () => settings,
  };
}

test("application settings persist changes and write an administrator audit record", async () => {
  const { service, audits, settings } = fixture();
  assert.deepEqual(await service.getSettings(), {
    maxUploadSizeMb: 50,
    maxConcurrentTranslations: 5,
  });

  const result = await service.updateSettings(
    { maxUploadSizeMb: 20, maxConcurrentTranslations: 2 },
    "admin-id",
  );

  assert.deepEqual(result, {
    maxUploadSizeMb: 20,
    maxConcurrentTranslations: 2,
  });
  assert.equal(settings().maxUploadSizeMb, 20);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorId, "admin-id");
  assert.equal(audits[0].targetType, "APPLICATION_SETTINGS");
});

test("application settings controller rejects limits outside supported bounds", async () => {
  const controller = new ApplicationSettingsController({
    getSettings: async () => ({
      maxUploadSizeMb: 50,
      maxConcurrentTranslations: 5,
    }),
    updateSettings: async () => ({
      maxUploadSizeMb: 50,
      maxConcurrentTranslations: 5,
    }),
  });

  for (const input of [
    { maxUploadSizeMb: 0 },
    { maxUploadSizeMb: 51 },
    { maxUploadSizeMb: 1.5 },
    { maxConcurrentTranslations: 0 },
    { maxConcurrentTranslations: 6 },
    { maxConcurrentTranslations: 2.5 },
    { maxUploadSizeMb: 10, isAdmin: true },
    {},
  ]) {
    assert.throws(
      () => controller.update(input, { user: { userId: "admin-id" } }),
      BadRequestException,
    );
  }
});

test("application settings routes require administrator authorization", async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [ApplicationSettingsController],
    providers: [
      JwtAuthGuard,
      AdminAuthGuard,
      {
        provide: AuthenticationService,
        useValue: {
          verifySession: async (token) => ({
            userId: "admin-id",
            isAdmin: token === "admin",
          }),
        },
      },
      {
        provide: ApplicationSettingsService,
        useValue: {
          getSettings: async () => ({
            maxUploadSizeMb: 50,
            maxConcurrentTranslations: 5,
          }),
          updateSettings: async () => ({
            maxUploadSizeMb: 25,
            maxConcurrentTranslations: 2,
          }),
        },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);

  try {
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/admin/application-settings`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer user" } })).status,
      403,
    );
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ maxUploadSizeMb: 25 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      maxUploadSizeMb: 25,
      maxConcurrentTranslations: 2,
    });
  } finally {
    await app.close();
  }
});
