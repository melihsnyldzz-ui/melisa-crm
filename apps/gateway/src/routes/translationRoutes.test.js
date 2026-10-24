import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { createPasswordHash } from '../services/crmAuthService.js';

test('personnel cannot translate a conversation assigned to another agent', async () => {
  const previousPaidPolicy=process.env.CRM_PAID_AI_ENABLED;
  process.env.CRM_PAID_AI_ENABLED='true';
  const originalAuth = { ...env.auth, users: env.auth.users };
  const originalChatwoot = { ...env.chatwoot };
  const originalFetch = globalThis.fetch;
  const password = 'Translation-Route-Test-2026!';
  env.auth.jwtSecret = 'translation-route-secret-longer-than-thirty-two';
  env.auth.issuer = 'translation-route-test';
  env.auth.audience = 'translation-route-client';
  env.auth.users = [{
    id: 'staff-translation', username: 'staff-translation', displayName: 'Staff', role: 'personel', active: true,
    passwordHash: createPasswordHash(password, 'translation-route-salt'), chatwootAgentId: 3,
  }];
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-chatwoot-token';
  env.chatwoot.inboxReadEnabled = true;

  let openAiCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('https://api.openai.com/')) {
      openAiCalled = true;
      throw new Error('OpenAI must not be called');
    }
    if (String(url).endsWith('/conversations/55')) {
      return new Response(JSON.stringify({
        id: 55,
        inbox_id: 1,
        status: 'open',
        meta: { sender: { name: 'Customer', phone_number: '+905551112233' }, assignee: { id: 4, name: 'Other' } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).endsWith('/conversations/55/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(url, options);
  };

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const { port } = server.address();
    const login = await originalFetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff-translation', password }),
    });
    const loginBody = await login.json();
    const response = await originalFetch(`http://127.0.0.1:${port}/crm/conversations/55/translate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginBody.data.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'incoming_to_tr',aiIntent:{userInitiated:true,action:'manual'} }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
    assert.equal(openAiCalled, false);
  } finally {
    if(previousPaidPolicy===undefined)delete process.env.CRM_PAID_AI_ENABLED;else process.env.CRM_PAID_AI_ENABLED=previousPaidPolicy;
    server.close();
    globalThis.fetch = originalFetch;
    Object.assign(env.auth, originalAuth);
    Object.assign(env.chatwoot, originalChatwoot);
  }
});
