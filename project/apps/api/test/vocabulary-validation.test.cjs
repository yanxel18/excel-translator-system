const test = require('node:test');
const assert = require('node:assert/strict');
const { VocabularyController } = require('../dist/modules/vocabulary/vocabulary.controller');

const id = '11111111-1111-4111-8111-111111111111';
const req = { user: { userId: 'owner' } };
const controller = new VocabularyController({
  createGroup: (_owner, body) => body,
  updateGroup: (_id, _owner, body) => body,
  createEntry: (_id, _owner, body) => body,
  updateEntry: (_id, _entryId, _owner, body) => body,
  deleteEntry: () => ({ ok: true }),
});

test('vocabulary REST input rejects unknown fields and non-object bodies', () => {
  assert.throws(() => controller.createGroup(req, { name: '東京', extra: true }), (e) => e.status === 400);
  assert.throws(() => controller.updateGroup(id, req, []), (e) => e.status === 400);
  assert.throws(() => controller.createEntry(id, req, { source: '水', target: 'water', ownerId: 'other' }), (e) => e.status === 400);
  assert.throws(() => controller.updateEntry(id, id, req, null), (e) => e.status === 400);
});

test('vocabulary REST paths require valid UUIDs and preserve Unicode bodies', () => {
  assert.throws(() => controller.deleteEntry('bad-id', id, req), (e) => e.status === 400);
  assert.throws(() => controller.deleteEntry(id, 'bad-id', req), (e) => e.status === 400);
  assert.deepEqual(controller.createEntry(id, req, { source: '水', target: '水源' }), { source: '水', target: '水源' });
});
