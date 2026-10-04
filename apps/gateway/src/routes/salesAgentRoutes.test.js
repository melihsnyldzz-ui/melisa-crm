import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { authenticateCrmUser, createPasswordHash } from '../services/crmAuthService.js';

test('real sales-draft route uses auth, trusted Chatwoot DTO and suggestion-only Responses', async t => {
  const original = { auth: { ...env.auth }, chatwoot: { ...env.chatwoot },
    translation: { ...env.translation }, whatsapp: { ...env.whatsapp } };
  const environment = Object.fromEntries(['CRM_AI_SALES_MODE', 'CRM_AI_SALES_CONVERSATION_ID',
    'CRM_AI_SALES_TEST_PEER', 'CRM_AI_SALES_RULES_FILE'].map(key => [key, process.env[key]]));
  const guardedFetch = globalThis.fetch;
  const password = 'Synthetic-sales-route-2026!';
  Object.assign(env.auth, { jwtSecret: 'synthetic-sales-route-secret-longer-than-thirty-two',
    issuer: 'synthetic-sales-route', audience: 'synthetic-sales-client', personnelCanSend: false,
    users: ['patron', 'personel'].map(role => ({ id: `sales-${role}`, username: `sales-${role}`,
      displayName: `Fixture ${role}`, role, active: true, chatwootAgentId: role === 'personel' ? 3 : 1,
      passwordHash: createPasswordHash(password, `sales-route-${role}`) })) });
  Object.assign(env.chatwoot, { baseUrl: 'http://sales-chatwoot.invalid', accountId: 2, inboxId: 1,
    apiAccessToken: 'synthetic-chatwoot-token', inboxReadEnabled: true });
  Object.assign(env.whatsapp, { provider: 'evolution', sendEnabled: false });
  Object.assign(env.translation, { apiKey: 'synthetic-model-key', model: 'synthetic-model' });
  process.env.CRM_AI_SALES_MODE = 'copilot';
  process.env.CRM_AI_SALES_CONVERSATION_ID = '55';
  process.env.CRM_AI_SALES_TEST_PEER = '905387217733';
  delete process.env.CRM_AI_SALES_RULES_FILE;

  let assignment = 3, modelCalls = 0, conversationReads = 0, modelBody, modelFailure = null,
    afterModel = () => {}, duringFirstRead = () => {}, duringSecondRead = () => {}, chatwootFailure = false, phone = '+905387217733';
  const draft = () => ({ action: 'reply', reply: 'Which age range do you need?',
    summaryTr: 'Yaş aralığı soruluyor.', productIds: [], lines: [], handoffReason: '' });
  const json = data => new Response(JSON.stringify(data), { status: 200 });
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === 'https://api.openai.com/v1/responses') {
      modelCalls++;
      modelBody = JSON.parse(options.body);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      if (modelFailure) return new Response('RAW_PROVIDER_INTERNAL_SENTINEL', { status: modelFailure });
      afterModel();
      return json({ status: 'completed', output: [{ type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(draft()) }] }] });
    }
    if (url.startsWith('http://sales-chatwoot.invalid/')) {
      assert.equal(options.method || 'GET', 'GET', 'AI must never send or write to Chatwoot');
      if (chatwootFailure) throw new Error('RAW_CHATWOOT_INTERNAL_SENTINEL');
      if (url.endsWith('/conversations/55/messages')) return json({ payload: [
        { id: 101, content: 'I need baby clothing for my shop.', message_type: 0, created_at: 1700000000 },
        { id: 102, content: 'PRIVATE_NOTE_SENTINEL', private: true, message_type: 1, created_at: 1700000001 },
      ] });
      if (url.endsWith('/conversations/55')) {
        conversationReads++;
        if (conversationReads === 1) duringFirstRead();
        if (conversationReads === 2) duringSecondRead();
        return json({ id: 55, inbox_id: 1, status: 'open',
          meta: { sender: { name: 'Fixture', phone_number: phone },
            assignee: { id: assignment, name: `Fixture agent ${assignment}` } } });
      }
      throw new Error(`Unexpected mock Chatwoot read: ${url}`);
    }
    return guardedFetch(input, options);
  };
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const token = role => authenticateCrmUser({ username: `sales-${role}`, password }).accessToken;
  const request = async ({ conversationId = '55', authorization = `Bearer ${token('patron')}`, body = {} } = {}) => {
    const response = await guardedFetch(`http://127.0.0.1:${server.address().port}/crm/conversations/${conversationId}/sales-draft`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const reset = () => {
    assignment = 3; modelCalls = 0; conversationReads = 0; modelBody = null;
    modelFailure = null; afterModel = () => {}; chatwootFailure = false;
    duringFirstRead = () => {}; duringSecondRead = () => {}; phone = '+905387217733';
    process.env.CRM_AI_SALES_MODE = 'copilot'; process.env.CRM_AI_SALES_CONVERSATION_ID = '55';
    process.env.CRM_AI_SALES_TEST_PEER = '905387217733';
    env.auth.personnelCanSend = false;
    env.auth.users.forEach(user => { user.active = true; });
    env.auth.users[1].chatwootAgentId = 3;
  };
  try {
    await t.test('missing token and missing send permission stop before Chatwoot/model', async () => {
      reset();
      assert.equal((await request({ authorization: null })).status, 401);
      assert.equal((await request({ authorization: `Bearer ${token('personel')}` })).status, 403);
      assert.equal(conversationReads, 0); assert.equal(modelCalls, 0);
    });
    await t.test('server TEST scope rejects another conversation before any read', async () => {
      reset();
      const result = await request({ conversationId: '56' });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'AI_SALES_CONVERSATION_FORBIDDEN');
      assert.equal(conversationReads, 0); assert.equal(modelCalls, 0);
    });
    await t.test('same numeric conversation for another real phone is rejected before model', async () => {
      reset(); phone = '+15555550123';
      const result = await request({ body: { phone: '+905387217733' } });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'AI_SALES_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 0);
    });
    await t.test('real conversation permission stops unassigned staff before model', async () => {
      reset(); env.auth.personnelCanSend = true; assignment = 4;
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 0);
    });
    await t.test('staff binding changed during first Chatwoot read blocks model data access', async () => {
      reset(); env.auth.personnelCanSend = true;
      duringFirstRead = () => { env.auth.users[1].chatwootAgentId = 4; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 0); assert.equal(conversationReads, 1);
    });
    await t.test('browser facts are ignored, server reads twice and returns a human-reviewed draft', async () => {
      reset();
      const result = await request({ body: { messages: ['CLIENT_HISTORY_SENTINEL'],
        products: [{ unitPriceMinor: 1 }], policy: { autoSend: true }, country: 'CLIENT_COUNTRY_SENTINEL' } });
      assert.equal(result.status, 200); assert.equal(conversationReads, 2); assert.equal(modelCalls, 1);
      assert.equal(result.body.data.reply, draft().reply); assert.equal(result.body.data.requiresHumanReview, true);
      assert.equal(result.body.data.autoSend, false); assert.equal(result.body.data.erpWrite, false);
      assert.equal(result.body.data.conversationId, '55'); assert.match(result.body.data.conversationRevision, /^[a-f0-9]{64}$/);
      assert.equal(result.body.meta.readOnly, true); assert.equal(modelBody.store, false); assert.equal(modelBody.tools, undefined);
      const context = JSON.parse(modelBody.input[1].content);
      assert.deepEqual(context.products, []); assert.equal(context.policy.minimumOrder, null);
      assert.equal(context.policy.autoSend, false); assert.equal(context.recentMessages.length, 1);
      const serialized = JSON.stringify(modelBody);
      assert.ok(!serialized.includes('CLIENT_HISTORY_SENTINEL')); assert.ok(!serialized.includes('CLIENT_COUNTRY_SENTINEL'));
      assert.ok(!serialized.includes('PRIVATE_NOTE_SENTINEL')); assert.ok(!serialized.includes('905387217733'));
    });
    await t.test('real DTO assignment changed during model invalidates a patron suggestion', async () => {
      reset(); afterModel = () => { assignment = 4; };
      const result = await request();
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_CONVERSATION_CHANGED');
      assert.equal(conversationReads, 2);
    });
    await t.test('staff access is rechecked after model generation', async () => {
      reset(); env.auth.personnelCanSend = true; afterModel = () => { assignment = 4; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('phone changed during model request rejects generated suggestion', async () => {
      reset(); afterModel = () => { phone = '+15555550123'; };
      const result = await request();
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'AI_SALES_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('disabled staff account during model request is rejected by fresh JWT validation', async () => {
      reset(); env.auth.personnelCanSend = true; afterModel = () => { env.auth.users[1].active = false; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 401); assert.equal(result.body.error.code, 'AUTH_TOKEN_INVALID');
      assert.equal(modelCalls, 1);
    });
    await t.test('send permission revoked during final Chatwoot read is rejected', async () => {
      reset(); env.auth.personnelCanSend = true; duringSecondRead = () => { env.auth.personnelCanSend = false; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_PERMISSION_DENIED');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('staff binding changed during final Chatwoot read rejects result', async () => {
      reset(); env.auth.personnelCanSend = true;
      duringSecondRead = () => { env.auth.users[1].chatwootAgentId = 4; };
      const result = await request({ authorization: `Bearer ${token('personel')}` });
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('mode disabled during awaited final Chatwoot read rejects result', async () => {
      reset(); duringSecondRead = () => { process.env.CRM_AI_SALES_MODE = 'off'; };
      const result = await request();
      assert.equal(result.status, 503); assert.equal(result.body.error.code, 'AI_SALES_DISABLED');
      assert.equal(modelCalls, 1); assert.equal(conversationReads, 2);
    });
    await t.test('scope changed mid-generation rejects the result', async () => {
      reset(); afterModel = () => { delete process.env.CRM_AI_SALES_CONVERSATION_ID; };
      const result = await request();
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AI_SALES_SCOPE_CHANGED');
    });
    await t.test('provider rate limit remains safe and is not retried', async () => {
      reset(); modelFailure = 429;
      const result = await request();
      assert.equal(result.status, 429); assert.equal(result.body.error.code, 'AI_SALES_PROVIDER_FAILED');
      assert.equal(modelCalls, 1); assert.ok(!JSON.stringify(result.body).includes('RAW_PROVIDER_INTERNAL_SENTINEL'));
      assert.ok(!JSON.stringify(result.body).includes('synthetic-model-key'));
    });
    await t.test('unexpected upstream errors do not escape through the generic error handler', async () => {
      reset(); chatwootFailure = true;
      const result = await request();
      assert.equal(result.status, 502); assert.equal(result.body.error.code, 'AI_SALES_UNAVAILABLE');
      assert.ok(!JSON.stringify(result.body).includes('RAW_CHATWOOT_INTERNAL_SENTINEL')); assert.equal(modelCalls, 0);
    });
    await t.test('mode defaults off and makes zero external mock calls', async () => {
      reset(); delete process.env.CRM_AI_SALES_MODE;
      const result = await request();
      assert.equal(result.status, 503); assert.equal(result.body.error.code, 'AI_SALES_DISABLED');
      assert.equal(conversationReads, 0); assert.equal(modelCalls, 0);
    });
  } finally {
    globalThis.fetch = guardedFetch;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(original)) Object.assign(env[key], value);
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
