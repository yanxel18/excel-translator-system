const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const { PrismaService } = require("../dist/modules/persistence/prisma.service");
const {
  ProgressTrackingService,
} = require("../dist/modules/progress-tracking/progress-tracking.service");
const {
  ProgressTrackingController,
} = require("../dist/modules/progress-tracking/progress-tracking.controller");
test("progress endpoints require ownership and validate input", async () => {
  const id = "d5a04720-d839-4d8c-bfc2-d6310970bca1";
  const moduleRef = await Test.createTestingModule({
    controllers: [ProgressTrackingController],
    providers: [
      ProgressTrackingService,
      {
        provide: PrismaService,
        useValue: {
          translationJob: {
            findFirst: async ({ where }) =>
              where.id === id && where.ownerId === "owner" ? { id } : null,
          },
        },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (ctx) => {
        ctx.switchToHttp().getRequest().user = {
          userId: ctx.switchToHttp().getRequest().headers["x-user"],
        };
        return true;
      },
    })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/progress/${id}`;
    const request = (path, user, method = "GET", body) =>
      fetch(base + path, {
        method,
        headers: { "x-user": user, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.equal(
      (await request("/save", "owner", "POST", { count: 1 })).status,
      201,
    );
    assert.equal((await request("", "owner")).status, 200);
    assert.equal((await request("", "other")).status, 404);
    assert.equal(
      (await request("/save", "other", "POST", { count: 2 })).status,
      404,
    );
    assert.equal((await request("/recover", "other", "POST")).status, 404);
    assert.equal((await request("/save", "owner", "POST", [])).status, 400);
    assert.equal(
      (await request("/save", "owner", "POST", { data: "a".repeat(65536) }))
        .status,
      400,
    );
    assert.equal((await (await request("", "owner")).json()).count, 1);
  } finally {
    await app.close();
  }
});
