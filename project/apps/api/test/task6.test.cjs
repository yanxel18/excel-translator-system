const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { Test } = require("@nestjs/testing");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  ProductSurfacesController,
} = require("../dist/modules/product-surfaces/product-surfaces.controller");
const {
  ProductSurfacesService,
} = require("../dist/modules/product-surfaces/product-surfaces.service");

let app;
let service;
let baseUrl;
const calls = [];

before(async () => {
  service = {
    history: async (...args) => {
      calls.push(["history", ...args]);
      return {
        data: [
          {
            id: "d5a04720-d839-4d8c-bfc2-d6310970bca1",
            fileName: "report.xlsx",
          },
        ],
        nextCursor: "d5a04720-d839-4d8c-bfc2-d6310970bca1",
      };
    },
    previewFile: async (...args) => {
      calls.push(["previewFile", ...args]);
      return Buffer.from("PK-preview-bytes");
    },
    preview: async (...args) => {
      calls.push(["preview", ...args]);
      return {
        fileName: "report.xlsx",
        version: args[2],
        sheets: [{ name: "Sheet1", rows: [["A"]] }],
      };
    },
    deleteHistoryItem: async (...args) => {
      calls.push(["delete", ...args]);
      return { ok: true };
    },
    getProfile: async (...args) => {
      calls.push(["profile", ...args]);
      return { id: "user-1", username: "test" };
    },
    updateProfile: async (...args) => {
      calls.push(["updateProfile", ...args]);
      return { id: "user-1", username: "test", fullName: args[1].fullName };
    },
    changelog: async (...args) => {
      calls.push(["changelog", ...args]);
      return { data: [], nextCursor: null };
    },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [ProductSurfacesController],
    providers: [{ provide: ProductSurfacesService, useValue: service }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context) => {
        const req = context.switchToHttp().getRequest();
        if (req.headers.authorization !== "Bearer test-token") return false;
        req.user = { userId: "user-1" };
        return true;
      },
    })
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});

after(async () => {
  await app?.close();
});

test("product surface routes enforce authentication and pass the authenticated owner to services", async () => {
  const denied = await fetch(`${baseUrl}/history`);
  assert.equal(denied.status, 403);

  const headers = {
    Authorization: "Bearer test-token",
    "Content-Type": "application/json",
  };
  const history = await fetch(
    `${baseUrl}/history?cursor=d5a04720-d839-4d8c-bfc2-d6310970bca2`,
    { headers },
  );
  assert.equal(history.status, 200);
  assert.deepEqual(await history.json(), {
    data: [
      { id: "d5a04720-d839-4d8c-bfc2-d6310970bca1", fileName: "report.xlsx" },
    ],
    nextCursor: "d5a04720-d839-4d8c-bfc2-d6310970bca1",
  });

  const preview = await fetch(
    `${baseUrl}/jobs/d5a04720-d839-4d8c-bfc2-d6310970bca1/preview?version=source`,
    { headers },
  );
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).sheets[0].rows[0][0], "A");

  const deleted = await fetch(
    `${baseUrl}/jobs/d5a04720-d839-4d8c-bfc2-d6310970bca1`,
    { method: "DELETE", headers },
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { ok: true });

  assert.deepEqual(calls, [
    ["history", "user-1", "d5a04720-d839-4d8c-bfc2-d6310970bca2", 1],
    ["preview", "d5a04720-d839-4d8c-bfc2-d6310970bca1", "user-1", "source"],
    ["delete", "d5a04720-d839-4d8c-bfc2-d6310970bca1", "user-1"],
  ]);
});

test("binary preview requires authentication and forwards owner and selected version", async () => {
  const denied = await fetch(
    `${baseUrl}/jobs/d5a04720-d839-4d8c-bfc2-d6310970bca1/preview-file?version=source`,
  );
  assert.equal(denied.status, 403);
  const response = await fetch(
    `${baseUrl}/jobs/d5a04720-d839-4d8c-bfc2-d6310970bca1/preview-file?version=source`,
    { headers: { Authorization: "Bearer test-token" } },
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.equal(await response.text(), "PK-preview-bytes");
  assert.deepEqual(calls.at(-1), [
    "previewFile",
    "d5a04720-d839-4d8c-bfc2-d6310970bca1",
    "user-1",
    "source",
  ]);
});
