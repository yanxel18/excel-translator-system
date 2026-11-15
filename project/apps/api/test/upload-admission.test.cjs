const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { Test } = require("@nestjs/testing");
const { BadRequestException, ServiceUnavailableException, UnauthorizedException } = require("@nestjs/common");
const { MulterModule } = require("@nestjs/platform-express");
const { FileUploadModule } = require("../dist/modules/file-upload/file-upload.module");
const { FileUploadController } = require("../dist/modules/file-upload/file-upload.controller");
const { FileUploadService } = require("../dist/modules/file-upload/file-upload.service");
const { UploadSessionService } = require("../dist/modules/file-upload/upload-session.service");
const { DatabaseJobManagementService } = require("../dist/modules/job-management/database-job-management.service");
const { JwtAuthGuard } = require("../dist/modules/authentication/jwt-auth.guard");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function harness(t, uploadFile, createJob) {
  const directory = await mkdtemp(join(tmpdir(), "v6-admission-test-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  const uploads = new FileUploadService({}, {
    getSettings: async () => ({ maxUploadSizeMb: 50 }),
  });
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  uploads.uploadFile = async (file) => {
    await uploadFile(file);
    return { path: file.path, fileSize: file.size, availableSheets: ["First"] };
  };
  const module = await Test.createTestingModule({
    imports: [MulterModule.register({})],
    controllers: [FileUploadController],
    providers: [
      ...Reflect.getMetadata("providers", FileUploadModule),
      { provide: DatabaseJobManagementService, useValue: {
        createJob: async (fileName, ownerId, file) =>
          createJob(fileName, ownerId, await readFile(file.path)),
      } },
    ],
  }).overrideProvider(UploadSessionService).useValue({})
    .overrideProvider(FileUploadService).useValue(uploads)
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context) {
        const req = context.switchToHttp().getRequest();
        if (!["Bearer admission-test", "Bearer other-admission-test"]
          .includes(req.headers.authorization))
          throw new UnauthorizedException();
        req.user = {
          userId: req.headers.authorization === "Bearer admission-test"
            ? "owner-test" : "other-owner",
        };
        return true;
      },
    }).compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  t.after(async () => {
    app.getHttpServer().closeAllConnections();
    await app.close();
    await rm(directory, { recursive: true });
  });
  return { url: `${await app.getUrl()}/upload`, module, server: app.getHttpServer() };
}

function upload(url, fileName = "book.xlsx", size = 2 * 1024 * 1024) {
  const form = new FormData();
  form.append("file", new Blob([Buffer.alloc(size)]), fileName);
  return fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer admission-test" },
    body: form,
  });
}

function unfinishedRequest(url, authorized = true) {
  let request;
  const result = new Promise((resolve, reject) => {
    request = http.request(url, {
      method: "POST",
      headers: {
        ...(authorized ? { Authorization: "Bearer other-admission-test" } : {}),
        "Content-Type": "multipart/form-data; boundary=admission-boundary",
        "Transfer-Encoding": "chunked",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      }));
    });
    request.on("error", reject);
    request.setTimeout(3000, () => request.destroy(
      new Error("Upload response waited for an unfinished request body."),
    ));
    request.flushHeaders();
  });
  return { result, request, destroy: () => request.destroy() };
}

test("busy uploads are rejected before body reception and authentication still runs first",
  { timeout: 15000 }, async (t) => {
    const validating = deferred();
    const release = deferred();
    t.after(() => release.resolve());
    let jobs = 0;
    const { url } = await harness(t, async () => {
      validating.resolve();
      await release.promise;
    }, async (fileName, ownerId, buffer) => {
      jobs++;
      return { id: "job-test", fileName, ownerId, fileSize: buffer.length };
    });
    const first = upload(url);
    await validating.promise;
    const unauthorized = unfinishedRequest(url, false);
    try {
      assert.equal((await unauthorized.result).status, 401);
    } finally { unauthorized.destroy(); }
    const second = unfinishedRequest(url);
    try {
      const rejected = await second.result;
      assert.equal(rejected.status, 409);
      assert.equal(rejected.body.code, "UPLOAD_BUSY");
      assert.equal(rejected.headers["retry-after"], "1");
      assert.equal(jobs, 0);
    } finally {
      second.destroy();
      release.resolve();
      await first;
    }
    const accepted = await upload(url);
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).fileSize, 2 * 1024 * 1024);
    assert.equal(jobs, 2);
  });

test("an aborted partial multipart receive releases admission for another upload",
    { timeout: 15000 }, async (t) => {
      const receiving = deferred();
      let jobs = 0;
      const { url, server } = await harness(t, async () => {}, async () => ({ id: ++jobs }));
      server.once("request", () => receiving.resolve());
      const partial = unfinishedRequest(url);
      const disconnected = assert.rejects(partial.result, { code: "ECONNRESET" });
      t.after(() => partial.destroy());
      partial.request.write(
        '--admission-boundary\r\nContent-Disposition: form-data; name="file"; filename="book.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n',
      );
      partial.request.write(Buffer.alloc(64 * 1024));
      await receiving.promise;
      assert.equal((await upload(url)).status, 409);
      partial.destroy();
      await disconnected;
      let response;
      for (let attempt = 0; attempt < 50; attempt++) {
        response = await upload(url);
        if (response.status !== 409) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(response.status, 201);
      assert.equal(jobs, 1);
    });

test("a disconnected client does not release running validation or job creation",
    { timeout: 15000 }, async (t) => {
      const validating = deferred();
      const validated = deferred();
      const creating = deferred();
      const created = deferred();
      t.after(() => { validated.resolve(); created.resolve(); });
      const { url } = await harness(t, async () => {
        validating.resolve();
        await validated.promise;
      }, async () => {
        creating.resolve();
        await created.promise;
        return { id: "job-test" };
      });
      const client = unfinishedRequest(url);
      const disconnected = assert.rejects(client.result, { code: "ECONNRESET" });
      t.after(() => client.destroy());
      client.request.end(
        '--admission-boundary\r\nContent-Disposition: form-data; name="file"; filename="book.xlsx"\r\n\r\nbytes\r\n--admission-boundary--\r\n',
      );
      await validating.promise;
      client.destroy();
      await disconnected;
      assert.equal((await upload(url)).status, 409);
      validated.resolve();
      await creating.promise;
      assert.equal((await upload(url)).status, 409);
      created.resolve();
      let response;
      for (let attempt = 0; attempt < 50; attempt++) {
        response = await upload(url);
        if (response.status !== 409) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(response.status, 201);
    });

test("multipart, validation and job failures release admission without masking errors",
    { timeout: 15000 }, async (t) => {
      const { url } = await harness(t, async (file) => {
        if (file.originalname === "invalid.xlsx")
          throw new BadRequestException("Invalid workbook.");
      }, async (fileName) => {
        if (fileName === "storage-error.xlsx")
          throw new ServiceUnavailableException("Storage unavailable.");
        return { id: "job-test" };
      });
      const malformed = new FormData();
      malformed.append("unexpected", new Blob(["bytes"]), "book.xlsx");
      assert.equal((await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer admission-test" },
        body: malformed,
      })).status, 400);
      const invalid = await upload(url, "invalid.xlsx");
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).message, "Invalid workbook.");
      const failure = await upload(url, "storage-error.xlsx");
      assert.equal(failure.status, 503);
      assert.equal((await failure.json()).message, "Storage unavailable.");
      assert.equal((await upload(url)).status, 201);
    });

test("the exact 50 MiB file ceiling is accepted and one extra byte is rejected",
  { timeout: 15000 }, async (t) => {
    const { url } = await harness(t, async () => {}, async (fileName, ownerId, buffer) => ({
      id: "job-test", fileSize: buffer.length,
    }));
    const exact = await upload(url, "book.xlsx", 50 * 1024 * 1024);
    assert.equal(exact.status, 201);
    assert.equal((await exact.json()).fileSize, 50 * 1024 * 1024);
    const oversized = await upload(url, "book.xlsx", 50 * 1024 * 1024 + 1);
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).message, "File too large");
    assert.equal((await upload(url)).status, 201);
  });

test("shutdown drains the active upload and duplicate releases cannot free a later upload",
    async () => {
      const { UploadAdmissionService } = require("../dist/modules/file-upload/upload-admission.service");
      const admission = new UploadAdmissionService();
      const releaseFirst = admission.acquire();
      releaseFirst();
      const releaseSecond = admission.acquire();
      releaseFirst();
      assert.throws(() => admission.acquire(), (error) => error.getStatus() === 409);
      let stopped = false;
      const shutdown = admission.onModuleDestroy().then(() => { stopped = true; });
      await Promise.resolve();
      assert.equal(stopped, false);
      assert.throws(() => admission.acquire(), (error) => error.getStatus() === 503);
      releaseSecond();
      await shutdown;
      assert.equal(stopped, true);
    });
