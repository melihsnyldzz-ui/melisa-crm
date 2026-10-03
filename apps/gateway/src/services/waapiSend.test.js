import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { sendCrmTextMessage } from './sendService.js';
import { createMemoryOutboundAttemptStore } from './outboundAttemptService.js';

function setup(t) {
  const original = { ...env.whatsapp }; t.after(() => Object.assign(env.whatsapp, original));
  Object.assign(env.whatsapp, { provider: 'waapi', sendEnabled: true, liveSendApproved: true, testNumberOnly: true, allowedTestNumbers: ['19999999999'] });
  const attemptStore = createMemoryOutboundAttemptStore(); attemptStore.reset();
  const calls = { sends: 0, imports: 0, journal: 0 };
  const deps = { attemptStore, provider: { sendMessage: async () => { calls.sends++; return { provider: 'waapi', providerMessageId: 'waapi-test-id', text: 'hello' }; } },
    bridge: { assertSafe: async () => {}, resolveConversation: async () => {}, sync: async () => { calls.imports++; } },
    journal: { accept: async () => { calls.journal++; } }, verifyDeliveryProof: async () => ({ confirmed: true, chatwootMessageId: '123' }) };
  const payload = { phone: '19999999999', conversationId: '55', text: 'hello', clientRequestId: 'WAAPI-FAKE-REQUEST-001' };
  return { calls, deps, payload };
}
test('WAAPI confirmed request is not resent and different body conflicts', async t => {
  const { deps, calls, payload } = setup(t);
  const sent = await sendCrmTextMessage(payload, deps); assert.equal(sent.message.direction, 'outgoing'); assert.equal(sent.message.status, 'accepted');
  await sendCrmTextMessage(payload, deps);
  await assert.rejects(sendCrmTextMessage({ ...payload, text: 'different' }, deps), e => e.code === 'WHATSAPP_CRM_IDEMPOTENCY_CONFLICT');
  assert.equal(calls.sends, 1); assert.equal(calls.imports, 1); assert.equal(calls.journal, 1);
});
test('WAAPI Chatwoot failure keeps accepted provider id and locks resend', async t => {
  const { deps, calls, payload } = setup(t); deps.bridge.sync = async () => { throw new Error('offline'); };
  await assert.rejects(sendCrmTextMessage(payload, deps), e => e.code === 'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY');
  await assert.rejects(sendCrmTextMessage(payload, deps), e => e.code === 'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY');
  assert.equal(calls.sends, 1); assert.equal(calls.journal, 1);
});
test('WAAPI preflight blocks unsafe bridge before provider send', async t => {
  const { deps, calls, payload } = setup(t);
  deps.bridge.assertSafe = async () => { throw Object.assign(new Error('unsafe'), { meta: { transportAttempted: false } }); };
  await assert.rejects(sendCrmTextMessage(payload, deps)); assert.equal(calls.sends, 0);
});
test('WAAPI nontrial customer cannot bypass hard allowlist via operational flags', async t => {
  const { deps, calls, payload } = setup(t); env.whatsapp.testNumberOnly = false; env.whatsapp.liveSendApproved = true;
  await assert.rejects(sendCrmTextMessage({ ...payload, phone: '905000000000' }, deps), /izin verilmedi/); assert.equal(calls.sends, 0);
});
