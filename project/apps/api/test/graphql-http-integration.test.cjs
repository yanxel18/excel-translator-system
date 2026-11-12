const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { GraphQLSchemaBuilderModule } = require('@nestjs/graphql');
const { ProductSurfacesResolver } = require('../dist/modules/product-surfaces/graphql.resolver');
const { ProductSurfacesService } = require('../dist/modules/product-surfaces/product-surfaces.service');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');
const { AuthenticationService } = require('../dist/modules/authentication/authentication.service');
const { mountProductSurfacesGraphql } = require('../dist/modules/product-surfaces/graphql-http');

test('GraphQL HTTP authenticates, forwards owner and validates inputs', async () => {
  let observed, updatedProfile;
  const surfaces = new ProductSurfacesService({
    user: { update: async ({ data }) => {
      updatedProfile = data;
      return { id: 'owner-id', username: 'owner', email: data.email ?? null, fullName: data.fullName ?? null, createdAt: new Date('2026-01-01T00:00:00.000Z') };
    } },
  });
  surfaces.history = async (owner, cursor) => { observed = [owner, cursor]; return { data: [], nextCursor: null }; };
  surfaces.downloadUrl = async (...args) => { observed = args; return '/download'; };
  surfaces.deleteHistoryItem = async (...args) => { observed = args; return { ok: true }; };
  const moduleRef = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule], providers: [ProductSurfacesResolver,
    { provide: ProductSurfacesService, useValue: surfaces },
    { provide: NotificationsService, useValue: {} },
    { provide: AuthenticationService, useValue: { verifySession: async (token) => { if (token !== 'valid') throw new Error(); return { userId: 'owner-id' }; } } },
  ] }).compile();
  const app = moduleRef.createNestApplication(); await mountProductSurfacesGraphql(app); await app.listen(0);
  try {
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/excel-convert/graphql`;
    const request = (query, token) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query }) });
    assert.equal((await request('{ history { nextCursor } }')).status, 401);
    assert.equal((await request('{ history { nextCursor } }', 'invalid')).status, 401);
    const valid = await (await request('{ history { nextCursor } }', 'valid')).json();
    assert.equal(valid.errors, undefined, JSON.stringify(valid));
    assert.deepEqual(observed, ['owner-id', undefined]);
    const unknownTransportField = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ query: '{ history { nextCursor } }', unexpected: true, password: 'secret-marker-must-not-be-reflected' }),
    });
    assert.equal(unknownTransportField.status, 400, 'GraphQL HTTP must reject unknown request-body properties');
    assert.ok(!(await unknownTransportField.text()).includes('secret-marker-must-not-be-reflected'));
    const unknownGetParameter = await fetch(`${url}?query=${encodeURIComponent('{ history { nextCursor } }')}&unexpected=true`, {
      headers: { Authorization: 'Bearer valid' },
    });
    assert.equal(unknownGetParameter.status, 400, 'GraphQL HTTP must reject unknown URL parameters');
    const unknownGraphqlField = await (await request('{ history { nextCursor unexpected } }', 'valid')).json();
    assert.ok(unknownGraphqlField.errors?.length, JSON.stringify(unknownGraphqlField));
    const invalidEmail = await (await request('mutation { updateProfile(email: "invalid") { email } }', 'valid')).json();
    assert.ok(invalidEmail.errors?.length, JSON.stringify(invalidEmail));
    assert.equal(updatedProfile, undefined);
    const oversizedName = await (await request(`mutation { updateProfile(fullName: "${'漢'.repeat(121)}") { fullName } }`, 'valid')).json();
    assert.ok(oversizedName.errors?.length, JSON.stringify(oversizedName));
    assert.equal(updatedProfile, undefined);
    const profile = await (await request('mutation { updateProfile(fullName: "山田 太郎", email: "user@example.com") { fullName email } }', 'valid')).json();
    assert.equal(profile.data?.updateProfile?.fullName, '山田 太郎', JSON.stringify(profile));
    assert.deepEqual(updatedProfile, { fullName: '山田 太郎', email: 'user@example.com' });
    observed = undefined;
    const invalid = await (await request('{ history(cursor: "not-a-uuid") { nextCursor } }', 'valid')).json();
    assert.ok(invalid.errors?.length, JSON.stringify(invalid));
    assert.equal(observed, undefined);
    const id = 'd5a04720-d839-4d8c-bfc2-d6310970bca1';
    const download = await (await request(`{ downloadUrl(jobId: "${id}") }`, 'valid')).json();
    assert.equal(download.data?.downloadUrl, '/download', JSON.stringify(download));
    assert.deepEqual(observed, [id, 'owner-id']);
    observed = undefined;
    const badDownload = await (await request('{ downloadUrl(jobId: "bad") }', 'valid')).json();
    assert.ok(badDownload.errors?.length, JSON.stringify(badDownload));
    assert.equal(observed, undefined);
    const unsupportedSort = await (await request('{ history(sort: "createdAt") { nextCursor } }', 'valid')).json();
    assert.ok(unsupportedSort.errors?.length, JSON.stringify(unsupportedSort));
    const deletion = await (await request(`mutation { deleteHistoryItem(id: "${id}") { ok } }`, 'valid')).json();
    assert.equal(deletion.data?.deleteHistoryItem?.ok, true, JSON.stringify(deletion));
    assert.deepEqual(observed, [id, 'owner-id']);
    observed = undefined;
    const badDeletion = await (await request('mutation { deleteHistoryItem(id: "bad") { ok } }', 'valid')).json();
    assert.ok(badDeletion.errors?.length, JSON.stringify(badDeletion));
    assert.equal(observed, undefined);
  } finally { await app.close(); }
});
