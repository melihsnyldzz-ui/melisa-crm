import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import { sendCrmTextMessage } from './sendService.js';
import {
  createMemoryOutboundAttemptStore,
  resetOutboundAttemptsForTests,
} from './outboundAttemptService.js';

function captureSendConfig() {
  return {
    provider: env.whatsapp.provider,
    sendEnabled: env.whatsapp.sendEnabled,
    testNumberOnly: env.whatsapp.testNumberOnly,
    liveSendApproved: env.whatsapp.liveSendApproved,
    allowedTestNumbers: [...env.whatsapp.allowedTestNumbers],
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    chatwootBaseUrl: env.chatwoot.baseUrl,
    chatwootAccountId: env.chatwoot.accountId,
    chatwootApiAccessToken: env.chatwoot.apiAccessToken,
  };
}

function restoreSendConfig(config) {
  env.whatsapp.provider = config.provider;
  env.whatsapp.sendEnabled = config.sendEnabled;
  env.whatsapp.testNumberOnly = config.testNumberOnly;
  env.whatsapp.liveSendApproved = config.liveSendApproved;
  env.whatsapp.allowedTestNumbers = [...config.allowedTestNumbers];
  env.evolution.apiUrl = config.apiUrl;
  env.evolution.apiKey = config.apiKey;
  env.evolution.instance = config.instance;
  env.chatwoot.baseUrl = config.chatwootBaseUrl;
  env.chatwoot.accountId = config.chatwootAccountId;
  env.chatwoot.apiAccessToken = config.chatwootApiAccessToken;
}

test('fails closed when CRM sending is disabled', async () => {
  const config = captureSendConfig();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  env.whatsapp.sendEnabled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      () => sendCrmTextMessage({ phone: '905551112233', text: 'Merhaba' }),
      (error) => {
        assert.equal(error.code, 'WHATSAPP_CRM_SEND_DISABLED');
        assert.equal(error.statusCode, 403);
        return true;
      },
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreSendConfig(config);
  }
});

test('fails closed when test mode has no allowed numbers', async () => {
  const config = captureSendConfig();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = true;
  env.whatsapp.allowedTestNumbers = [];
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      () => sendCrmTextMessage({ phone: '905551112233', text: 'Merhaba' }),
      (error) => {
        assert.equal(error.code, 'WHATSAPP_CRM_SEND_ALLOWLIST_EMPTY');
        assert.equal(error.statusCode, 403);
        return true;
      },
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreSendConfig(config);
  }
});

test('fails closed when live sending has no explicit approval', async () => {
  const config = captureSendConfig();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = false;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      () => sendCrmTextMessage({ phone: '905551112233', text: 'Merhaba' }),
      (error) => {
        assert.equal(error.code, 'WHATSAPP_CRM_LIVE_SEND_NOT_APPROVED');
        assert.equal(error.statusCode, 403);
        return true;
      },
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreSendConfig(config);
  }
});

test('allows WhatsApp LID targets through Evolution remoteJid', async () => {
  const config = captureSendConfig();
  const originalFetch = globalThis.fetch;
  const calls = [];

  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith('/chat/findContacts/melisa-test')) {
      return {
        ok: true,
        json: async () => ({ value: [] }),
      };
    }

    return {
      ok: true,
      json: async () => ({ key: { id: 'lid-message-1' } }),
    };
  };

  try {
    const result = await sendCrmTextMessage({
      clientRequestId: 'test-lid-send-0001',
      conversationId: 25,
      phone: '51453859229862',
      remoteJid: '51453859229862@lid',
      text: 'Merhaba',
    }, {
      attemptStore: createMemoryOutboundAttemptStore(),
      verifyDeliveryProof: async ({ providerMessageId }) => ({
        confirmed: true,
        providerMessageId,
        chatwootMessageId: 'cw-lid-1',
      }),
    });

    assert.equal(result.providerMessageId, 'lid-message-1');
    assert.equal(result.conversationId, '25');
    assert.equal(result.message.status, 'sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.number, '51453859229862@lid');
  } finally {
    globalThis.fetch = originalFetch;
    restoreSendConfig(config);
  }
});

test('fails closed for group targets before calling Evolution', async () => {
  const config = captureSendConfig();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      () => sendCrmTextMessage({
        phone: '120363405099928676',
        remoteJid: '120363405099928676@g.us',
        text: 'Merhaba',
      }),
      (error) => {
        assert.equal(error.code, 'WHATSAPP_CRM_SEND_TARGET_UNSUPPORTED');
        assert.equal(error.statusCode, 400);
        return true;
      },
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreSendConfig(config);
  }
});

test('accepts a numeric Chatwoot conversation id from the inbox DTO', async () => {
  const config = captureSendConfig();
  const originalFetch = globalThis.fetch;
  const calls = [];

  env.whatsapp.provider = 'chatwoot';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.apiAccessToken = 'test-token';
  globalThis.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 501, created_at: 1_700_000_000, status: 'sent' }),
    };
  };

  try {
    const result = await sendCrmTextMessage({
      clientRequestId: 'test-chatwoot-send-0001',
      conversationId: 25,
      text: 'Merhaba',
    }, {
      attemptStore: createMemoryOutboundAttemptStore(),
      verifyDeliveryProof: async ({ providerMessageId }) => ({
        confirmed: true,
        providerMessageId,
        chatwootMessageId: '501',
      }),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'http://chatwoot.local/api/v1/accounts/2/conversations/25/messages');
    assert.equal(result.conversationId, '25');
    assert.equal(result.providerMessageId, '501');
    assert.equal(result.message.id, '501');
    assert.equal(result.message.status, 'sent');
  } finally {
    globalThis.fetch = originalFetch;
    restoreSendConfig(config);
  }
});

test('clientRequestId makes a confirmed outbound request idempotent', async () => {
  const config = captureSendConfig();
  resetOutboundAttemptsForTests();
  let sendCount = 0;
  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';

  const dependencies = {
    attemptStore: createMemoryOutboundAttemptStore(),
    provider: {
      async sendMessage() {
        sendCount += 1;
        return { providerMessageId: 'wa-idempotent-1', sentAt: new Date().toISOString(), text: 'Merhaba' };
      },
    },
    verifyDeliveryProof: async () => ({ confirmed: true, chatwootMessageId: 'cw-idempotent-1' }),
  };

  try {
    const payload = {
      clientRequestId: 'idempotency-test-0001',
      conversationId: 25,
      phone: '905551112233',
      instanceKey: 'melisa-test',
      text: 'Merhaba',
    };
    const first = await sendCrmTextMessage(payload, dependencies);
    const duplicate = await sendCrmTextMessage(payload, dependencies);
    assert.equal(first.delivery.deliveryState, 'CONFIRMED');
    assert.equal(duplicate.deliveryState, 'CONFIRMED');
    assert.equal(duplicate.duplicate, true);
    assert.equal(sendCount, 1);
  } finally {
    resetOutboundAttemptsForTests();
    restoreSendConfig(config);
  }
});

test('missing provider message id becomes UNCONFIRMED_NO_RETRY and is never resent', async () => {
  const config = captureSendConfig();
  resetOutboundAttemptsForTests();
  let sendCount = 0;
  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';

  const dependencies = {
    attemptStore: createMemoryOutboundAttemptStore(),
    provider: {
      async sendMessage() {
        sendCount += 1;
        return { providerMessageId: null, sentAt: new Date().toISOString(), text: 'Merhaba' };
      },
    },
  };
  const payload = {
    clientRequestId: 'unconfirmed-test-0001',
    conversationId: 25,
    phone: '905551112233',
    instanceKey: 'melisa-test',
    text: 'Merhaba',
  };

  try {
    await assert.rejects(
      () => sendCrmTextMessage(payload, dependencies),
      (error) => error.code === 'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY'
        && error.meta.deliveryState === 'UNCONFIRMED_NO_RETRY',
    );
    await assert.rejects(
      () => sendCrmTextMessage(payload, dependencies),
      (error) => error.code === 'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY' && error.statusCode === 409,
    );
    assert.equal(sendCount, 1);
  } finally {
    resetOutboundAttemptsForTests();
    restoreSendConfig(config);
  }
});

test('same clientRequestId cannot be reused for different message content', async () => {
  const config = captureSendConfig();
  resetOutboundAttemptsForTests();
  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  const dependencies = {
    attemptStore: createMemoryOutboundAttemptStore(),
    provider: { sendMessage: async () => ({ providerMessageId: 'wa-conflict-1', text: 'A' }) },
    verifyDeliveryProof: async () => ({ confirmed: true, chatwootMessageId: 'cw-conflict-1' }),
  };

  try {
    const base = {
      clientRequestId: 'conflict-test-0001', conversationId: 25, phone: '905551112233',
      instanceKey: 'melisa-test', text: 'A',
    };
    await sendCrmTextMessage(base, dependencies);
    await assert.rejects(
      () => sendCrmTextMessage({ ...base, text: 'B' }, dependencies),
      (error) => error.code === 'WHATSAPP_CRM_IDEMPOTENCY_CONFLICT' && error.statusCode === 409,
    );
  } finally {
    resetOutboundAttemptsForTests();
    restoreSendConfig(config);
  }
});
