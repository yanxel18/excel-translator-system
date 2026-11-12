const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { strictObject, requiredText, requiredEmail, uuid, pageNumber, choice } = require('../dist/common/management-validation');

test('rejects non-objects and unrecognised fields', () => {
  for (const value of [null, [], 'text', { name: 'A', admin: true }]) {
    assert.throws(() => strictObject(value, ['name']), BadRequestException);
  }
  assert.deepEqual(strictObject({ name: 'A' }, ['name']), { name: 'A' });
});

test('validates text without excluding CJK and does not alter secrets', () => {
  assert.equal(requiredText('  山田 太郎  ', 'Name', 30), '山田 太郎');
  assert.equal(requiredText(' pass word ', 'Password', 30, false), ' pass word ');
  for (const value of ['', '  ', 'x'.repeat(31), 12]) assert.throws(() => requiredText(value, 'Name', 30), BadRequestException);
});

test('validates email and UUID values', () => {
  assert.equal(requiredEmail(' User@example.com '), 'user@example.com');
  assert.throws(() => requiredEmail('not-an-email'), BadRequestException);
  assert.equal(uuid('d5a04720-d839-4d8c-bfc2-d6310970bca1'), 'd5a04720-d839-4d8c-bfc2-d6310970bca1');
  assert.throws(() => uuid('not-an-id'), BadRequestException);
});

test('bounds page numbers and allowlists choices', () => {
  assert.equal(pageNumber(undefined, 1, 500), 1);
  assert.equal(pageNumber('20', 1, 500), 20);
  for (const value of ['0', '-1', '1.5', '1e2', '501', ' 2', ['2']]) assert.throws(() => pageNumber(value, 1, 500), BadRequestException);
  assert.equal(choice('asc', ['asc', 'desc'], 'direction'), 'asc');
  assert.throws(() => choice('random', ['asc', 'desc'], 'direction'), BadRequestException);
});
