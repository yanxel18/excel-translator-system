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
  let observed;
  const moduleRef = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule], providers: [ProductSurfacesResolver,
    { provide: ProductSurfacesService, useValue: { history: async (owner, cursor) => { observed = [owner, cursor]; return { data: [], nextCursor: null }; }, downloadUrl: async (...args) => { observed = args; return '/download'; }, deleteHistoryItem: async (...args) => { observed = args; return { ok: true }; } } },
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
    observed = undefined;
    const invalid = await (await request('{ history(cursor: "not-a-uuid") { nextCursor } }', 'valid')).json();
    assert.ok(invalid.errors?.length, JSON.stringify(invalid));
    assert.equal(observed, undefined);
    const id = 'd5a04720-d839-4d8c-bfc2-d6310970bca1';
    const download = await (await request(`{ downloadUrl(jobId: "${id}") }`, 'valid')).json();
    assert.equal(download.data?.downloadUrl, '/download', JSON.stringify(download));
    assert.deepEqual(observed, [id, 'owner-id']);
    const deletion = await (await request(`mutation { deleteHistoryItem(id: "${id}") { ok } }`, 'valid')).json();
    assert.equal(deletion.data?.deleteHistoryItem?.ok, true, JSON.stringify(deletion));
    assert.deepEqual(observed, [id, 'owner-id']);
    observed = undefined;
    const badDeletion = await (await request('mutation { deleteHistoryItem(id: "bad") { ok } }', 'valid')).json();
    assert.ok(badDeletion.errors?.length, JSON.stringify(badDeletion));
    assert.equal(observed, undefined);
  } finally { await app.close(); }
});
