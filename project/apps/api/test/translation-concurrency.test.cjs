const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const fsPromises = require("node:fs/promises");
const { mkdir, rm } = fsPromises;
const { readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { Test } = require("@nestjs/testing");
require("reflect-metadata");

function loadTypescriptModule(filename, imports = {}) {
  const source = readFileSync(filename, "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
    [],
  );
  const loadedModule = new Module(filename, module);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(dirname(filename));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === filename && Object.hasOwn(imports, request))
      return imports[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    loadedModule._compile(outputText, filename);
    return loadedModule.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const apiSource = resolve(__dirname, "../src");
const config = loadTypescriptModule(
  join(apiSource, "config", "translation-concurrency.ts"),
);
const { getMaxConcurrentTranslations } = config;
const fakeEnums = {
  JobStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    FAILED: "FAILED",
  },
  Language: { JAPANESE: "JAPANESE", ENGLISH: "ENGLISH" },
  NotificationType: {
    JOB_FAILED: "JOB_FAILED",
    JOB_PROGRESS: "JOB_PROGRESS",
    JOB_COMPLETED: "JOB_COMPLETED",
    JOB_CANCELLED: "JOB_CANCELLED",
  },
  PrismaClient: class PrismaClient {},
};

class FakeClient {
  static held = false;

  async connect() {}

  on() {
    return this;
  }

  removeAllListeners() {
    return this;
  }

  async query(sql) {
    if (sql.includes("pg_try_advisory_lock")) {
      if (FakeClient.held) return { rows: [{ locked: false }] };
      FakeClient.held = true;
      return { rows: [{ locked: true }] };
    }
    if (sql.includes("pg_advisory_unlock")) {
      FakeClient.held = false;
      return { rows: [{ pg_advisory_unlock: true }] };
    }
    return { rows: [] };
  }

  async end() {}
}

const serviceSource = join(
  apiSource,
  "modules",
  "job-management",
  "database-job-management.service.ts",
);
const { DatabaseJobManagementService } = loadTypescriptModule(serviceSource, {
  "../../generated/prisma/client": fakeEnums,
  "../persistence/prisma.service": { PrismaService: class PrismaService {} },
  "../text-extraction/text-extraction.service": {
    TextExtractionService: class TextExtractionService {},
  },
  "../translation/translation.service": {
    TranslationService: class TranslationService {},
  },
  "../../utils/filename": { normalizeUploadFilename: (name) => name },
  "./language-pairs": { isSupportedLanguagePair: () => true },
  "../../config/translation-concurrency": config,
  pg: { Client: FakeClient },
});
const prismaServiceSource = join(
  apiSource,
  "modules",
  "persistence",
  "prisma.service.ts",
);
class TestPrismaClient {
  async $disconnect() {}
}
const { PrismaService } = loadTypescriptModule(prismaServiceSource, {
  "@prisma/adapter-pg": { PrismaPg: class PrismaPg {} },
  "../../generated/prisma/client": { PrismaClient: TestPrismaClient },
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function matches(row, where) {
  return Object.entries(where || {}).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value)
      return value.in.includes(row[key]);
    return row[key] === value;
  });
}

function makeHarness(limit, translation) {
  const jobs = new Map();
  const notifications = [];
  let transactionQueue = Promise.resolve();
  const applyUpdate = async ({ where, data }) => {
    const updated = [];
    for (const row of jobs.values()) {
      if (matches(row, where)) {
        Object.assign(row, data);
        updated.push({ ...row });
      }
    }
    return updated;
  };
  const tx = {
    $queryRawUnsafe: async () => [],
    translationJob: {
      findUnique: async ({ where }) => {
        const row = jobs.get(where.id);
        return row ? { ...row } : null;
      },
      findFirst: async ({ where }) => {
        const row = jobs.get(where.id);
        return row && matches(row, where) ? { id: row.id } : null;
      },
      findUniqueOrThrow: async ({ where }) => {
        const row = jobs.get(where.id);
        if (!row) throw new Error("Missing test job.");
        return { ...row };
      },
      count: async ({ where }) =>
        [...jobs.values()].filter((row) => matches(row, where)).length,
      updateManyAndReturn: applyUpdate,
      updateMany: async (input) => ({ count: (await applyUpdate(input)).length }),
    },
    notification: {
      create: async ({ data }) => notifications.push(data),
      createMany: async ({ data }) => notifications.push(...data),
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback) => {
      const previous = transactionQueue;
      let release;
      transactionQueue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    },
  };
  const dataDir = join(__dirname, `.translation-concurrency-${randomUUID()}`);
  const previousDataDir = process.env.DATA_DIR;
  const previousLimit = process.env.MAX_CONCURRENT_TRANSLATIONS;
  process.env.DATA_DIR = dataDir;
  process.env.MAX_CONCURRENT_TRANSLATIONS = String(limit);
  const extraction = {
    getSheetNames: async () => ["Sheet1"],
    extractTextFromXlsx: async () => [],
  };
  const service = new DatabaseJobManagementService(
    prisma,
    extraction,
    translation || {
      sendTextForTranslation: async () => [],
      patchOOXML: async () => Buffer.from("translated"),
    },
  );
  return {
    dataDir,
    jobs,
    notifications,
    prisma,
    service,
    async addJob(id, status = "PENDING", ownerId = "owner-1") {
      jobs.set(id, {
        id,
        ownerId,
        status,
        fileName: `${id}.xlsx`,
        fileSize: 1,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceLanguage: "JAPANESE",
        targetLanguage: "ENGLISH",
        selectedSheets: ["Sheet1"],
        sourcePath: __filename,
        outputPath: null,
        vocabularyGroupId: null,
        progress: 0,
        startedAt: null,
        completedAt: null,
        elapsedMs: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
    async initialize() {
      await mkdir(dataDir, { recursive: true });
      await service.onModuleInit();
    },
    async cleanup() {
      await service.onModuleDestroy();
      await rm(dataDir, { recursive: true, force: true });
      if (previousDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previousDataDir;
      if (previousLimit === undefined)
        delete process.env.MAX_CONCURRENT_TRANSLATIONS;
      else process.env.MAX_CONCURRENT_TRANSLATIONS = previousLimit;
    },
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for job state.");
}

test("translation concurrency defaults to five and accepts limits from one to five", () => {
  assert.equal(getMaxConcurrentTranslations(undefined), 5);
  for (const limit of ["1", "2", "3", "4", "5"])
    assert.equal(getMaxConcurrentTranslations(limit), Number(limit));
});

test("translation concurrency rejects values outside the supported integer range", () => {
  for (const value of ["", "0", "6", "1.5", "-1", "many", " 2 "])
    assert.throws(
      () => getMaxConcurrentTranslations(value),
      /MAX_CONCURRENT_TRANSLATIONS must be an integer from 1 to 5/,
    );
});

test("simultaneous start and retry reject at capacity, then reuse a completed slot", async (context) => {
  const releaseTranslation = deferred();
  const translationStarted = deferred();
  const harness = makeHarness(1, {
    sendTextForTranslation: async () => {
      translationStarted.resolve();
      return releaseTranslation.promise;
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("pending", "PENDING", "owner-1");
  await harness.addJob("failed", "FAILED", "owner-2");
  await harness.initialize();

  const attempts = await Promise.allSettled([
    harness.service.startJob("pending", "owner-1"),
    harness.service.retryJob("failed", "owner-2"),
  ]);
  await translationStarted.promise;

  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = attempts.find(({ status }) => status === "rejected");
  assert.equal(rejected.reason.status, 409);
  assert.match(rejected.reason.message, /capacity.*1/i);

  releaseTranslation.resolve([]);
  await waitFor(() =>
    [...harness.jobs.values()].some((job) => job.status === "COMPLETED"),
  );

  const otherJob = [...harness.jobs.values()].find(
    (job) => job.status === "PENDING" || job.status === "FAILED",
  );
  const restart =
    otherJob.status === "FAILED"
      ? harness.service.retryJob(otherJob.id, otherJob.ownerId)
      : harness.service.startJob(otherJob.id, otherJob.ownerId);
  await restart;
  await waitFor(() => otherJob.status === "COMPLETED");
});

test("the configured limit of five admits five simultaneous jobs and rejects the sixth", async (context) => {
  const releaseTranslation = deferred();
  const started = deferred();
  let startCount = 0;
  const harness = makeHarness(5, {
    sendTextForTranslation: async () => {
      startCount++;
      if (startCount === 5) started.resolve();
      return releaseTranslation.promise;
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  for (let index = 0; index < 6; index++)
    await harness.addJob(`job-${index}`, "PENDING", `owner-${index}`);
  await harness.initialize();

  const attempts = await Promise.allSettled(
    [...harness.jobs.values()].map((job) =>
      harness.service.startJob(job.id, job.ownerId),
    ),
  );
  await started.promise;

  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 5);
  assert.equal(
    attempts.filter(({ status }) => status === "rejected").length,
    1,
  );
  assert.equal(
    attempts.find(({ status }) => status === "rejected").reason.status,
    409,
  );
  releaseTranslation.resolve([]);
  await waitFor(
    () =>
      [...harness.jobs.values()].filter((job) => job.status === "COMPLETED")
        .length === 5,
  );
});

test("cancellation holds capacity until the active translation has unwound", async (context) => {
  const translationStarted = deferred();
  const abortObserved = deferred();
  const finishAbort = deferred();
  let translationCalls = 0;
  const harness = makeHarness(1, {
    sendTextForTranslation: async (_items, _progress, signal) =>
      translationCalls++ > 0
        ? []
        : new Promise((resolve, reject) => {
        translationStarted.resolve();
        signal.addEventListener(
          "abort",
          async () => {
            abortObserved.resolve();
            await finishAbort.promise;
            reject(new Error("Translation aborted."));
          },
          { once: true },
        );
      }),
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("cancelling");
  await harness.addJob("next");
  await harness.initialize();

  await harness.service.startJob("cancelling", "owner-1");
  await translationStarted.promise;
  const cancellation = harness.service.cancelJob("cancelling", "owner-1");
  await abortObserved.promise;

  await assert.rejects(
    harness.service.startJob("next", "owner-1"),
    (error) => error.status === 409,
  );

  finishAbort.resolve();
  assert.equal((await cancellation).status, "CANCELLED");
  await harness.service.startJob("next", "owner-1");
  await waitFor(() => harness.jobs.get("next").status === "COMPLETED");
});

test("cancellation waits for a claimed job to register its worker", async (context) => {
  const claimCommitted = deferred();
  const finishClaim = deferred();
  const finishTranslation = deferred();
  const harness = makeHarness(1, {
    sendTextForTranslation: async (_items, _progress, signal) => {
      if (signal.aborted) throw new Error("Translation aborted.");
      return new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("Translation aborted.")),
          { once: true },
        );
        finishTranslation.promise.then(resolve);
      });
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("claiming");
  await harness.initialize();

  const claimJob = harness.service.claimJob.bind(harness.service);
  harness.service.claimJob = async (...args) => {
    const claimed = await claimJob(...args);
    claimCommitted.resolve();
    await finishClaim.promise;
    return claimed;
  };
  const starting = harness.service.startJob("claiming", "owner-1");
  await claimCommitted.promise;
  let cancellationSettled = false;
  const cancellation = harness.service
    .cancelJob("claiming", "owner-1")
    .then((job) => {
      cancellationSettled = true;
      return job;
    });
  await new Promise((resolve) => setImmediate(resolve));
  const returnedBeforeWorkerRegistration = cancellationSettled;

  finishClaim.resolve();
  try {
    await starting;
    const cancelled = await cancellation;
    assert.equal(returnedBeforeWorkerRegistration, false);
    assert.equal(cancelled.status, "CANCELLED");
  } finally {
    finishClaim.resolve();
    finishTranslation.resolve([]);
    await Promise.allSettled([starting, cancellation]);
    await harness.service.onModuleDestroy();
  }
});

test("cancellation during output rename cannot complete the job", async (context) => {
  const finishRename = deferred();
  const abortObserved = deferred();
  const originalRename = fsPromises.rename;
  const harness = makeHarness(1, {
    sendTextForTranslation: async (_items, _progress, signal) => {
      signal.addEventListener("abort", () => abortObserved.resolve(), {
        once: true,
      });
      return [];
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("renaming");
  await harness.initialize();

  let renameWasStarted = false;
  fsPromises.rename = async (source, destination) => {
    if (String(source).endsWith(".tmp")) {
      renameWasStarted = true;
      await finishRename.promise;
    }
    return originalRename(source, destination);
  };
  let starting;
  let cancellation;
  try {
    starting = harness.service.startJob("renaming", "owner-1");
    await starting;
    await waitFor(() => renameWasStarted);
    cancellation = harness.service.cancelJob("renaming", "owner-1");
    await abortObserved.promise;

    finishRename.resolve();
    const cancelled = await cancellation;

    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(harness.jobs.get("renaming").status, "CANCELLED");
  } finally {
    finishRename.resolve();
    fsPromises.rename = originalRename;
    await Promise.allSettled([starting, cancellation].filter(Boolean));
    await harness.service.onModuleDestroy();
  }
});

test("translation failure releases capacity for a subsequent start", async (context) => {
  let translationCalls = 0;
  const harness = makeHarness(1, {
    sendTextForTranslation: async () => {
      if (translationCalls++ === 0) throw new Error("Model unavailable.");
      return [];
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("failure");
  await harness.addJob("next");
  await harness.initialize();

  await harness.service.startJob("failure", "owner-1");
  await waitFor(() => harness.jobs.get("failure").status === "FAILED");
  await harness.service.startJob("next", "owner-1");
  await waitFor(() => harness.jobs.get("next").status === "COMPLETED");
});

test(
  "retry waits for the previous worker to settle before starting its replacement",
  { timeout: 15000 },
  async (context) => {
    const firstTranslationStarted = deferred();
    const failedStateCommitted = deferred();
    const releaseFailedWorker = deferred();
    const retryClaimAttempted = deferred();
    const replacementTranslationStarted = deferred();
    const replacementAbortObserved = deferred();
    const finishReplacement = deferred();
    let translationCalls = 0;
    const harness = makeHarness(1, {
      sendTextForTranslation: async (_items, _progress, signal) => {
        if (translationCalls++ === 0) {
          firstTranslationStarted.resolve();
          throw new Error("Initial translation failed.");
        }
        replacementTranslationStarted.resolve();
        return new Promise((resolve, reject) => {
          const abort = () => {
            replacementAbortObserved.resolve();
            reject(new Error("Replacement translation aborted."));
          };
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
          finishReplacement.promise.then(resolve);
        });
      },
      patchOOXML: async () => Buffer.from("translated"),
    });
    context.after(() => harness.cleanup());
    await harness.addJob("same-job");
    await harness.initialize();

    const transaction = harness.prisma.$transaction.bind(harness.prisma);
    let pauseFailure = true;
    harness.prisma.$transaction = async (operation) => {
      const result = await transaction(operation);
      if (pauseFailure && harness.jobs.get("same-job").status === "FAILED") {
        pauseFailure = false;
        failedStateCommitted.resolve();
        await releaseFailedWorker.promise;
      }
      return result;
    };
    const claimJob = harness.service.claimJob.bind(harness.service);
    harness.service.claimJob = (...args) => {
      if (args[2] === "FAILED") retryClaimAttempted.resolve();
      return claimJob(...args);
    };

    let starting;
    let retrying;
    let cancellation;
    try {
      starting = harness.service.startJob("same-job", "owner-1");
      await starting;
      await firstTranslationStarted.promise;
      await failedStateCommitted.promise;

      retrying = harness.service.retryJob("same-job", "owner-1");
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      const retryClaimedBeforePreviousWorkerSettled =
        retryClaimAttempted.promise.then(() => true);
      const earlyClaim = await Promise.race([
        retryClaimedBeforePreviousWorkerSettled,
        new Promise((resolve) => setImmediate(() => resolve(false))),
      ]);

      releaseFailedWorker.resolve();
      await retryClaimAttempted.promise;
      await retrying;
      await replacementTranslationStarted.promise;
      cancellation = harness.service.cancelJob("same-job", "owner-1");
      const cancellationOutcome = await Promise.race([
        replacementAbortObserved.promise.then(() => "replacement-aborted"),
        cancellation.then(
          () => "cancellation-finished",
          () => "cancellation-rejected",
        ),
      ]);
      const cancelled =
        cancellationOutcome === "replacement-aborted"
          ? await cancellation
          : undefined;

      assert.equal(earlyClaim, false);
      assert.equal(cancellationOutcome, "replacement-aborted");
      assert.equal(cancelled?.status, "CANCELLED");
      assert.equal(harness.jobs.get("same-job").status, "CANCELLED");
    } finally {
      releaseFailedWorker.resolve();
      finishReplacement.resolve([]);
      await Promise.allSettled(
        [starting, retrying, cancellation].filter(Boolean),
      );
      await harness.service.onModuleDestroy();
    }
  },
);

test("shutdown retains the singleton lock until active work settles", async (context) => {
  FakeClient.held = false;
  const translationStarted = deferred();
  const finishTranslation = deferred();
  const harness = makeHarness(1, {
    sendTextForTranslation: async () => {
      translationStarted.resolve();
      return finishTranslation.promise;
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("active");
  await harness.initialize();

  await harness.service.startJob("active", "owner-1");
  await translationStarted.promise;
  let shutdownFinished = false;
  const shutdown = harness.service.onModuleDestroy().then(() => {
    shutdownFinished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(shutdownFinished, false);
  assert.equal(FakeClient.held, true);

  finishTranslation.resolve([]);
  await shutdown;

  assert.equal(shutdownFinished, true);
  assert.equal(FakeClient.held, false);
});

test("shutdown blocks new starts and drains admissions before releasing the lock", async (context) => {
  FakeClient.held = false;
  const claimCommitted = deferred();
  const finishClaim = deferred();
  const workerStarted = deferred();
  const finishWorker = deferred();
  const harness = makeHarness(1, {
    sendTextForTranslation: async () => {
      workerStarted.resolve();
      return finishWorker.promise;
    },
    patchOOXML: async () => Buffer.from("translated"),
  });
  context.after(() => harness.cleanup());
  await harness.addJob("in-flight-admission");
  await harness.addJob("late-start");
  await harness.initialize();

  const claimJob = harness.service.claimJob.bind(harness.service);
  harness.service.claimJob = async (...args) => {
    const claimed = await claimJob(...args);
    if (args[0] === "in-flight-admission") {
      claimCommitted.resolve();
      await finishClaim.promise;
    }
    return claimed;
  };

  let starting;
  let shutdown;
  try {
    starting = harness.service.startJob("in-flight-admission", "owner-1");
    await claimCommitted.promise;
    let shutdownFinished = false;
    shutdown = harness.service.onModuleDestroy().then(() => {
      shutdownFinished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    const lockHeldDuringAdmission = FakeClient.held;
    let lateStartError;
    try {
      await harness.service.startJob("late-start", "owner-1");
    } catch (error) {
      lateStartError = error;
    }

    finishClaim.resolve();
    await starting;
    await workerStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    const lockHeldDuringWorker = FakeClient.held;
    const shutdownWaitedForWorker = !shutdownFinished;
    finishWorker.resolve([]);
    await shutdown;

    assert.equal(lockHeldDuringAdmission, true);
    assert.match(lateStartError.message, /shutting down/i);
    assert.equal(lockHeldDuringWorker, true);
    assert.equal(shutdownWaitedForWorker, true);
    assert.equal(FakeClient.held, false);
  } finally {
    finishClaim.resolve();
    finishWorker.resolve([]);
    await Promise.allSettled([starting, shutdown].filter(Boolean));
    await harness.service.onModuleDestroy();
  }
});

test(
  "Nest shutdown drains job workers before Prisma disconnects",
  { timeout: 15000 },
  async (context) => {
    FakeClient.held = false;
    const translationStarted = deferred();
    const finishTranslation = deferred();
    let disconnected = false;
    let databaseAccessAfterDisconnect = false;
    const harness = makeHarness(1, {
      sendTextForTranslation: async () => {
        translationStarted.resolve();
        return finishTranslation.promise;
      },
      patchOOXML: async () => Buffer.from("translated"),
    });
    context.after(() => harness.cleanup());
    await harness.addJob("nest-shutdown");

    const originalUpdateMany =
      harness.prisma.translationJob.updateMany.bind(
        harness.prisma.translationJob,
      );
    harness.prisma.translationJob.updateMany = async (...args) => {
      if (disconnected) databaseAccessAfterDisconnect = true;
      return originalUpdateMany(...args);
    };
    const prismaLifecycle = Object.create(PrismaService.prototype);
    prismaLifecycle.$disconnect = async () => {
      disconnected = true;
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: DatabaseJobManagementService,
          useValue: harness.service,
        },
        { provide: PrismaService, useValue: prismaLifecycle },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    let closing;
    try {
      await mkdir(harness.dataDir, { recursive: true });
      await app.init();
      await harness.service.startJob("nest-shutdown", "owner-1");
      await translationStarted.promise;

      closing = app.close();
      await new Promise((resolve) => setImmediate(resolve));
      const disconnectedBeforeWorkerDrain = disconnected;

      finishTranslation.resolve([]);
      await closing;

      assert.equal(disconnectedBeforeWorkerDrain, false);
      assert.equal(databaseAccessAfterDisconnect, false);
      assert.equal(disconnected, true);
    } finally {
      finishTranslation.resolve([]);
      if (closing) await closing.catch(() => undefined);
      else await app.close().catch(() => undefined);
    }
  },
);

test("startup marks interrupted jobs failed and enforces a single API instance", async (context) => {
  FakeClient.held = false;
  const harness = makeHarness(1);
  context.after(() => harness.cleanup());
  await harness.addJob("interrupted", "PROCESSING");

  await harness.initialize();
  assert.equal(harness.jobs.get("interrupted").status, "FAILED");
  assert.match(harness.jobs.get("interrupted").error, /API restarted/);

  const second = makeHarness(1);
  context.after(() => second.cleanup());
  await assert.rejects(
    second.initialize(),
    /Only one API instance may use this database/,
  );
});
