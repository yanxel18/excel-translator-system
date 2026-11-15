const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BadRequestException } = require("@nestjs/common");
const { Test } = require("@nestjs/testing");
const {
  MaintenanceAdminController,
  MaintenanceNoticeController,
} = require("../dist/modules/maintenance/maintenance.controller");
const {
  MaintenanceService,
  isMaintenanceActive,
} = require("../dist/modules/maintenance/maintenance.service");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  AdminAuthGuard,
} = require("../dist/modules/authentication/admin-auth.guard");

const startsAt = new Date("2026-11-15T08:00:00.000Z");
const endsAt = new Date("2026-11-15T09:00:00.000Z");
const actorId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";

function fixture(initialSchedule = null) {
  let schedule = initialSchedule;
  const audits = [];
  const client = {
    maintenanceSchedule: {
      findUnique: async () => schedule,
      upsert: async ({ create, update }) => {
        schedule = schedule ? { ...schedule, ...update } : { ...create };
        return schedule;
      },
    },
    managementAudit: {
      create: async ({ data }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    maintenanceSchedule: client.maintenanceSchedule,
    $transaction: async (operation) => operation(client),
  };
  return {
    service: new MaintenanceService(prisma),
    audits,
    schedule: () => schedule,
  };
}

test("maintenance window includes its start and excludes its end", () => {
  const schedule = { enabled: true, startsAt, endsAt };

  assert.equal(isMaintenanceActive(schedule, startsAt), true);
  assert.equal(
    isMaintenanceActive(schedule, new Date("2026-11-15T08:59:59.999Z")),
    true,
  );
  assert.equal(isMaintenanceActive(schedule, endsAt), false);
  assert.equal(
    isMaintenanceActive(schedule, new Date("2026-11-15T07:59:59.999Z")),
    false,
  );
  assert.equal(isMaintenanceActive({ ...schedule, enabled: false }, startsAt), false);
});

test("admin schedule updates persist one UTC schedule and audit field names", async () => {
  const { service, audits, schedule } = fixture({
    id: "default",
    enabled: false,
    startsAt: null,
    endsAt: null,
  });

  const result = await service.updateSchedule(
    { enabled: true, startsAt, endsAt },
    actorId,
  );

  assert.deepEqual(result, {
    enabled: true,
    startsAt: "2026-11-15T08:00:00.000Z",
    endsAt: "2026-11-15T09:00:00.000Z",
  });
  assert.deepEqual(schedule(), {
    id: "default",
    enabled: true,
    startsAt,
    endsAt,
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorId, actorId);
  assert.equal(audits[0].targetType, "MAINTENANCE_SCHEDULE");
  assert.deepEqual(audits[0].changes, {
    fields: ["enabled", "startsAt", "endsAt"],
  });
});

test("only an active enabled schedule is returned as a public notice", async () => {
  const pending = fixture({
    id: "default",
    enabled: true,
    startsAt: new Date("2026-11-15T08:00:00.000Z"),
    endsAt: new Date("2026-11-15T09:00:00.000Z"),
  });
  assert.deepEqual(
    await pending.service.getActiveNotice(new Date("2026-11-15T07:59:59.999Z")),
    { active: false },
  );
  assert.deepEqual(
    await pending.service.getActiveNotice(startsAt),
    {
      active: true,
      startsAt: "2026-11-15T08:00:00.000Z",
      endsAt: "2026-11-15T09:00:00.000Z",
    },
  );
  assert.deepEqual(
    await pending.service.getActiveNotice(endsAt),
    { active: false },
  );

  const disabled = fixture({
    id: "default",
    enabled: false,
    startsAt,
    endsAt,
  });
  assert.deepEqual(await disabled.service.getActiveNotice(startsAt), {
    active: false,
  });
});

test("maintenance API rejects ambiguous, invalid, reversed, and extra schedule input", () => {
  const controller = new MaintenanceAdminController({
    updateSchedule: async () => ({
      enabled: true,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    }),
  });
  const request = { user: { userId: actorId } };

  for (const body of [
    { enabled: true, startsAt: "2026-11-15T08:00:00", endsAt: "2026-11-15T09:00:00Z" },
    { enabled: true, startsAt: "2026-02-30T08:00:00Z", endsAt: "2026-03-01T09:00:00Z" },
    { enabled: true, startsAt: "2026-11-15T08:00:00Z", endsAt: "2026-11-15T08:00:00Z" },
    { enabled: true, startsAt: "2026-11-15T09:00:00Z", endsAt: "2026-11-15T08:00:00Z" },
    { enabled: "true", startsAt: "2026-11-15T08:00:00Z", endsAt: "2026-11-15T09:00:00Z" },
    { enabled: true, startsAt: "2026-11-15T08:00:00Z", endsAt: "2026-11-15T09:00:00Z", isAdmin: true },
    { enabled: false, startsAt: null, endsAt: null },
  ]) {
    assert.throws(() => controller.update(body, request), BadRequestException);
  }
});

test("maintenance API normalizes explicit offset timestamps to UTC instants", async () => {
  let savedInput;
  const controller = new MaintenanceAdminController({
    updateSchedule: async (input) => {
      savedInput = input;
      return input;
    },
  });

  await controller.update(
    {
      enabled: true,
      startsAt: "2026-11-15T17:00:00+09:00",
      endsAt: "2026-11-15T18:00:00+09:00",
    },
    { user: { userId: actorId } },
  );

  assert.equal(savedInput.startsAt.toISOString(), startsAt.toISOString());
  assert.equal(savedInput.endsAt.toISOString(), endsAt.toISOString());
});

test("maintenance routes authenticate notices and restrict schedule management to admins", async () => {
  let activeNotice = {
    active: true,
    startsAt: "2026-11-15T08:00:00.000Z",
    endsAt: "2026-11-15T09:00:00.000Z",
  };
  const service = {
    getSchedule: async () => ({
      enabled: false,
      startsAt: null,
      endsAt: null,
    }),
    updateSchedule: async ({ enabled, startsAt: start, endsAt: end }) => ({
      enabled,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }),
    getActiveNotice: async () => activeNotice,
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [MaintenanceAdminController, MaintenanceNoticeController],
    providers: [
      JwtAuthGuard,
      AdminAuthGuard,
      {
        provide: AuthenticationService,
        useValue: {
          verifySession: async (token) => ({
            userId: token === "admin" ? actorId : "user-id",
            isAdmin: token === "admin",
          }),
        },
      },
      { provide: MaintenanceService, useValue: service },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);

  try {
    const origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    assert.equal(
      (await fetch(`${origin}/maintenance-notice`)).status,
      401,
    );
    assert.equal(
      (await fetch(`${origin}/admin/maintenance-schedule`, {
        headers: { Authorization: "Bearer user" },
      })).status,
      403,
    );
    const publicResponse = await fetch(`${origin}/maintenance-notice`, {
      headers: { Authorization: "Bearer user" },
    });
    assert.equal(publicResponse.status, 200);
    assert.deepEqual(await publicResponse.json(), {
      active: true,
      startsAt: "2026-11-15T08:00:00.000Z",
      endsAt: "2026-11-15T09:00:00.000Z",
    });
    activeNotice = { active: false };
    const inactiveResponse = await fetch(`${origin}/maintenance-notice`, {
      headers: { Authorization: "Bearer user" },
    });
    assert.equal(inactiveResponse.status, 200);
    assert.deepEqual(await inactiveResponse.json(), { active: false });
    const adminResponse = await fetch(`${origin}/admin/maintenance-schedule`, {
      headers: { Authorization: "Bearer admin" },
    });
    assert.equal(adminResponse.status, 200);
    assert.deepEqual(await adminResponse.json(), {
      enabled: false,
      startsAt: null,
      endsAt: null,
    });
    const deniedUpdate = await fetch(`${origin}/admin/maintenance-schedule`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
        startsAt: "2026-11-15T08:00:00Z",
        endsAt: "2026-11-15T09:00:00Z",
      }),
    });
    assert.equal(deniedUpdate.status, 403);
    const invalidUpdate = await fetch(`${origin}/admin/maintenance-schedule`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
        startsAt: "2026-11-15T08:00:00",
        endsAt: "2026-11-15T09:00:00Z",
      }),
    });
    assert.equal(invalidUpdate.status, 400);
    const savedUpdate = await fetch(`${origin}/admin/maintenance-schedule`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
        startsAt: "2026-11-15T08:00:00Z",
        endsAt: "2026-11-15T09:00:00Z",
      }),
    });
    assert.equal(savedUpdate.status, 200);
    assert.deepEqual(await savedUpdate.json(), {
      enabled: true,
      startsAt: "2026-11-15T08:00:00.000Z",
      endsAt: "2026-11-15T09:00:00.000Z",
    });
  } finally {
    await app.close();
  }
});
