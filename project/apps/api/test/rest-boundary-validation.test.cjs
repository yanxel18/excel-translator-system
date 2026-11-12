const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  JobManagementController,
} = require("../dist/modules/job-management/job-management.controller");
const {
  DatabaseJobManagementService,
} = require("../dist/modules/job-management/database-job-management.service");
const {
  ProductSurfacesController,
} = require("../dist/modules/product-surfaces/product-surfaces.controller");
const {
  ProductSurfacesService,
} = require("../dist/modules/product-surfaces/product-surfaces.service");
const {
  NotificationsController,
} = require("../dist/modules/notifications/notifications.controller");
const {
  NotificationsService,
} = require("../dist/modules/notifications/notifications.service");
test("job, history and notification endpoints validate request boundaries", async () => {
  const id = "d5a04720-d839-4d8c-bfc2-d6310970bca1";
  let history, profileData;
  const surfaces = new ProductSurfacesService({
    user: {
      update: async ({ data }) => {
        profileData = data;
        return data;
      },
    },
  });
  surfaces.history = async (...args) => {
    history = args;
    return {};
  };
  surfaces.preview = async () => ({});
  const moduleRef = await Test.createTestingModule({
    controllers: [
      JobManagementController,
      ProductSurfacesController,
      NotificationsController,
    ],
    providers: [
      {
        provide: DatabaseJobManagementService,
        useValue: {
          getJob: async () => ({}),
          updateJobSettings: async () => ({}),
        },
      },
      { provide: ProductSurfacesService, useValue: surfaces },
      {
        provide: NotificationsService,
        useValue: { markRead: async () => ({}), list: async () => ({}) },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (ctx) => {
        ctx.switchToHttp().getRequest().user = { userId: "user" };
        return true;
      },
    })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const patch = (path, body) =>
      fetch(base + path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await fetch(base + "/jobs/bad")).status, 400);
    assert.equal((await fetch(base + "/jobs/" + id)).status, 200);
    assert.equal((await fetch(base + "/jobs/bad/preview")).status, 400);
    assert.equal(
      (await patch("/jobs/" + id + "/settings", { unexpected: true })).status,
      400,
    );
    assert.equal(
      (await patch("/jobs/" + id + "/settings", { selectedSheets: ["Sheet1"] }))
        .status,
      200,
    );
    for (const query of [
      "page=0",
      "page=1.5",
      "page=100001",
      "page=1&extra=x",
      "cursor=bad",
      "pageSize=500",
      "sort=unknown",
      "page=1&page=2",
    ]) {
      assert.equal(
        (await fetch(base + "/history?" + query)).status,
        400,
        query,
      );
    }
    assert.equal((await fetch(base + "/history?sort=createdAt")).status, 200);
    assert.equal((await fetch(base + "/history?page=2")).status, 200);
    assert.deepEqual(history, ["user", undefined, 2]);
    assert.equal(
      (await fetch(base + "/jobs/" + id + "/preview?version=bad")).status,
      400,
    );
    assert.equal((await patch("/notifications/bad/read", {})).status, 400);
    assert.equal((await fetch(base + "/notifications?cursor=bad")).status, 400);
    for (const path of [
      "/notifications?extra=x",
      "/changelog?extra=x",
      "/jobs/" + id + "/preview?extra=x",
      "/jobs/" + id + "/preview-file?extra=x",
    ])
      assert.equal((await fetch(base + path)).status, 400, path);
    for (const body of [
      { email: "not-an-email" },
      { email: " user@example.com " },
      { fullName: "漢".repeat(121) },
      { fullName: "山田", unexpected: true },
    ])
      assert.equal(
        (await patch("/profile", body)).status,
        400,
        JSON.stringify(body),
      );
    assert.equal(
      (
        await patch("/profile", {
          fullName: "山田 太郎",
          email: "user@example.com",
        })
      ).status,
      200,
    );
    assert.deepEqual(profileData, {
      fullName: "山田 太郎",
      email: "user@example.com",
    });
  } finally {
    await app.close();
  }
});
