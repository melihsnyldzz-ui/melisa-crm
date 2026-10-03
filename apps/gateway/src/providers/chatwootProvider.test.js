import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import { ChatwootProvider } from './chatwootProvider.js';

test('sends through the selected Chatwoot conversation instead of guessing a phone target', async () => {
  const originalFetch = globalThis.fetch;
  const original = { ...env.chatwoot };
  const calls = [];

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.apiAccessToken = 'test-token';
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ id: 42, created_at: 1_700_000_000, status: 'sent' }),
    };
  };

  try {
    const result = await new ChatwootProvider().sendMessage({
      conversationId: '17',
      text: 'Merhaba',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://chatwoot.local/api/v1/accounts/2/conversations/17/messages');
    assert.equal(calls[0].options.headers.api_access_token, 'test-token');
    assert.equal(JSON.parse(calls[0].options.body).message_type, 'outgoing');
    assert.equal(result.providerMessageId, '42');
    assert.equal(result.provider, 'chatwoot');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.chatwoot, original);
  }
});

test('fails closed when Chatwoot conversation id is missing', async () => {
  await assert.rejects(
    () => new ChatwootProvider().sendMessage({ text: 'Merhaba' }),
    (error) => error.code === 'WHATSAPP_CRM_CHATWOOT_CONVERSATION_REQUIRED' && error.statusCode === 400,
  );
});
