const assert = require("node:assert/strict");
const { test } = require("node:test");
const { BadRequestException, NotFoundException } = require("@nestjs/common");
const {
  NotificationsService,
} = require("../dist/modules/notifications/notifications.service");

test("notifications are owner scoped, cursor paginated, and expose a next cursor only when another page exists", async () => {
  const calls = [];
  const rows = Array.from({ length: 11 }, (_, index) => ({
    id: `notification-${index}`,
    userId: "user-1",
  }));
  const prisma = {
    notification: {
      findFirst: async (query) => {
        calls.push(query);
        return { id: query.where.id };
      },
      findMany: async (query) => {
        calls.push(query);
        return rows;
      },
      count: async (query) => {
        calls.push(query);
        return 21;
      },
    },
  };
  const result = await new NotificationsService(prisma).list(
    "user-1",
    "notification-before",
  );
  assert.equal(result.data.length, 10);
  assert.equal(result.nextCursor, "notification-9");
  assert.deepEqual(calls[0].where, {
    id: "notification-before",
    userId: "user-1",
  });
  assert.deepEqual(calls[1].where, { userId: "user-1" });
  assert.equal(calls[1].take, 11);
  assert.deepEqual(calls[2].where, { userId: "user-1" });
  assert.equal(result.total, 21);
});

test("notifications reject a cursor that does not belong to the owner", async () => {
  const prisma = { notification: { findFirst: async () => null } };
  await assert.rejects(
    () => new NotificationsService(prisma).list("user-1", "foreign-cursor"),
    BadRequestException,
  );
});

test("mark read updates only the selected owner notification and returns not found for foreign ids", async () => {
  const updates = [];
  const prisma = {
    notification: {
      updateMany: async (query) => {
        updates.push(query);
        return { count: 0 };
      },
    },
  };
  await assert.rejects(
    () => new NotificationsService(prisma).markRead("user-1", "notification-1"),
    NotFoundException,
  );
  assert.deepEqual(updates[0], {
    where: { id: "notification-1", userId: "user-1" },
    data: { isRead: true },
  });
});

test("unread count is scoped to the signed-in owner", async () => {
  const calls = [];
  const prisma = {
    notification: {
      count: async (query) => {
        calls.push(query);
        return 3;
      },
    },
  };
  assert.deepEqual(
    await new NotificationsService(prisma).countUnread("user-1"),
    { count: 3 },
  );
  assert.deepEqual(calls[0], { where: { userId: "user-1", isRead: false } });
});

test("notification template metadata never exposes another owner's job filename", async () => {
  const rows = [
    { id: "own", userId: "user-1", eventKey: "job.started", job: { ownerId: "user-1", fileName: "report.xlsx" } },
    { id: "foreign", userId: "user-1", eventKey: "job.failed", job: { ownerId: "user-2", fileName: "private.xlsx" } },
    { id: "missing", userId: "user-1", eventKey: "job.cancelled", job: null },
    { id: "legacy", userId: "user-1", eventKey: null, job: null },
  ];
  let query;
  const prisma = { notification: {
    findMany: async (value) => { query = value; return rows; },
    count: async () => rows.length,
  } };
  const result = await new NotificationsService(prisma).list("user-1");
  assert.deepEqual(query.where, { userId: "user-1" });
  assert.deepEqual(result.data.map((item) => item.eventFileName), ["report.xlsx", null, null, null]);
  assert.ok(result.data.every((item) => !("job" in item)));
});
