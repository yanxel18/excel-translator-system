const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BadRequestException } = require("@nestjs/common");
const {
  TranslationController,
} = require("../dist/modules/translation/translation.controller");
const {
  TextExtractionController,
} = require("../dist/modules/text-extraction/text-extraction.controller");
const {
  ProductSurfacesResolver,
} = require("../dist/modules/product-surfaces/graphql.resolver");
const { Test } = require("@nestjs/testing");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  TranslationService,
} = require("../dist/modules/translation/translation.service");
const {
  TextExtractionService,
} = require("../dist/modules/text-extraction/text-extraction.service");

test("legacy workbook endpoints validate input and accept Unicode and JSON buffers", async () => {
  let batch, bytes;
  const translation = new TranslationController({
    sendTextForTranslation: async (value) => {
      batch = value;
      return [];
    },
    validateTranslation: async () => true,
    patchOOXML: async (value) => {
      bytes = value;
      return value;
    },
  });
  const extraction = new TextExtractionController({
    extractTextFromXlsx: async (value) => {
      bytes = value;
      return [];
    },
  });
  await assert.rejects(
    () =>
      translation.sendTextForTranslation({
        textBatch: [{ id: "x", value: "字" }],
        extra: 1,
      }),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      translation.sendTextForTranslation({
        textBatch: [{ id: "x", value: 5 }],
      }),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      translation.sendTextForTranslation({
        textBatch: [{ id: "x", value: "あ".repeat(30000) }],
      }),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      translation.sendTextForTranslation({
        textBatch: [{ id: "x", value: "漢字", extra: true }],
      }),
    BadRequestException,
  );
  await translation.sendTextForTranslation({
    textBatch: [
      {
        id: "shared:0",
        value: "日本語",
        source: "shared",
        part: "xl/sharedStrings.xml",
        index: 0,
      },
    ],
  });
  assert.equal(batch[0].value, "日本語");
  await assert.rejects(
    () =>
      extraction.extractText({ fileBuffer: { type: "Buffer", data: [256] } }),
    BadRequestException,
  );
  await extraction.extractText({
    fileBuffer: { type: "Buffer", data: [80, 75] },
  });
  assert.ok(Buffer.isBuffer(bytes));
  await assert.rejects(
    () =>
      translation.patchOOXML({
        originalFileBuffer: { type: "Buffer", data: [80, 75] },
        translations: [{ id: "a", translated: "x", extra: true }],
      }),
    BadRequestException,
  );
});

test("GraphQL resolver applies REST ID, cursor, and version rules", () => {
  const surfaces = {
    history: (...args) => args,
    preview: (...args) => args,
    changelog: (...args) => args,
  };
  const notifications = {
    list: (...args) => args,
    markRead: (...args) => args,
  };
  const resolver = new ProductSurfacesResolver(surfaces, notifications);
  const context = { req: { user: { userId: "owner" } } };
  const id = "d5a04720-d839-4d8c-bfc2-d6310970bca1";
  assert.throws(
    () => resolver.history(context, "invalid"),
    BadRequestException,
  );
  assert.throws(
    () => resolver.notifications(context, "invalid"),
    BadRequestException,
  );
  assert.throws(
    () => resolver.preview(context, id, "bad"),
    BadRequestException,
  );
  assert.throws(
    () => resolver.markNotificationRead(context, "invalid"),
    BadRequestException,
  );
  assert.throws(() => resolver.changelog("x".repeat(129)), BadRequestException);
  assert.deepEqual(resolver.preview(context, id, "source"), [
    id,
    "owner",
    "source",
  ]);
});

test("legacy REST routes return 400 for malformed input through HTTP", async () => {
  let translatedBatch;
  const moduleRef = await Test.createTestingModule({
    controllers: [TranslationController, TextExtractionController],
    providers: [
      {
        provide: TranslationService,
        useValue: {
          sendTextForTranslation: async (batch) => {
            translatedBatch = batch;
            return [];
          },
        },
      },
      {
        provide: TextExtractionService,
        useValue: { extractTextFromXlsx: async () => [] },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const send = (path, body) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await send("/translate/send", { textBatch: [{ id: "a", value: 4 }] }))
        .status,
      400,
    );
    assert.equal(
      (
        await send("/translate/send", {
          textBatch: [{ id: "a", value: "日本語", unknown: true }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send("/translate/send", {
          textBatch: [{ id: "a", value: "x".repeat(70 * 1024) }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send("/translate/send", {
          textBatch: [
            {
              id: "shared:0",
              value: "日本語",
              source: "shared",
              part: "xl/sharedStrings.xml",
              index: 0,
            },
          ],
        })
      ).status,
      201,
    );
    assert.equal(translatedBatch[0].value, "日本語");
    const stringCell = {
      id: "cell:xl/worksheets/sheet1.xml:0",
      value: "Hello",
      source: "cell",
      part: "xl/worksheets/sheet1.xml",
      index: 0,
    };
    assert.equal((await send("/translate/send", { textBatch: [stringCell] })).status, 201);
    assert.deepEqual(translatedBatch, [stringCell]);
    assert.equal(
      (await send("/extract", { fileBuffer: { type: "Buffer", data: [256] } }))
        .status,
      400,
    );
    assert.equal(
      (
        await send("/extract", {
          fileBuffer: { type: "Buffer", data: [80, 75] },
          extra: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send("/extract", {
          fileBuffer: { type: "Buffer", data: [80, 75] },
        })
      ).status,
      201,
    );
  } finally {
    await app.close();
  }
});
