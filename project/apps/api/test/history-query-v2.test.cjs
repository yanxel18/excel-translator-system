const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  ProductSurfacesController,
} = require("../dist/modules/product-surfaces/product-surfaces.controller");
const {
  ProductSurfacesService,
} = require("../dist/modules/product-surfaces/product-surfaces.service");
const {
  parseHistoryQuery,
} = require("../dist/modules/product-surfaces/history-query");

test("parses history search, filters, sorting, and bounded pagination", () => {
  assert.deepEqual(
    parseHistoryQuery({
      q: "  Annual Report  ",
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      sort: "fileName",
      direction: "asc",
      page: "2",
      pageSize: "20",
    }),
    {
      q: "Annual Report",
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      sort: "fileName",
      direction: "asc",
      page: 2,
      pageSize: 20,
      cursor: undefined,
    },
  );
  assert.deepEqual(parseHistoryQuery({}), {
    q: undefined,
    sourceLanguage: undefined,
    targetLanguage: undefined,
    sort: "createdAt",
    direction: "desc",
    page: 1,
    pageSize: 10,
    cursor: undefined,
  });
});

test("rejects unknown history filters and unsupported search, sort, direction, or page sizes", () => {
  for (const query of [
    { status: "COMPLETED" },
    { sourceLanguage: "KOREAN" },
    { targetLanguage: ["ENGLISH"] },
    { q: "x".repeat(201) },
    { sort: "ownerId" },
    { direction: "sideways" },
    { page: "0" },
    { pageSize: "15" },
  ]) {
    assert.throws(
      () => parseHistoryQuery(query),
      (error) => error.status === 400,
    );
  }
});

test("combines owner and history filters for both rows and count with deterministic ordering", async () => {
  const rows = [{ id: "job-2", fileName: "Annual Report.xlsx" }];
  const calls = {};
  const prisma = {
    translationJob: {
      findMany: async (args) => {
        calls.findMany = args;
        return rows;
      },
      count: async (args) => {
        calls.count = args;
        return 31;
      },
    },
  };
  const service = new ProductSurfacesService(prisma);

  const result = await service.history(
    "owner-1",
    parseHistoryQuery({
      q: " completed ",
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      sort: "createdAt",
      direction: "desc",
      page: "2",
      pageSize: "10",
    }),
  );

  const expectedWhere = {
    ownerId: "owner-1",
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    OR: [
      { fileName: { contains: "completed", mode: "insensitive" } },
      { status: "COMPLETED" },
    ],
  };
  assert.deepEqual(calls.findMany.where, expectedWhere);
  assert.deepEqual(calls.count.where, expectedWhere);
  assert.deepEqual(calls.findMany.orderBy, [
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(calls.findMany.skip, 10);
  assert.equal(calls.findMany.take, 10);
  assert.deepEqual(result, {
    data: rows,
    total: 31,
    page: 2,
    pageSize: 10,
    nextCursor: "job-2",
  });
});

test("history endpoints validate filters and bind results to the authenticated owner", async () => {
  let call;
  const controller = new ProductSurfacesController({
    history: async (...args) => {
      call = args;
      return { data: [], total: 0, page: 1, pageSize: 10 };
    },
  });
  const req = { user: { userId: "owner-7" } };

  await controller.historyList(req, {
    q: "  book  ",
    sourceLanguage: "CHINESE",
    pageSize: "50",
  });
  assert.equal(call[0], "owner-7");
  assert.deepEqual(call[1], {
    q: "book",
    sourceLanguage: "CHINESE",
    targetLanguage: undefined,
    sort: "createdAt",
    direction: "desc",
    page: 1,
    pageSize: 50,
    cursor: undefined,
  });
  assert.throws(
    () => controller.historyList(req, { source: "JAPANESE" }),
    (error) => error.status === 400,
  );
});

test("rejects a history cursor owned by another user", async () => {
  let cursorLookup;
  const service = new ProductSurfacesService({
    translationJob: {
      findFirst: async (args) => {
        cursorLookup = args;
        return null;
      },
      findMany: async () =>
        assert.fail("must not fetch history for a foreign cursor"),
      count: async () => 0,
    },
  });
  await assert.rejects(
    service.history(
      "owner-1",
      parseHistoryQuery({ cursor: "d5a04720-d839-4d8c-bfc2-d6310970bca1" }),
    ),
    (error) => error.status === 400,
  );
  assert.deepEqual(cursorLookup.where, {
    id: "d5a04720-d839-4d8c-bfc2-d6310970bca1",
    ownerId: "owner-1",
  });
});
