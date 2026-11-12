const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { unlink, writeFile } = require("node:fs/promises");
const JSZip = require("jszip");
const { Language } = require("../dist/generated/prisma/client");
const {
  DatabaseJobManagementService,
} = require("../dist/modules/job-management/database-job-management.service");
const {
  isSupportedLanguagePair,
  SUPPORTED_LANGUAGE_PAIRS,
} = require("../dist/modules/job-management/language-pairs");
const {
  TextExtractionService,
} = require("../dist/modules/text-extraction/text-extraction.service");
const {
  TranslationService,
} = require("../dist/modules/translation/translation.service");
const {
  VocabularyService,
} = require("../dist/modules/vocabulary/vocabulary.service");

async function makeWorkbook() {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" r:id="rId1"/><sheet name="Second" r:id="rId2"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
  );
  zip.file(
    "xl/sharedStrings.xml",
    "<sst><si><t>Shared selected</t></si><si><t>Shared unselected</t></si></sst>",
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Inline selected</t></is></c></row></sheetData></worksheet>',
  );
  zip.file(
    "xl/worksheets/sheet2.xml",
    '<worksheet><sheetData><row><c r="A1" t="s"><v>1</v></c></row></sheetData></worksheet>',
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function makeVocabularyPrisma() {
  const groups = [];
  const entries = [];
  let id = 0;
  const matching = (row, where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  return {
    groups,
    entries,
    translationJob: { findFirst: async () => null },
    vocabularyGroup: {
      findMany: async ({ where }) =>
        groups
          .filter((group) => matching(group, where))
          .map((group) => ({
            ...group,
            entries: entries.filter((entry) => entry.groupId === group.id),
          })),
      findFirst: async ({ where }) =>
        groups.find((group) => matching(group, where)) || null,
      create: async ({ data }) => {
        const group = { id: `group-${++id}`, ...data };
        groups.push(group);
        return { ...group, entries: [] };
      },
      update: async ({ where, data }) => {
        const group = groups.find((row) => matching(row, where));
        Object.assign(group, data);
        return {
          ...group,
          entries: entries.filter((entry) => entry.groupId === group.id),
        };
      },
      delete: async ({ where }) => {
        const index = groups.findIndex((row) => matching(row, where));
        const [group] = groups.splice(index, 1);
        return group;
      },
    },
    vocabularyEntry: {
      count: async ({ where }) =>
        entries.filter((entry) => matching(entry, where)).length,
      create: async ({ data }) => {
        const entry = { id: `entry-${++id}`, ...data };
        entries.push(entry);
        return entry;
      },
      findFirst: async ({ where }) =>
        entries.find((entry) => matching(entry, where)) || null,
      update: async ({ where, data }) => {
        const entry = entries.find((row) => matching(row, where));
        Object.assign(entry, data);
        return entry;
      },
      delete: async ({ where }) => {
        const index = entries.findIndex((row) => matching(row, where));
        return entries.splice(index, 1)[0];
      },
    },
  };
}

test("worksheet discovery and extraction include only selected sheets", async () => {
  const extraction = new TextExtractionService();
  const workbook = await makeWorkbook();
  assert.deepEqual(await extraction.getSheetNames(workbook), [
    "First",
    "Second",
  ]);
  const extracted = await extraction.extractTextFromXlsx(workbook, ["First"]);
  assert.deepEqual(
    extracted.map(({ value }) => value),
    ["Shared selected", "Inline selected"],
  );
});

test("all distinct English, Japanese, and Chinese language pairs are supported", () => {
  assert.equal(SUPPORTED_LANGUAGE_PAIRS.length, 6);
  assert.equal(
    isSupportedLanguagePair(Language.JAPANESE, Language.ENGLISH),
    true,
  );
  assert.equal(
    isSupportedLanguagePair(Language.ENGLISH, Language.CHINESE),
    true,
  );
  assert.equal(
    isSupportedLanguagePair(Language.JAPANESE, Language.JAPANESE),
    false,
  );
  assert.equal(isSupportedLanguagePair("KOREAN", Language.ENGLISH), false);
});

test("vocabulary groups and protected terms support owner-scoped CRUD", async () => {
  const prisma = makeVocabularyPrisma();
  const service = new VocabularyService(prisma);
  const group = await service.createGroup("owner-1", {
    name: "Product terms",
    description: "Brand names",
    sourceLanguage: Language.JAPANESE,
    targetLanguage: Language.ENGLISH,
  });
  const entry = await service.createEntry(group.id, "owner-1", {
    source: "株式会社",
    target: "Acme Inc.",
  });
  assert.deepEqual(await service.list("owner-2"), []);
  assert.equal(
    (await service.list("owner-1"))[0].entries[0].target,
    "Acme Inc.",
  );
  assert.equal(
    (await service.updateGroup(group.id, "owner-1", { name: "Brand terms" }))
      .name,
    "Brand terms",
  );
  await assert.rejects(
    service.updateGroup(group.id, "owner-2", { name: "Stolen group" }),
    (error) => error.status === 404,
  );
  assert.equal(
    (
      await service.updateEntry(group.id, entry.id, "owner-1", {
        target: "Acme Corporation",
      })
    ).target,
    "Acme Corporation",
  );
  assert.deepEqual(await service.deleteEntry(group.id, entry.id, "owner-1"), {
    ok: true,
  });
  assert.deepEqual(await service.deleteGroup(group.id, "owner-1"), {
    ok: true,
  });
  await assert.rejects(
    service.createGroup("owner-1", {
      name: "Bad pair",
      sourceLanguage: "JAPANESE",
      targetLanguage: "JAPANESE",
    }),
    (error) => error.status === 400,
  );
});

test("job settings reject vocabulary groups for a different language pair", async (context) => {
  const sourcePath = join(tmpdir(), `task4-${randomUUID()}.xlsx`);
  await writeFile(sourcePath, "fixture");
  context.after(() => unlink(sourcePath).catch(() => undefined));
  const job = {
    id: "job-1",
    ownerId: "owner-1",
    status: "PENDING",
    fileName: "source.xlsx",
    fileSize: 7,
    progress: 0,
    sourcePath,
    selectedSheets: ["First"],
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    vocabularyGroupId: null,
  };
  let updateCount = 0;
  const prisma = {
    translationJob: {
      findUnique: async () => job,
      updateManyAndReturn: async ({ data }) => {
        updateCount++;
        return [{ ...job, ...data }];
      },
    },
    vocabularyGroup: {
      findFirst: async ({ where }) =>
        where.sourceLanguage === "JAPANESE" &&
        where.targetLanguage === "ENGLISH"
          ? { id: where.id }
          : null,
    },
  };
  const service = new DatabaseJobManagementService(
    prisma,
    { getSheetNames: async () => ["First"] },
    {},
  );
  await assert.rejects(
    service.updateJobSettings("job-1", "owner-1", null),
    (error) => error.status === 400,
  );
  await assert.rejects(
    service.updateJobSettings("job-1", "owner-1", {
      selectedSheets: ["First"],
      sourceLanguage: "JAPANESE",
      targetLanguage: "CHINESE",
      vocabularyGroupId: "group-1",
    }),
    (error) => error.status === 400,
  );
  assert.equal(updateCount, 0);
  const updated = await service.updateJobSettings("job-1", "owner-1", {
    selectedSheets: ["First"],
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    vocabularyGroupId: "group-1",
  });
  assert.equal(updated.vocabularyGroupId, "group-1");
  await assert.rejects(
    service.updateJobSettings("job-1", "owner-1", {
      selectedSheets: ["First"],
      sourceLanguage: "JAPANESE",
      targetLanguage: "JAPANESE",
    }),
    (error) => error.status === 400,
  );
});

test("personal workbook activity is selected only for the authenticated owner", async () => {
  const rows = [
    {
      id: "owned-job",
      ownerId: "owner-1",
      status: "COMPLETED",
      fileName: "owned.xlsx",
      fileSize: 1,
      progress: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      selectedSheets: [],
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      vocabularyGroupId: null,
    },
    {
      id: "foreign-job",
      ownerId: "owner-2",
      status: "COMPLETED",
      fileName: "foreign.xlsx",
      fileSize: 1,
      progress: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      selectedSheets: [],
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      vocabularyGroupId: null,
    },
  ];
  let query;
  const service = new DatabaseJobManagementService(
    {
      translationJob: {
        findMany: async (input) => {
          query = input;
          return rows.filter((row) => row.ownerId === input.where.ownerId);
        },
      },
    },
    {},
    {},
  );

  const jobs = await service.getJobList("owner-1");

  assert.deepEqual(query, {
    where: { ownerId: "owner-1" },
    orderBy: { createdAt: "desc" },
  });
  assert.deepEqual(
    jobs.map((job) => job.id),
    ["owned-job"],
  );
});

test("protected terms are restored exactly after model translation", async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.OLLAMA_URL;
  process.env.OLLAMA_URL = "http://ollama.test";
  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = originalUrl;
  });
  let submittedText = "";
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const input = JSON.parse(payload.messages[1].content);
    submittedText = input.translations[0].text;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          content: JSON.stringify({
            translations: input.translations.map(({ id, text }) => ({
              id,
              translated: `Translated ${text}`,
            })),
          }),
        },
      }),
    };
  };
  const service = new TranslationService({});
  const result = await service.sendTextForTranslation(
    [{ id: "row-1", value: "東京都で東京へ" }],
    undefined,
    undefined,
    {
      sourceLanguage: Language.JAPANESE,
      targetLanguage: Language.ENGLISH,
    },
    [
      { source: "東京", target: "Tokyo" },
      { source: "東京都", target: "Tokyo Metropolis" },
    ],
  );
  assert.match(submittedText, /XLT_PROTECTED_/);
  assert.equal(result[0].translated, "Translated Tokyo MetropolisでTokyoへ");
});

test("model runtime failures surface actionable diagnostics without exposing server output", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({
      error: "CUDA error: shared object initialization failed",
    }),
  });
  const service = new TranslationService({});
  await assert.rejects(
    service.sendTextForTranslation([{ id: "row-1", value: "hello" }]),
    (error) =>
      error.status === 503 &&
      /GPU/.test(error.message) &&
      !error.message.includes("shared object"),
  );
});
