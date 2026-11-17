const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

test("notification migration recognizes only exact owner-matched legacy events", { timeout: 120000 }, async (t) => {
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: "pipe" }).trim();
  const name = `notification-migration-${process.pid}-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  let containerId;
  let client;
  t.after(async () => {
    try {
      await client?.end();
    } finally {
      if (containerId) {
        assert.equal(docker("inspect", "--format", '{{index .Config.Labels "notification-test-owner"}}', containerId), name);
        docker("rm", "--force", "--volumes", containerId);
      }
    }
  });
  containerId = docker("run", "--pull=never", "--rm", "--detach",
    "--name", name, "--label", `notification-test-owner=${name}`,
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=notification_test",
    "-v", "/var/lib/postgresql/data", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const binding = docker("port", containerId, "5432/tcp");
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  for (let attempt = 0; ; attempt++) {
    try {
      docker("exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "notification_test");
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  client = new Client({ host: "127.0.0.1", port: Number(binding.split(":").pop()), user: "postgres", password, database: "notification_test" });
  await client.connect();
  await client.query(`
    CREATE TABLE "Notification" ("id" text PRIMARY KEY, "type" text, "title" text, "message" text, "jobId" text, "userId" text);
    CREATE TABLE "TranslationJob" ("id" text PRIMARY KEY, "ownerId" text, "fileName" text);
    CREATE TABLE "ChangelogEntry" ("id" text PRIMARY KEY, "title" text, "details" text, "publishedAt" timestamp);
    INSERT INTO "TranslationJob" VALUES ('job', 'owner', 'report.xlsx');
  `);
  const records = [
    ["queued", "JOB_QUEUED", "Translation queued", "Your workbook is ready to start.", null, "owner", "job.queued"],
    ["completed", "JOB_COMPLETED", "Translation complete", "Your translated workbook is ready to download.", null, "owner", "job.completed"],
    ["started", "JOB_PROGRESS", "Translation started", "report.xlsx is being translated.", "job", "owner", "job.started"],
    ["failed", "JOB_FAILED", "Translation failed", "report.xlsx could not be translated.", "job", "owner", "job.failed"],
    ["interrupted", "JOB_FAILED", "Translation interrupted", "report.xlsx can be retried after an API restart.", "job", "owner", "job.interrupted"],
    ["cancelled", "JOB_CANCELLED", "Translation cancelled", "report.xlsx was cancelled.", "job", "owner", "job.cancelled"],
    ["foreign", "JOB_PROGRESS", "Translation started", "report.xlsx is being translated.", "job", "other", null],
    ["missing", "JOB_PROGRESS", "Translation started", "report.xlsx is being translated.", "missing", "owner", null],
    ["unknown", "JOB_PROGRESS", "Translation started", "A different message.", "job", "owner", null],
  ];
  for (const record of records) {
    await client.query('INSERT INTO "Notification" VALUES ($1,$2,$3,$4,$5,$6)', record.slice(0, 6));
  }
  const sql = await fs.readFile(path.join(__dirname, "..", "prisma", "migrations", "20261117152000_localized_notifications_v7", "migration.sql"), "utf8");
  await client.query(sql);
  const { rows } = await client.query('SELECT "id", "eventKey" FROM "Notification"');
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.id, row.eventKey])),
    Object.fromEntries(records.map((record) => [record[0], record[6]])));
  const changelog = await client.query('SELECT "title", "details" FROM "ChangelogEntry" WHERE "id" = $1', ["changelog-20261118-localized-notifications-v7"]);
  assert.equal(changelog.rowCount, 1);
});
