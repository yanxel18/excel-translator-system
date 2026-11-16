const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { once } = require("node:events");
const { ProductSurfacesService } = require("../dist/modules/product-surfaces/product-surfaces.service");
const { DatabaseJobManagementService } = require("../dist/modules/job-management/database-job-management.service");

async function bytes(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("authorized previews and downloads stream the stored workbook", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "workbook-stream-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "book.xlsx");
  const contents = Buffer.from("PK-workbook bytes");
  await writeFile(path, contents);
  const job = {
    id: "job", ownerId: "owner", fileName: "report.xlsx",
    sourcePath: path, outputPath: path, status: "COMPLETED",
  };
  const prisma = {
    translationJob: {
      findFirst: async ({ where }) => where.ownerId === job.ownerId ? job : null,
      findUnique: async () => job,
    },
  };
  const previews = new ProductSurfacesService(prisma);
  const jobs = new DatabaseJobManagementService(prisma, {}, {}, {});

  const preview = await previews.previewFile("job", "owner", "source");
  assert.equal(preview.size, contents.length);
  assert.deepEqual(await bytes(preview.stream), contents);
  const download = await jobs.getDownload("job", "owner");
  assert.equal(download.fileName, "report-translated.xlsx");
  assert.equal(download.size, contents.length);
  assert.deepEqual(await bytes(download.stream), contents);

  await assert.rejects(() => previews.previewFile("job", "other", "source"), /Job not found/);
  await assert.rejects(() => jobs.getDownload("job", "other"), /do not own/);
  const interrupted = await previews.previewFile("job", "owner", "translated");
  interrupted.stream.destroy();
  await once(interrupted.stream, "close");
  assert.equal(interrupted.stream.closed, true);
  job.status = "PENDING";
  await assert.rejects(() => previews.previewFile("job", "owner", "translated"), /not ready/);
  await assert.rejects(() => jobs.getDownload("job", "owner"), /not ready/);
  job.status = "COMPLETED";
  await rm(path);
  await assert.rejects(() => previews.previewFile("job", "owner", "source"), /preview is unavailable/);
  await assert.rejects(() => jobs.getDownload("job", "owner"), /unavailable/);
});
