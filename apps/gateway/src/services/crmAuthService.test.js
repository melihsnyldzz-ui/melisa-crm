import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import {
  assertConversationAccess,
  authenticateCrmUser,
  canAccessConversation,
  createPasswordHash,
  verifyCrmAccessToken,
} from './crmAuthService.js';

function withAuthConfig(callback) {
  const original = { ...env.auth, users: env.auth.users };
  const password = 'Test-Parola-CRM-2026!';
  env.auth.jwtSecret = 'test-secret-that-is-longer-than-thirty-two-characters';
  env.auth.tokenExpiresIn = '5m';
  env.auth.issuer = 'crm-test';
  env.auth.audience = 'crm-test-client';
  env.auth.personnelCanSend = false;
  env.auth.users = [
    {
      id: 'owner-1', username: 'patron', displayName: 'Patron', role: 'patron', active: true,
      passwordHash: createPasswordHash(password, 'owner-test-salt'), chatwootAgentId: 2,
    },
    {
      id: 'staff-1', username: 'personel', displayName: 'Personel', role: 'personel', active: true,
      passwordHash: createPasswordHash(password, 'staff-test-salt'), chatwootAgentId: 7,
    },
  ];

  try {
    return callback({ password });
  } finally {
    Object.assign(env.auth, original);
  }
}

test('CRM login issues a short-lived independently verified token', () => {
  withAuthConfig(({ password }) => {
    const result = authenticateCrmUser({ username: 'PATRON', password });
    assert.equal(result.user.role, 'patron');
    assert.equal(result.user.passwordHash, undefined);
    assert.equal(result.expiresIn, '5m');
    assert.deepEqual(verifyCrmAccessToken(result.accessToken).permissions.includes('crm.assign'), true);
  });
});

test('CRM login fails with a generic error for invalid credentials', () => {
  withAuthConfig(() => {
    assert.throws(
      () => authenticateCrmUser({ username: 'unknown', password: 'wrong' }),
      (error) => error.code === 'WHATSAPP_CRM_LOGIN_FAILED' && error.statusCode === 401,
    );
  });
});

test('personnel can only access conversations assigned to their Chatwoot agent', () => {
  withAuthConfig(({ password }) => {
    const staff = verifyCrmAccessToken(authenticateCrmUser({ username: 'personel', password }).accessToken);
    assert.equal(staff.permissions.includes('crm.send'), false);
    assert.equal(canAccessConversation(staff, { chatwootAgentId: 7 }), true);
    assert.equal(canAccessConversation(staff, { chatwootAgentId: 8 }), false);
    assert.throws(
      () => assertConversationAccess(staff, { chatwootAgentId: 8 }),
      (error) => error.code === 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN' && error.statusCode === 403,
    );
  });
});

test('personnel send permission is controlled by configuration', () => {
  withAuthConfig(({ password }) => {
    env.auth.personnelCanSend = true;
    const staff = verifyCrmAccessToken(authenticateCrmUser({ username: 'personel', password }).accessToken);
    assert.equal(staff.permissions.includes('crm.send'), true);
  });
});
