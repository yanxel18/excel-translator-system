const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthenticationService } = require('../dist/modules/authentication/authentication.service');

function fixture() {
  const user = { id: 'user-1', username: 'alice', passwordHash: null, enabled: true, sessionVersion: 0 };
  let payload = { sub: user.id, username: user.username, sessionVersion: 0 };
  const jwt = { verifyAsync: async () => payload, sign: (value) => JSON.stringify(value) };
  const prisma = {
    user: { findUnique: async () => user },
    userIdentity: { findUnique: async () => ({ user }) },
  };
  const keycloak = { verify: async () => ({ sub: 'provider-id', preferred_username: 'alice' }) };
  return { user, jwt, service: new AuthenticationService(jwt, prisma, keycloak), setPayload: (p) => { payload = p; } };
}

test('local sessions are rejected after disablement or session version change', async () => {
  const f = fixture();
  assert.equal((await f.service.verifySession('token')).userId, f.user.id);
  f.user.enabled = false;
  await assert.rejects(f.service.verifySession('token'));
  f.user.enabled = true;
  f.user.sessionVersion++;
  await assert.rejects(f.service.verifySession('token'));
});

test('legacy local sessions are accepted only until the first revocation', async () => {
  const f = fixture();
  f.setPayload({ sub: f.user.id, username: f.user.username });
  assert.equal((await f.service.verifySession('token')).userId, f.user.id);
  f.user.sessionVersion++;
  await assert.rejects(f.service.verifySession('token'));
});

test('disabled Keycloak identities cannot exchange or use provider tokens', async () => {
  const f = fixture();
  f.user.enabled = false;
  f.jwt.verifyAsync = async () => { throw new Error('not local'); };
  await assert.rejects(f.service.verifySession('provider-token'));
  await assert.rejects(f.service.exchangeKeycloakToken('provider-token'));
});

test('new local tokens carry the persisted session version', async () => {
  const f = fixture();
  f.user.sessionVersion = 3;
  const result = await f.service.login({ userId: f.user.id, username: 'alice', isAdmin: false });
  assert.equal(JSON.parse(result.access_token).sessionVersion, 3);
  f.user.enabled = false;
  await assert.rejects(f.service.login({ userId: f.user.id, username: 'alice', isAdmin: false }));
});
