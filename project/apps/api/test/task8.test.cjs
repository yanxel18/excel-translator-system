const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeBasePath, pathAtBase } = require('../dist/config/base-path');
const { allowsConfiguredUserBootstrap } = require('../dist/modules/authentication/bootstrap-policy');

test('normalizes a configurable API base path', () => {
  assert.equal(normalizeBasePath('/excel-convert/'), '/excel-convert');
  assert.equal(normalizeBasePath('custom/api'), '/custom/api');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath(undefined), '/excel-convert');
});

test('builds API routes under the configured base path', () => {
  assert.equal(pathAtBase('/excel-convert', '/graphql'), '/excel-convert/graphql');
  assert.equal(pathAtBase('', 'jobs/job-1/download'), '/jobs/job-1/download');
});

test('allows first-login account bootstrap in production only when explicitly enabled', () => {
  assert.equal(allowsConfiguredUserBootstrap('production', 'true'), true);
  assert.equal(allowsConfiguredUserBootstrap('production', 'false'), false);
  assert.equal(allowsConfiguredUserBootstrap('development', undefined), true);
});
