const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { mkdir, rm, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const databaseUrl = process.env.V3_TEST_DATABASE_URL;
const allowedDatabaseName = "v3_translation_concurrency_disposable";

if (databaseUrl) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    parsedDatabaseUrl.hostname !== "127.0.0.1" ||
    parsedDatabaseUrl.pathname.slice(1) !== allowedDatabaseName
  ) {
    throw new Error(
      `PostgreSQL concurrency tests only run against ${allowedDatabaseName} on 127.0.0.1.`,
    );
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Timed out waiting for PostgreSQL job state.");
}

async function waitForSignal(promise, message, timeoutMs = 10000) {
  let timeout;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

test(
  "PostgreSQL enforces concurrency admission, singleton ownership, recovery, and slot release",
  { skip: !databaseUrl, timeout: 60000 },
  async (t) => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLimit = process.env.MAX_CONCURRENT_TRANSLATIONS;
    const previousDataDir = process.env.DATA_DIR;
    const dataDir = join(
      __dirname,
      `.translation-concurrency-postgres-${randomUUID()}`,
    );
    const userId = randomUUID();
    const jobIds = {
      pending: randomUUID(),
      failed: randomUUID(),
      interrupted: randomUUID(),
    };
    const started = deferred();
    const releaseFirstTranslation = deferred();
    let translationCalls = 0;
    let prisma;
    let service;

    process.env.DATABASE_URL = databaseUrl;
    process.env.MAX_CONCURRENT_TRANSLATIONS = "1";
    process.env.DATA_DIR = dataDir;

    try {
      await mkdir(dataDir, { recursive: true });

      const { PrismaService } = require(
        "../dist/modules/persistence/prisma.service",
      );
      const { DatabaseJobManagementService } = require(
        "../dist/modules/job-management/database-job-management.service",
      );
      prisma = new PrismaService();

      const user = await prisma.user.create({
        data: {
          id: userId,
          username: `concurrency-test-${userId}`,
        },
      });
      t.diagnostic("Created a disposable PostgreSQL test user.");

      async function createJob(id, status) {
        const sourcePath = join(dataDir, `${id}.source.xlsx`);
        await writeFile(sourcePath, Buffer.from("disposable test workbook"));
        return prisma.translationJob.create({
          data: {
            id,
            ownerId: user.id,
            status,
            fileName: `${id}.xlsx`,
            fileSize: 1,
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sourceLanguage: "JAPANESE",
            targetLanguage: "ENGLISH",
            selectedSheets: ["Sheet1"],
            sourcePath,
          },
        });
      }

      await createJob(jobIds.pending, "PENDING");
      await createJob(jobIds.failed, "FAILED");
      await createJob(jobIds.interrupted, "PROCESSING");
      t.diagnostic("Seeded pending, failed, and interrupted jobs.");

      service = new DatabaseJobManagementService(
        prisma,
        {
          getSheetNames: async () => ["Sheet1"],
          extractTextFromXlsx: async () => [],
        },
        {
          sendTextForTranslation: async () => {
            const call = translationCalls++;
            if (call === 0) {
              started.resolve();
              await releaseFirstTranslation.promise;
              return [];
            }
            if (call === 1) throw new Error("Intentional test failure.");
            return [];
          },
          patchOOXML: async () => Buffer.from("translated test workbook"),
        },
      );
      await service.onModuleInit();
      t.diagnostic("Initialized the service and recovered interrupted work.");

      const recovered = await prisma.translationJob.findUniqueOrThrow({
        where: { id: jobIds.interrupted },
      });
      assert.equal(recovered.status, "FAILED");
      assert.match(recovered.error, /API restarted/);

      const competingPrisma = new PrismaService();
      const competingService = new DatabaseJobManagementService(
        competingPrisma,
        {},
        {},
      );
      try {
        await assert.rejects(
          competingService.onModuleInit(),
          /Only one API instance may use this database/,
        );
      } finally {
        await competingService.onModuleDestroy();
        await competingPrisma.$disconnect();
      }
      t.diagnostic("Confirmed second API instance exclusion.");

      const attempts = await Promise.allSettled([
        service.startJob(jobIds.pending, user.id),
        service.retryJob(jobIds.failed, user.id),
      ]);

      assert.equal(
        attempts.filter((attempt) => attempt.status === "fulfilled").length,
        1,
        `admission results: ${attempts
          .map((attempt) =>
            attempt.status === "fulfilled"
              ? "admitted"
              : `${attempt.reason.status ?? "error"} ${attempt.reason.message}`,
          )
          .join("; ")}`,
      );
      await waitForSignal(
        started.promise,
        "Admitted job worker did not start.",
      );
      t.diagnostic("Observed one concurrent admission and one capacity rejection.");
      const rejected = attempts.find(
        (attempt) => attempt.status === "rejected",
      );
      assert.equal(rejected.reason.status, 409);
      assert.match(rejected.reason.message, /capacity.*1/i);
      assert.equal(
        await prisma.translationJob.count({ where: { status: "PROCESSING" } }),
        1,
      );

      releaseFirstTranslation.resolve();
      await waitFor(async () => {
        const job = await prisma.translationJob.findFirst({
          where: {
            id: { in: [jobIds.pending, jobIds.failed] },
            status: "COMPLETED",
          },
        });
        return Boolean(job);
      });

      const retryableId =
        attempts[0].status === "rejected" ? jobIds.pending : jobIds.failed;
      const startOrRetry =
        retryableId === jobIds.pending
          ? service.startJob(retryableId, user.id)
          : service.retryJob(retryableId, user.id);
      await startOrRetry;
      await waitFor(async () => {
        const job = await prisma.translationJob.findUnique({
          where: { id: retryableId },
        });
        return (
          job.status === "FAILED" &&
          job.error === "Intentional test failure."
        );
      });

      await service.retryJob(jobIds.interrupted, user.id);
      await waitFor(async () => {
        const job = await prisma.translationJob.findUnique({
          where: { id: jobIds.interrupted },
        });
        return job.status === "COMPLETED";
      });
    } finally {
      releaseFirstTranslation.resolve();
      if (service && prisma) {
        await waitFor(
          async () =>
            (await prisma.translationJob.count({
              where: { ownerId: userId, status: "PROCESSING" },
            })) === 0,
        ).catch(() => undefined);
      }
      if (service) await service.onModuleDestroy();
      if (prisma) {
        await prisma.translationJob
          .deleteMany({ where: { ownerId: userId } })
          .catch(() => undefined);
        await prisma.user
          .delete({ where: { id: userId } })
          .catch(() => undefined);
        await prisma.$disconnect();
      }
      await rm(dataDir, { recursive: true, force: true });
      if (previousDatabaseUrl === undefined)
        delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousLimit === undefined)
        delete process.env.MAX_CONCURRENT_TRANSLATIONS;
      else process.env.MAX_CONCURRENT_TRANSLATIONS = previousLimit;
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
    }
  },
);
