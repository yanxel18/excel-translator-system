const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");
const {
  SystemInfoController,
  getTokyoCalendarYear,
} = require("../dist/modules/system-info/system-info.controller");

test("system info uses the Tokyo calendar year across UTC year boundaries", () => {
  assert.equal(
    getTokyoCalendarYear(new Date("2026-12-31T14:59:59.999Z")),
    2026,
  );
  assert.equal(
    getTokyoCalendarYear(new Date("2026-12-31T15:00:00.000Z")),
    2027,
  );
});

test("system info is public and returns a short-cache year response", async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [SystemInfoController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);

  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/system/info`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300");
    assert.deepEqual(body, { year: getTokyoCalendarYear() });
  } finally {
    await app.close();
  }
});
