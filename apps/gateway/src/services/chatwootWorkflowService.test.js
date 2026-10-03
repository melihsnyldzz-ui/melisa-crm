import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import {
  addChatwootConversationNote,
  addChatwootConversationTag,
  createChatwootConversationQuote,
  updateChatwootConversationStage,
} from './chatwootWorkflowService.js';

function withChatwootTest(run) {
  return async () => {
    const originalFetch = global.fetch;
    const originalChatwoot = { ...env.chatwoot };
    env.chatwoot.baseUrl = 'http://chatwoot.local';
    env.chatwoot.accountId = 2;
    env.chatwoot.apiAccessToken = 'test-token';
    try {
      await run((handler) => { global.fetch = handler; });
    } finally {
      global.fetch = originalFetch;
      Object.assign(env.chatwoot, originalChatwoot);
    }
  };
}

test('CRM stage is persisted in Chatwoot custom attributes', withChatwootTest(async (setFetch) => {
  let request;
  setFetch(async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ custom_attributes: { melisa_stage: 'Teklif' } }), { status: 200 });
  });
  const result = await updateChatwootConversationStage({ conversationId: 41, stage: 'Teklif', actor: { id: 7 } });
  assert.equal(request.url, 'http://chatwoot.local/api/v1/accounts/2/conversations/41/custom_attributes');
  assert.deepEqual(JSON.parse(request.options.body), { custom_attributes: { melisa_stage: 'Teklif' } });
  assert.equal(result.stage, 'Teklif');
}));

test('CRM note is private and cannot be sent to the customer', withChatwootTest(async (setFetch) => {
  let body;
  setFetch(async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 91 }), { status: 200 });
  });
  await addChatwootConversationNote({ conversationId: 41, note: 'Fiyat bekliyor', actor: { id: 7, displayName: 'Ahmet' } });
  assert.equal(body.private, true);
  assert.equal(body.content_attributes.melisa_crm.type, 'note');
}));

test('CRM tag preserves current Chatwoot labels', withChatwootTest(async (setFetch) => {
  const bodies = [];
  setFetch(async (_url, options = {}) => {
    if (!options.body) return new Response(JSON.stringify({ payload: ['romanya'] }), { status: 200 });
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ payload: ['romanya', 'teklif'] }), { status: 200 });
  });
  const result = await addChatwootConversationTag({ conversationId: 41, tag: 'teklif' });
  assert.deepEqual(bodies[0], { labels: ['romanya', 'teklif'] });
  assert.deepEqual(result.tags, ['romanya', 'teklif']);
}));

test('CRM quote uses the CRM contact and does not require an ERP customer id', withChatwootTest(async (setFetch) => {
  let body;
  setFetch(async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 92 }), { status: 200 });
  });
  const result = await createChatwootConversationQuote({
    conversationId: 41,
    contact: { name: 'CRM Musterisi', phone: '+905301112233', country: 'Turkiye' },
    lines: [{ id: 5, stockCode: 'STK-5', productName: 'Urun', quantity: 2, salePrice: 10, currency: 'TRY' }],
    actor: { id: 7 },
  });
  assert.equal(body.private, true);
  assert.equal(body.content_attributes.melisa_crm.data.quote.contact.name, 'CRM Musterisi');
  assert.equal(body.content_attributes.melisa_crm.data.quote.total, 20);
  assert.equal(result.contact.name, 'CRM Musterisi');
  assert.equal(result.total, 20);
}));
