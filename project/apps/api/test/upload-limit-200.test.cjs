const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { UploadSessionService } = require("../dist/modules/file-upload/upload-session.service");

test("resumable uploads accept 200 MiB while respecting smaller administrator limits", async () => {
  let limit = 200;
  const tx = {
    $queryRaw: async (parts) => String(parts[0]).includes("reservedBytes")
      ? [{ reservedBytes: 0 }]
      : [{ createdAt: new Date() }],
    applicationSettings: { findUniqueOrThrow: async () => ({ maxUploadSizeMb: limit }) },
    uploadSession: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }) => data,
    },
  };
  const service = new UploadSessionService(
    { $transaction: async (operation) => operation(tx) },
    { getSettings: async () => ({ maxUploadSizeMb: limit }) },
    {}, {}, {},
  );
  const intent = {
    clientUploadId: randomUUID(),
    fileName: "large.xlsx",
    fileSize: 200 * 1024 * 1024,
    chunkHashes: Array(200).fill("a".repeat(64)),
  };
  assert.equal((await service.create("owner", intent)).fileSize, intent.fileSize);
  limit = 50;
  await assert.rejects(service.create("owner", intent), (error) => error.status === 413);
  limit = 200;
  await assert.rejects(service.create("owner", {
    ...intent,
    fileSize: intent.fileSize + 1,
    chunkHashes: [...intent.chunkHashes, "a".repeat(64)],
  }), (error) => error.status === 400);
});
