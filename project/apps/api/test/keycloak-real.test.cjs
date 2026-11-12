const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { JwtService } = require('@nestjs/jwt');
const { AuthenticationService } = require('../dist/modules/authentication/authentication.service');
const { KeycloakVerifierService } = require('../dist/modules/authentication/keycloak-verifier.service');
const { JwtAuthGuard } = require('../dist/modules/authentication/jwt-auth.guard');

const base = process.env.V2_TEST_KEYCLOAK_URL;
const adminName = process.env.V2_TEST_KEYCLOAK_ADMIN;
const adminPassword = process.env.V2_TEST_KEYCLOAK_PASSWORD;

test('real Keycloak tokens and exchanged sessions respect account disablement', { skip: !(base && adminName && adminPassword) && 'Set V2_TEST_KEYCLOAK_URL and disposable admin credentials', timeout: 60000 }, async () => {
  const address = new URL(base);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(address.hostname), 'Use a disposable local Keycloak only');
  assert.equal(address.protocol, 'http:');
  const realm = `v2-test-${randomUUID()}`;
  const issuer = `${address.origin}/realms/${realm}`;
  const clientId = 'v2-session-test';
  const form = (data) => new URLSearchParams(data);
  const requestToken = async (url, values) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(values) });
    assert.equal(res.status, 200, `Token request returned ${res.status}`);
    return (await res.json()).access_token;
  };
  const admin = await requestToken(`${address.origin}/realms/master/protocol/openid-connect/token`, { grant_type: 'password', client_id: 'admin-cli', username: adminName, password: adminPassword });
  const authHeaders = { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' };
  const userPassword = `test-${randomUUID()}`;
  const create = await fetch(`${address.origin}/admin/realms`, { method: 'POST', headers: authHeaders, body: JSON.stringify({
    realm, enabled: true,
    clients: [{ clientId, enabled: true, publicClient: true, directAccessGrantsEnabled: true }],
    users: [{ username: 'session-user', firstName: 'Session', lastName: 'User', email: 'session@example.test', emailVerified: true, enabled: true, credentials: [{ type: 'password', value: userPassword, temporary: false }] }],
  }) });
  assert.equal(create.status, 201, `Realm creation returned ${create.status}`);
  try {
    const token = await requestToken(`${issuer}/protocol/openid-connect/token`, { grant_type: 'password', client_id: clientId, username: 'session-user', password: userPassword });
    const account = { id: randomUUID(), username: 'internal-user', enabled: true, sessionVersion: 0 };
    const settings = { enabled: true, issuerUrl: issuer, keycloakUrl: address.origin, realm, clientId, requiredGroup: '' };
    const db = {
      oidcSettings: { findUnique: async () => settings },
      userIdentity: { findUnique: async () => ({ user: account }) },
      user: { findUnique: async () => account },
    };
    const verifier = new KeycloakVerifierService(db);
    const jwt = new JwtService({ secret: `isolated-${randomUUID()}`, signOptions: { expiresIn: '5m' } });
    const service = new AuthenticationService(jwt, db, verifier);
    const guard = new JwtAuthGuard(service);
    const context = (credential) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${credential}` } }) }) });
    assert.equal((await verifier.verify(token)).preferred_username, 'session-user');
    assert.equal((await service.verifySession(token)).userId, account.id);
    const exchanged = (await service.exchangeKeycloakToken(token)).access_token;
    assert.equal(await guard.canActivate(context(token)), true);
    assert.equal(await guard.canActivate(context(exchanged)), true);
    settings.clientId = 'different-client';
    await assert.rejects(verifier.verify(token));
    settings.clientId = clientId;
    settings.requiredGroup = '/restricted';
    await assert.rejects(verifier.verify(token));
    settings.requiredGroup = '';
    account.enabled = false;
    await assert.rejects(service.exchangeKeycloakToken(token));
    await assert.rejects(guard.canActivate(context(token)), (e) => e.status === 401);
    await assert.rejects(guard.canActivate(context(exchanged)), (e) => e.status === 401);
  } finally {
    const deleted = await fetch(`${address.origin}/admin/realms/${realm}`, { method: 'DELETE', headers: authHeaders });
    assert.equal(deleted.status, 204, `Realm cleanup returned ${deleted.status}`);
  }
});
