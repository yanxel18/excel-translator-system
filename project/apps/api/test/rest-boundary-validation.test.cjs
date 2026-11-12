const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { JwtAuthGuard } = require('../dist/modules/authentication/jwt-auth.guard');
const { JobManagementController } = require('../dist/modules/job-management/job-management.controller');
const { DatabaseJobManagementService } = require('../dist/modules/job-management/database-job-management.service');
const { ProductSurfacesController } = require('../dist/modules/product-surfaces/product-surfaces.controller');
const { ProductSurfacesService } = require('../dist/modules/product-surfaces/product-surfaces.service');
const { NotificationsController } = require('../dist/modules/notifications/notifications.controller');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');
test('job, history and notification endpoints validate request boundaries', async () => {
  const id = 'd5a04720-d839-4d8c-bfc2-d6310970bca1'; let history;
  const moduleRef = await Test.createTestingModule({ controllers: [JobManagementController, ProductSurfacesController, NotificationsController], providers: [
    { provide: DatabaseJobManagementService, useValue: { getJob: async () => ({}), updateJobSettings: async () => ({}) } },
    { provide: ProductSurfacesService, useValue: { history: async (...args) => { history = args; return {}; }, preview: async () => ({}) } },
    { provide: NotificationsService, useValue: { markRead: async () => ({}), list: async () => ({}) } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (ctx) => { ctx.switchToHttp().getRequest().user = { userId: 'user' }; return true; } }).compile();
  const app = moduleRef.createNestApplication(); await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const patch = (path, body) => fetch(base + path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await fetch(base + '/jobs/bad')).status, 400);
    assert.equal((await fetch(base + '/jobs/' + id)).status, 200);
    assert.equal((await patch('/jobs/' + id + '/settings', { unexpected: true })).status, 400);
    assert.equal((await patch('/jobs/' + id + '/settings', { selectedSheets: ['Sheet1'] })).status, 200);
    for (const query of ['page=0', 'page=1.5', 'page=100001', 'page=1&extra=x', 'cursor=bad']) assert.equal((await fetch(base + '/history?' + query)).status, 400, query);
    assert.equal((await fetch(base + '/history?page=2')).status, 200);
    assert.deepEqual(history, ['user', undefined, 2]);
    assert.equal((await fetch(base + '/jobs/' + id + '/preview?version=bad')).status, 400);
    assert.equal((await patch('/notifications/bad/read', {})).status, 400);
    assert.equal((await fetch(base + '/notifications?cursor=bad')).status, 400);
  } finally { await app.close(); }
});
