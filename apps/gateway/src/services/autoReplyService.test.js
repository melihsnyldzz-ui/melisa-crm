import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAutoReply, handleAutoReply, resetAutoReplyCooldowns } from './autoReplyService.js';

const baseEvent = {
  direction: 'inbound',
  remoteJid: '905551112233@s.whatsapp.net',
  phone: '905551112233',
  contactName: 'Test',
  text: 'Selam   MELİSA',
  instanceKey: 'melisa-7733',
};

const options = {
  enabled: true,
  keyword: 'selam melisa',
  imagePath: 'test.png',
  evolutionInstance: 'melisa-7733',
  cooldownMs: 86_400_000,
  now: 1_000_000,
};

test.beforeEach(() => resetAutoReplyCooldowns());

test('accepts exact keyword case-insensitively in a private inbound chat', () => {
  assert.equal(evaluateAutoReply(baseEvent, options).eligible, true);
});

test('rejects groups, outbound messages and non-matching text', () => {
  assert.equal(evaluateAutoReply({ ...baseEvent, remoteJid: '1203630@g.us' }, options).reason, 'not-private-chat');
  assert.equal(evaluateAutoReply({ ...baseEvent, direction: 'outbound' }, options).reason, 'not-inbound');
  assert.equal(evaluateAutoReply({ ...baseEvent, text: 'selam' }, options).reason, 'keyword-mismatch');
  assert.equal(evaluateAutoReply({ ...baseEvent, instanceKey: 'sirket-hatti-1' }, options).reason, 'wrong-instance');
});

test('sends the configured image and applies sender cooldown after success', async () => {
  let sentPayload;
  const result = await handleAutoReply(baseEvent, { conversationId: 12 }, {
    options,
    readFile: async () => Buffer.from('image'),
    sendMessage: async (payload) => {
      sentPayload = payload;
      return { providerMessageId: 'test-1' };
    },
  });

  assert.equal(result.sent, true);
  assert.equal(sentPayload.conversationId, 12);
  assert.equal(sentPayload.instanceKey, 'melisa-7733');
  assert.equal(sentPayload.media.mimeType, 'image/png');
  assert.match(sentPayload.media.dataUrl, /^data:image\/png;base64,/);
  assert.equal(evaluateAutoReply(baseEvent, { ...options, now: options.now + 1 }).reason, 'cooldown');
});

test('does not start cooldown when image loading or sending fails', async () => {
  await assert.rejects(() => handleAutoReply(baseEvent, {}, {
    options,
    readFile: async () => { throw new Error('missing'); },
  }));
  assert.equal(evaluateAutoReply(baseEvent, options).eligible, true);
});
