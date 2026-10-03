import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { createPasswordHash } from '../services/crmAuthService.js';

test('POST /auth/login and GET /auth/me use CRM-local auth', async () => {
  const original = { ...env.auth, users: env.auth.users };
  const originalWhatsapp = {
    provider: env.whatsapp.provider,
    sendEnabled: env.whatsapp.sendEnabled,
    liveSendApproved: env.whatsapp.liveSendApproved,
  };
  const password = 'Route-Test-Parola-2026!';
  env.auth.jwtSecret = 'route-test-secret-that-is-longer-than-thirty-two';
  env.auth.tokenExpiresIn = '8h';
  env.auth.issuer = 'route-test';
  env.auth.audience = 'route-test-client';
  env.auth.personnelCanSend = false;
  env.whatsapp.sendEnabled = true;
  env.whatsapp.provider = 'evolution';
  env.whatsapp.liveSendApproved = true;
  env.auth.users = [
    {
      id: 'owner-1', username: 'patron', displayName: 'Patron', role: 'patron', active: true,
      passwordHash: createPasswordHash(password, 'route-test-owner-salt'), chatwootAgentId: null,
    },
    {
      id: 'manager-1', username: 'mudur', displayName: 'Mudur', role: 'mudur', active: true,
      passwordHash: createPasswordHash(password, 'route-test-manager-salt'), chatwootAgentId: null,
    },
    {
      id: 'staff-1', username: 'personel', displayName: 'Personel', role: 'personel', active: true,
      passwordHash: createPasswordHash(password, 'route-test-staff-salt'), chatwootAgentId: 7,
    },
  ];

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const { port } = server.address();
    const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mudur', password }),
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.equal(loginBody.data.user.role, 'mudur');
    assert.equal(loginBody.data.expiresIn, '8h');
    const managerClaims = jwt.decode(loginBody.data.accessToken);
    assert.equal(managerClaims.exp - managerClaims.iat, 28800);
    assert.equal(loginBody.data.user.liveSendEnabled, true);
    assert.equal(loginBody.data.user.passwordHash, undefined);

    const me = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.data.accessToken}` },
    });
    assert.equal(me.status, 200);
    const meBody = await me.json();
    assert.equal(meBody.data.username, 'mudur');
    assert.equal(meBody.data.liveSendEnabled, true);

    for (const [username, expected] of [['patron', true], ['personel', false]]) {
      const roleLogin = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(roleLogin.status, 200);
      const roleLoginBody = await roleLogin.json();
      assert.equal(roleLoginBody.data.expiresIn, '8h');
      const claims = jwt.decode(roleLoginBody.data.accessToken);
      assert.equal(claims.exp - claims.iat, 28800);
      assert.deepEqual(roleLoginBody.data.user.permissions, username === 'personel' ? ['crm.view'] : ['crm.view', 'crm.send', 'crm.assign', 'crm.agents', 'crm.manage']);
      const roleMe = await fetch(`http://127.0.0.1:${port}/auth/me`, {
        headers: { Authorization: `Bearer ${roleLoginBody.data.accessToken}` },
      });
      assert.equal(roleMe.status, 200);
      assert.equal((await roleMe.json()).data.liveSendEnabled, expected);
    }

    for (const user of env.auth.users) {
      const expired = jwt.sign({ username: user.username, role: user.role }, env.auth.jwtSecret, { subject: user.id, issuer: env.auth.issuer, audience: env.auth.audience, expiresIn: -1 });
      const rejected = await fetch(`http://127.0.0.1:${port}/auth/me`, { headers: { Authorization: `Bearer ${expired}` } });
      assert.equal(rejected.status, 401);
      assert.equal((await rejected.json()).error.code, 'AUTH_TOKEN_EXPIRED');
    }
    for (let i = 0; i <= env.auth.loginRateLimitMax; i++) {
      const failed = await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'rate-limit-test', password: 'invalid' }) });
      assert.equal(failed.status, i < env.auth.loginRateLimitMax ? 401 : 429);
    }
    const unauthorized = await fetch(`http://127.0.0.1:${port}/auth/me`);
    assert.equal(unauthorized.status, 401);
  } finally {
    server.close();
    Object.assign(env.auth, original);
    Object.assign(env.whatsapp, originalWhatsapp);
  }
});
