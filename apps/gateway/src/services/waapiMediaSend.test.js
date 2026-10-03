import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { sendCrmTextMessage } from './sendService.js';
import { createRedisOutboundAttemptStore } from './outboundAttemptService.js';
import { validMediaBytes, validPdf } from '../utils/validMediaFixtures.js';
function fixture(t) {
  const original = { whatsapp: { ...env.whatsapp }, waapi: { ...env.waapi } };
  t.after(() => { Object.assign(env.whatsapp, original.whatsapp); Object.assign(env.waapi, original.waapi); });
  Object.assign(env.whatsapp, { provider: 'waapi', sendEnabled: true, liveSendApproved: true, testNumberOnly: true, allowedTestNumbers: ['19999999999'] });
  env.waapi.outboundMediaEnabled = true;
  const records = new Map(); let sends = 0; const journalEvents = [];
  const command = work => work({ get: async key => records.get(key) || null, pttl: async () => -1,
    set: async (key, value, ...args) => { if (args.includes('NX') && records.has(key)) return null; records.set(key,value); return 'OK'; } });
  const dependencies = { attemptStore: createRedisOutboundAttemptStore(command),
    provider: { sendMessage: async payload => { sends++; return { provider: 'waapi', providerMessageId: 'true_19999999999@c.us_MEDIA', sentAt: '2026-10-02T00:00:00.000Z', text: payload.text, messageType: 'file', media: { mimeType: payload.media.mimeType } }; } },
    journal: { accept: async e => journalEvents.push(e) },
    bridge: { assertSafe: async () => {}, resolveConversation: async () => {}, sync: async () => ({ confirmed: true }) },
    verifyDeliveryProof: async () => ({ confirmed: true, chatwootMessageId: '123' }) };
  const bytes = validMediaBytes('application/pdf');
  const payload = { conversationId: '55', phone: '19999999999', text: 'synthetic caption', actorId: 'offline-user',
    clientRequestId: 'SYNTHETIC-MEDIA-REQ-001', media: { dataUrl: 'data:application/pdf;base64,' + bytes.toString('base64'), fileName: 'synthetic.pdf', mimeType: 'application/pdf' } };
  return { dependencies, payload, bytes, journalEvents, command, sends: () => sends };
}
test('send pipeline journals original media bytes and repeat after store reconstruction never sends again', async t => {
  const f = fixture(t);
  const first = await sendCrmTextMessage(f.payload, f.dependencies);
  assert.equal(first.message.status, 'accepted');
  assert.deepEqual(Buffer.from(f.journalEvents[0].media.data, 'base64'), f.bytes);
  assert.equal(f.journalEvents[0].media.fileName, 'synthetic.pdf');
  f.dependencies.attemptStore = createRedisOutboundAttemptStore(f.command);
  assert.equal((await sendCrmTextMessage(f.payload, f.dependencies)).duplicate, true);
  for (const patch of [{ actorId: 'other-user' }, { conversationId: '56' }, { media: { ...f.payload.media, dataUrl: 'data:application/pdf;base64,' + validPdf('Different synthetic PDF').toString('base64') } }]) {
    await assert.rejects(sendCrmTextMessage({ ...f.payload, ...patch }, f.dependencies), e => e.code.endsWith('IDEMPOTENCY_CONFLICT'));
  }
  assert.equal(f.sends(), 1); assert.equal(f.journalEvents.length, 1);
});
test('media accepted but missing bridge proof stays locked after store reconstruction', async t => {
  const f = fixture(t); f.dependencies.bridge.sync = async () => { throw new Error('synthetic offline bridge'); };
  await assert.rejects(sendCrmTextMessage(f.payload, f.dependencies), e => e.code.endsWith('UNCONFIRMED_NO_RETRY'));
  f.dependencies.attemptStore = createRedisOutboundAttemptStore(f.command);
  await assert.rejects(sendCrmTextMessage(f.payload, f.dependencies), e => e.code.endsWith('UNCONFIRMED_NO_RETRY'));
  assert.equal(f.sends(), 1); assert.equal(f.journalEvents.length, 1);
});
test('disabled media gate and invalid content fail before creating send attempt', async t => {
  const f = fixture(t); let attempts = 0;
  f.dependencies.attemptStore = { begin: async () => { attempts++; throw new Error('unexpected attempt'); } };
  env.waapi.outboundMediaEnabled = false;
  await assert.rejects(sendCrmTextMessage(f.payload, f.dependencies), e => e.code.endsWith('WAAPI_PILOT_TEXT_ONLY'));
  await assert.rejects(sendCrmTextMessage({ ...f.payload, media: { ...f.payload.media, mimeType: 'image/png' } }, f.dependencies), e => e.code.endsWith('MEDIA_MIME_MISMATCH'));
  assert.equal(attempts, 0); assert.equal(f.sends(), 0);
});
test('disguised HTML cannot create idempotency attempt or send transport',async t=>{
  const f=fixture(t); let begins=0;
  f.dependencies.attemptStore={begin:async()=>{begins++;throw new Error('unexpected begin');}};
  await assert.rejects(sendCrmTextMessage({...f.payload,media:{...f.payload.media,dataUrl:'data:application/pdf;base64,'+Buffer.from('<html>synthetic</html>').toString('base64')}},f.dependencies),
    e=>e.code==='WHATSAPP_CRM_MEDIA_FORMAT_INVALID'&&e.meta.transportAttempted===false);
  assert.equal(begins,0); assert.equal(f.sends(),0); assert.equal(f.journalEvents.length,0);
});
