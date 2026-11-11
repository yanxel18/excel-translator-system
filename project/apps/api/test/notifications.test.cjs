const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');

test('notifications are owner scoped, cursor paginated, and expose a next cursor only when another page exists', async () => {
  const calls = [];
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: `notification-${index}`, userId: 'user-1' }));
  const prisma = { notification: {
    findFirst: async (query) => { calls.push(query); return { id: query.where.id }; },
    findMany: async (query) => { calls.push(query); return rows; },
  } };
  const result = await new NotificationsService(prisma).list('user-1', 'notification-before');
  assert.equal(result.data.length, 20);
  assert.equal(result.nextCursor, 'notification-19');
  assert.deepEqual(calls[0].where, { id: 'notification-before', userId: 'user-1' });
  assert.deepEqual(calls[1].where, { userId: 'user-1' });
  assert.equal(calls[1].take, 21);
});

test('notifications reject a cursor that does not belong to the owner', async () => {
  const prisma = { notification: { findFirst: async () => null } };
  await assert.rejects(() => new NotificationsService(prisma).list('user-1', 'foreign-cursor'), BadRequestException);
});

test('mark read updates only the selected owner notification and returns not found for foreign ids', async () => {
  const updates = [];
  const prisma = { notification: { updateMany: async (query) => { updates.push(query); return { count: 0 }; } } };
  await assert.rejects(() => new NotificationsService(prisma).markRead('user-1', 'notification-1'), NotFoundException);
  assert.deepEqual(updates[0], { where: { id: 'notification-1', userId: 'user-1' }, data: { isRead: true } });
});

test('unread count is scoped to the signed-in owner', async () => {
  const calls = [];
  const prisma = { notification: { count: async (query) => { calls.push(query); return 3; } } };
  assert.deepEqual(await new NotificationsService(prisma).countUnread('user-1'), { count: 3 });
  assert.deepEqual(calls[0], { where: { userId: 'user-1', isRead: false } });
});
