const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } = require("node:fs/promises");
const { Test } = require("@nestjs/testing");
const { MulterModule } = require("@nestjs/platform-express");
const JSZip = require("jszip");
const { FileUploadModule } = require("../dist/modules/file-upload/file-upload.module");
const { FileUploadController } = require("../dist/modules/file-upload/file-upload.controller");
const { FileUploadService } = require("../dist/modules/file-upload/file-upload.service");
const { UploadSessionService } = require("../dist/modules/file-upload/upload-session.service");
const { TextExtractionService } = require("../dist/modules/text-extraction/text-extraction.service");
const { DatabaseJobManagementService } = require("../dist/modules/job-management/database-job-management.service");
const { JwtAuthGuard } = require("../dist/modules/authentication/jwt-auth.guard");

async function workbook(size) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="bin" ContentType="application/octet-stream"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file("_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file("xl/workbook.xml",
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" r:id="rId1"/><sheet name="Second" r:id="rId2"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');
  zip.file("xl/worksheets/sheet2.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');
  zip.file("padding.bin", Buffer.alloc(0));
  if (size) {
    const empty = await zip.generateAsync({ type: "nodebuffer" });
    zip.file("padding.bin", Buffer.alloc(size - empty.length));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function harness(t, limit = 50) {
  const directory = await mkdtemp(join(tmpdir(), "v6-disk-upload-test-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  const extraction = new TextExtractionService();
  const settings = { limit, getSettings: async () => ({ maxUploadSizeMb: settings.limit }) };
  const uploads = new FileUploadService(extraction, settings);
  const rows = [];
  const prisma = {
    translationJob: {
      create: async ({ data }) => {
        if (prisma.fail) throw new Error("Disposable database failure.");
        const row = { status: "PENDING", progress: 0, createdAt: new Date(),
          updatedAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
    },
  };
  const jobs = new DatabaseJobManagementService(prisma, extraction, {}, settings);
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  let buffered = false;
  const validate = uploads.uploadFile.bind(uploads);
  uploads.uploadFile = async (file) => {
    buffered = Buffer.isBuffer(file.buffer);
    return validate(file);
  };
  const module = await Test.createTestingModule({
    imports: [MulterModule.register({})],
    controllers: [FileUploadController],
    providers: [
      ...Reflect.getMetadata("providers", FileUploadModule),
      { provide: DatabaseJobManagementService, useValue: { createJob: jobs.createJob.bind(jobs) } },
    ],
  }).overrideProvider(UploadSessionService).useValue({})
    .overrideProvider(FileUploadService).useValue(uploads)
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context) {
        context.switchToHttp().getRequest().user = { userId: "disk-owner" };
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
  return { url: `${await app.getUrl()}/upload`, directory, rows,
    uploads, jobs, settings, prisma, buffered: () => buffered };
}

function upload(url, bytes, fileName = "book.xlsx") {
  const form = new FormData();
  form.append("file", new Blob([bytes]), fileName);
  return fetch(url, { method: "POST", body: form });
}

function partialUpload(url) {
  let request;
  const response = new Promise((resolve, reject) => {
    request = http.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=disk-boundary",
        "Transfer-Encoding": "chunked",
      },
    }, (result) => {
      result.resume();
      result.on("end", () => resolve(result.statusCode));
    });
    request.on("error", reject);
    request.write('--disk-boundary\r\nContent-Disposition: form-data; name="file"; filename="../../escape.xlsx"\r\n\r\n');
    request.write(Buffer.alloc(64 * 1024));
  });
  return { request, response };
}

async function waitFor(operation) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await operation();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for disk receive state.");
}

test("legacy disk reception preserves workbook bytes and job shape without a receive buffer",
  { timeout: 15000 }, async (t) => {
    const { url, rows, directory, jobs, buffered } = await harness(t);
    const bytes = await workbook();
    const response = await upload(url, bytes, "50% report.xlsx");
    assert.equal(response.status, 201);
    const job = await response.json();
    assert.equal(buffered(), false);
    assert.equal(job.fileName, "50% report.xlsx");
    assert.equal(job.ownerId, "disk-owner");
    assert.equal(job.fileSize, bytes.length);
    assert.deepEqual(job.availableSheets, ["First", "Second"]);
    assert.deepEqual(job.selectedSheets, ["First", "Second"]);
    assert.equal(job.sourcePath, undefined);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].notifications.create.type, "JOB_QUEUED");
    assert.deepEqual(await readFile(rows[0].sourcePath), bytes);
    assert.deepEqual(await readdir(join(directory, "legacy-uploads")), []);
    const legacy = await jobs.createJob("legacy.xlsx", "disk-owner", bytes);
    assert.equal(legacy.fileSize, bytes.length);
    assert.deepEqual(legacy.availableSheets, ["First", "Second"]);
    assert.deepEqual(await readFile(rows[1].sourcePath), bytes);
  });

test("receive limits follow current settings at exact 1 MiB and 50 MiB boundaries",
  { timeout: 30000 }, async (t) => {
    const { url, rows, directory, settings } = await harness(t, 1);
    const exact = await workbook(1024 * 1024);
    assert.equal(exact.length, 1024 * 1024);
    assert.equal((await upload(url, exact)).status, 201);
    assert.equal((await upload(url, await workbook(1024 * 1024 + 1))).status, 413);
    assert.equal(rows.length, 1);
    assert.deepEqual(await readdir(join(directory, "legacy-uploads")), []);
    settings.limit = 50;
    const maximum = await workbook(50 * 1024 * 1024);
    assert.equal(maximum.length, 50 * 1024 * 1024);
    const accepted = await upload(url, maximum);
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).fileSize, maximum.length);
    assert.equal((await upload(url, await workbook(50 * 1024 * 1024 + 1))).status, 413);
    assert.deepEqual(await readdir(join(directory, "legacy-uploads")), []);
    assert.equal(rows.length, 2);
  });

test("invalid archives and failed job persistence remove temporary and promoted sources",
  { timeout: 15000 }, async (t) => {
    const { url, rows, directory, prisma } = await harness(t);
    const bytes = await workbook();
    const corrupt = Buffer.from(bytes);
    const content = corrupt.indexOf(Buffer.from("<sheetData/>"));
    assert.ok(content >= 0);
    corrupt[content] ^= 1;
    assert.equal((await upload(url, corrupt)).status, 400);
    assert.equal((await upload(url, Buffer.from("not a zip"))).status, 400);
    assert.equal((await upload(url, bytes, "book.txt")).status, 400);
    assert.equal(rows.length, 0);
    assert.deepEqual(await readdir(directory), ["legacy-uploads"]);
    assert.deepEqual(await readdir(join(directory, "legacy-uploads")), []);
    prisma.fail = true;
    assert.equal((await upload(url, bytes)).status, 500);
    assert.deepEqual(await readdir(directory), ["legacy-uploads"]);
    assert.deepEqual(await readdir(join(directory, "legacy-uploads")), []);
    prisma.fail = false;
    assert.equal((await upload(url, bytes)).status, 201);
  });

test("storage failures are explicit and do not leak admission",
  { timeout: 15000 }, async (t) => {
    const { url, directory, settings } = await harness(t);
    const root = join(directory, "legacy-uploads");
    await rename(root, `${root}.saved`);
    await writeFile(root, "blocked");
    const bytes = await workbook();
    const failed = await upload(url, bytes);
    assert.equal(failed.status, 503);
    assert.match((await failed.json()).message, /storage is unavailable/);
    await rm(root);
    await rename(`${root}.saved`, root);
    assert.equal((await upload(url, bytes)).status, 201);
    settings.limit = 201;
    assert.equal((await upload(url, bytes)).status, 503);
    settings.limit = 1;
    assert.equal((await upload(url, bytes)).status, 201);
    if (process.platform !== "win32")
      assert.equal((await stat(root)).mode & 0o777, 0o700);
  });

test("accepts a 200 MiB workbook and rejects a file one byte larger",
  { timeout: 120000 }, async (t) => {
    const { url, rows } = await harness(t, 200);
    const maximum = await workbook(200 * 1024 * 1024);
    assert.equal(maximum.length, 200 * 1024 * 1024);
    const accepted = await upload(url, maximum);
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).fileSize, maximum.length);
    const form = new FormData();
    form.append("file", new Blob([maximum, Buffer.alloc(1)]), "too-large.xlsx");
    assert.equal((await fetch(url, { method: "POST", body: form })).status, 413);
    assert.equal(rows.length, 1);
  });

test("a partial receive hits its configured ceiling before the multipart body ends",
  { timeout: 15000 }, async (t) => {
    const { url, directory } = await harness(t, 1);
    const root = join(directory, "legacy-uploads");
    const client = partialUpload(url);
    t.after(() => client.request.destroy());
    const received = await waitFor(async () => {
      const folders = await readdir(root);
      if (!folders.length) return;
      const files = (await readdir(join(root, folders[0]))).filter(name => name.endsWith(".xlsx"));
      if (!files.length) return;
      const path = join(root, folders[0], files[0]);
      return (await stat(path)).size > 0 ? path : undefined;
    });
    assert.match(received, /[0-9a-f-]{36}\.xlsx$/);
    if (process.platform !== "win32")
      assert.equal((await stat(received)).mode & 0o777, 0o600);
    client.request.write(Buffer.alloc(2 * 1024 * 1024));
    await waitFor(async () => {
      const size = (await stat(received)).size;
      assert.ok(size <= 1024 * 1024 + 1);
      return size === 1024 * 1024 + 1;
    });
    assert.equal(client.request.writableEnded, false);
    client.request.end("\r\n--disk-boundary--\r\n");
    assert.equal(await client.response, 413);
    assert.deepEqual(await readdir(root), []);
    assert.equal((await upload(url, await workbook())).status, 201);
  });

const receiveWorker = `
const { Test } = require("@nestjs/testing");
const { MulterModule } = require("@nestjs/platform-express");
const { FileUploadModule } = require("./dist/modules/file-upload/file-upload.module");
const { FileUploadController } = require("./dist/modules/file-upload/file-upload.controller");
const { FileUploadService } = require("./dist/modules/file-upload/file-upload.service");
const { UploadSessionService } = require("./dist/modules/file-upload/upload-session.service");
const { TextExtractionService } = require("./dist/modules/text-extraction/text-extraction.service");
const { DatabaseJobManagementService } = require("./dist/modules/job-management/database-job-management.service");
const { JwtAuthGuard } = require("./dist/modules/authentication/jwt-auth.guard");
(async () => {
  const uploads = new FileUploadService(new TextExtractionService(), {
    getSettings: async () => ({ maxUploadSizeMb: 1 }),
  });
  const module = await Test.createTestingModule({
    imports: [MulterModule.register({})],
    controllers: [FileUploadController],
    providers: [...Reflect.getMetadata("providers", FileUploadModule),
      { provide: DatabaseJobManagementService, useValue: { createJob: async () => ({ id: "worker-job" }) } }],
  }).overrideProvider(UploadSessionService).useValue({})
    .overrideProvider(FileUploadService).useValue(uploads)
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
      context.switchToHttp().getRequest().user = { userId: "worker-owner" };
      return true;
    } }).compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  console.log(JSON.stringify({ url: (await app.getUrl()) + "/upload" }));
})().catch(error => { console.error(error); process.exitCode = 1; });
`;

async function worker(t, directory) {
  const child = spawn(process.execPath, ["-e", receiveWorker], {
    cwd: join(__dirname, ".."),
    env: { ...process.env, DATA_DIR: directory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  };
  t.after(stop);
  let errors = "";
  child.stderr.on("data", data => { errors += data.toString(); });
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Receive worker did not become ready.")), 5000);
    child.once("error", reject);
    child.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error(`Receive worker exited before readiness: ${errors}`));
    });
    child.stdout.on("data", data => {
      output += data.toString();
      if (output.includes("\n")) {
        clearTimeout(timeout);
        resolve(JSON.parse(output.trim()).url);
      }
    });
  });
  return { url, stop };
}

test("process restart removes interrupted receives but preserves job sources and foreign paths",
  { timeout: 20000 }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "v6-disk-crash-test-"));
    try {
    const first = await worker(t, directory);
    const root = join(directory, "legacy-uploads");
    const client = partialUpload(first.url);
    const disconnected = assert.rejects(client.response, { code: "ECONNRESET" });
    t.after(() => client.request.destroy());
    await waitFor(async () => {
      const folders = await readdir(root);
      if (!folders.length) return false;
      const files = await readdir(join(root, folders[0]));
      return files.length && (await stat(join(root, folders[0], files[0]))).size > 0;
    });
    await first.stop();
    await disconnected;
    assert.equal((await readdir(root)).length, 1);
    const source = join(directory, "keep.source.xlsx");
    await writeFile(source, "protected source");
    await writeFile(join(root, "keep.txt"), "foreign entry");
    const foreign = await mkdtemp(join(directory, "foreign-"));
    await writeFile(join(foreign, "keep.txt"), "foreign target");
    await symlink(foreign, join(root, "receive-Abc123"), "junction");
    const second = await worker(t, directory);
    assert.deepEqual((await readdir(root)).sort(), ["keep.txt", "receive-Abc123"]);
    assert.equal(await readFile(source, "utf8"), "protected source");
    assert.equal(await readFile(join(foreign, "keep.txt"), "utf8"), "foreign target");
    assert.equal((await upload(second.url, await workbook())).status, 201);
    await second.stop();
    } finally {
      t.after(() => rm(directory, { recursive: true }));
    }
  });
