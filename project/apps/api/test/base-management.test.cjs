const test = require('node:test');
const assert = require('node:assert/strict');
const { BaseService } = require('../dist/modules/base-management/base.service');
const { BaseController } = require('../dist/modules/base-management/base.controller');
const { AdminAuthGuard } = require('../dist/modules/authentication/admin-auth.guard');
const { JwtAuthGuard } = require('../dist/modules/authentication/jwt-auth.guard');

test('base list applies validated search, ordering and pagination', async () => {
  let query;
  const service = new BaseService({ base: {
    findMany: async (input) => { query = input; return []; },
    count: async () => 0,
  } });
  const result = await service.list({ q: '東京', sort: 'name', direction: 'desc', page: '2', pageSize: '20' });
  assert.equal(result.page, 2);
  assert.equal(query.skip, 20);
  assert.deepEqual(query.orderBy, [{ name: 'desc' }, { id: 'asc' }]);
  assert.equal(query.where.OR[0].code.contains, '東京');
  await assert.rejects(service.list({ sort: 'unsafe' }));
  await assert.rejects(service.list({ pageSize: '11' }));
});

test('base creation normalizes codes and accepts CJK names', async () => {
  let data;
  const service = new BaseService({ base: { create: async (input) => { data = input.data; return data; } } });
  await service.create({ code: ' jty ', name: '東京' });
  assert.deepEqual(data, { code: 'JTY', name: '東京' });
  await assert.rejects(service.create({ code: 'bad code', name: 'Tokyo' }));
  await assert.rejects(service.create({ code: 'JTY', name: 'Tokyo', extra: true }));
});

test('duplicate Base codes are reported as conflicts', async () => {
  const service = new BaseService({ base: { create: async () => { throw { code: 'P2002' }; } } });
  await assert.rejects(service.create({ code: 'jty', name: 'Tokyo' }), (error) => error.status === 409);
});

test('database foreign key restriction is reported as an assigned-base conflict', async () => {
  const service = new BaseService({ base: { delete: async () => { throw { code: 'P2003' }; } } });
  await assert.rejects(service.remove('11111111-1111-4111-8111-111111111111'), (error) => error.status === 409);
});

test('base controller requires authenticated administrator access', () => {
  const guards = Reflect.getMetadata('__guards__', BaseController);
  assert.ok(guards.includes(JwtAuthGuard));
  assert.ok(guards.includes(AdminAuthGuard));
  const context = (user) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) });
  assert.throws(() => new AdminAuthGuard().canActivate(context({ isAdmin: false })), (error) => error.status === 403);
  assert.equal(new AdminAuthGuard().canActivate(context({ isAdmin: true })), true);
});
