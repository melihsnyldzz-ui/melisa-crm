import test from 'node:test';
import assert from 'node:assert/strict';
import { WaapiProvider, WAAPI_INSTANCE, WAAPI_RECIPIENT } from './waapiProvider.js';
import { validMediaBytes } from '../utils/validMediaFixtures.js';
import { env } from '../config/env.js';
import { sendCrmTextMessage } from '../services/sendService.js';
import { createRedisOutboundAttemptStore } from '../services/outboundAttemptService.js';
const ready = { status: 'success', clientStatus: { status: 'success', instanceId: WAAPI_INSTANCE, instanceStatus: 'ready' } };
const accepted = { status: 'success', data: { status: 'success', instanceId: WAAPI_INSTANCE, data: { id: { _serialized: 'true_19999999999@c.us_SYNTHETIC', fromMe: true, remote: WAAPI_RECIPIENT + '@c.us' } } } };
function fixture(t, response = accepted) {
  const calls = [];
  const provider = new WaapiProvider({ config: { apiToken: 'offline-fixture-token', instanceId: WAAPI_INSTANCE, outboundMediaEnabled: true },
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'GET') return new Response(JSON.stringify(ready));
      if (response instanceof Error) throw response;
      return new Response(JSON.stringify(response), { status: response.httpStatus || 200 });
    } });
  return { provider, calls };
}
for (const [mime, name, asDocument, type] of [['image/png','photo.png',false,'image'], ['image/png','original.png',true,'file'], ['application/pdf','sample.pdf',true,'file'], ['text/plain','sample.txt',true,'file'],
  ['audio/mpeg','sound.mp3',undefined,'audio'], ['audio/mp4','sound.m4a',undefined,'audio'], ['audio/ogg','sound.ogg',undefined,'audio'], ['audio/wav','sound.wav',undefined,'audio'],
  ['video/mp4','clip.mp4',undefined,'video'], ['audio/ogg','original.ogg',true,'file'], ['video/mp4','original.mp4',true,'file']]) {
  test('WAAPI media exact single POST contract: ' + name, async t => {
    const { provider, calls } = fixture(t); const bytes = validMediaBytes(mime);
    const result = await provider.sendMessage({ phone: WAAPI_RECIPIENT, text: 'synthetic caption', media: {
      mimeType: mime, fileName: name, dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64'), asDocument } });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://waapi.app/api/v1/instances/105185/client/action/send-media');
    assert.deepEqual(JSON.parse(calls[1].options.body), { chatId: '19999999999@c.us', mediaBase64: bytes.toString('base64'),
      mediaName: name, mediaCaption: 'synthetic caption', asDocument: asDocument ?? false, firedandforget: false });
    assert.equal(result.messageType, type); assert.equal(result.status, 'accepted');
    assert.equal(result.delivered, false); assert.equal(result.read, false);
    assert.equal(result.media.quality, asDocument ? 'original-file-requested' : type === 'image' ? 'provider-image-processing' : 'provider-media-processing');
  });
}
test('WAAPI media remains disabled by default and other recipient cannot bypass flag', async t => {
  const { provider, calls } = fixture(t);
  const payload = { phone: WAAPI_RECIPIENT, text: 'synthetic', media: { dataUrl: 'data:image/png;base64,YQ==', fileName: 'a.png' } };
  delete provider.config.outboundMediaEnabled;
  await assert.rejects(provider.sendMessage(payload), e => e.code.endsWith('WAAPI_PILOT_TEXT_ONLY'));
  provider.config.outboundMediaEnabled = true;
  await assert.rejects(provider.sendMessage({ ...payload, phone: '905000000000' }), e => e.code.endsWith('WAAPI_RECIPIENT_NOT_ALLOWED'));
  assert.equal(calls.length, 0);
});
test('format rejection occurs before readiness or provider POST', async t => {
  const { provider, calls } = fixture(t);
  await assert.rejects(provider.sendMessage({ phone: WAAPI_RECIPIENT, media: {
    fileName:'disguised.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('<html><script>synthetic</script></html>').toString('base64'),
  } }),e=>e.code==='WHATSAPP_CRM_MEDIA_FORMAT_INVALID'&&e.meta.transportAttempted===false);
  assert.equal(calls.length,0);
});
for (const response of [new Error('synthetic timeout'), { httpStatus: 429 }, { status: 'success', data: { status: 'error' } },
  { ...accepted, data: { ...accepted.data, instanceId: '104978' } }, { ...accepted, data: { ...accepted.data, data: { id: { ...accepted.data.data.id, remote: '905000000000@c.us' } } } }]) {
  test('WAAPI media failure is ambiguous and never automatically retried: ' + (response.httpStatus || response.message || JSON.stringify(response.data)), async t => {
    const { provider, calls } = fixture(t, response);
    await assert.rejects(provider.sendMessage({ phone: WAAPI_RECIPIENT, media: { dataUrl: 'data:application/pdf;base64,' + validMediaBytes('application/pdf').toString('base64'), fileName: 'a.pdf' } }), e => e.meta.transportAttempted === true);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
  });
}

for (const [mime, fileName] of [['audio/wav', 'sound.wav'], ['video/mp4', 'clip.mp4']]) {
  test('WAAPI ' + mime + ' cannot bypass media gate, recipient boundary or group exclusion', async t => {
    const { provider, calls } = fixture(t); const payload = { phone: WAAPI_RECIPIENT, media: {
      dataUrl: 'data:' + mime + ';base64,' + validMediaBytes(mime).toString('base64'), fileName,
    } };
    provider.config.outboundMediaEnabled = false;
    await assert.rejects(provider.sendMessage(payload), e => e.code.endsWith('WAAPI_PILOT_TEXT_ONLY'));
    provider.config.outboundMediaEnabled = true;
    await assert.rejects(provider.sendMessage({ ...payload, phone: '18880000001' }), e => e.code.endsWith('WAAPI_RECIPIENT_NOT_ALLOWED'));
    await assert.rejects(provider.sendMessage({ ...payload, remoteJid: '18880000001@g.us' }), e => e.code.endsWith('WAAPI_RECIPIENT_NOT_ALLOWED'));
    assert.equal(calls.length, 0);
  });
}

function pipelineFixture(t, mime, fileName, response) {
  const original = { whatsapp: { ...env.whatsapp }, waapi: { ...env.waapi } };
  t.after(() => { Object.assign(env.whatsapp, original.whatsapp); Object.assign(env.waapi, original.waapi); });
  Object.assign(env.whatsapp, { provider: 'waapi', sendEnabled: true, liveSendApproved: true, testNumberOnly: true, allowedTestNumbers: [WAAPI_RECIPIENT] });
  env.waapi.outboundMediaEnabled = true;
  const f = fixture(t, response); const records = new Map(); const journalEvents = []; let imports = 0;
  const command = work => work({ get: async key => records.get(key) || null, pttl: async () => -1,
    set: async (key, value, ...args) => { if (args.includes('NX') && records.has(key)) return null; records.set(key, value); return 'OK'; } });
  const bytes = validMediaBytes(mime);
  const payload = { phone: WAAPI_RECIPIENT, conversationId: '55', text: 'Synthetic media', actorId: 'offline-user', clientRequestId: 'SYNTHETIC-AV-REQUEST-001',
    media: { mimeType: mime, fileName, dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64') } };
  const dependencies = { provider: f.provider, attemptStore: createRedisOutboundAttemptStore(command),
    journal: { accept: async event => journalEvents.push(event) },
    bridge: { assertSafe: async () => {}, resolveConversation: async () => {}, sync: async () => { imports++; return { confirmed: true }; } },
    verifyDeliveryProof: async () => ({ confirmed: true, chatwootMessageId: '123' }) };
  return { ...f, payload, dependencies, bytes, journalEvents, command, imports: () => imports };
}
for (const [mime, fileName, type] of [['audio/wav', 'sound.wav', 'audio'], ['video/mp4', 'clip.mp4', 'video']]) {
  test('send pipeline ' + mime + ' retains native type and original bytes while repeat after store reconstruction never resends', async t => {
    const f = pipelineFixture(t, mime, fileName);
    const first = await sendCrmTextMessage(f.payload, f.dependencies);
    assert.equal(first.message.type, type); assert.equal(first.message.status, 'accepted');
    assert.deepEqual(Buffer.from(f.journalEvents[0].media.data, 'base64'), f.bytes);
    f.dependencies.attemptStore = createRedisOutboundAttemptStore(f.command);
    assert.equal((await sendCrmTextMessage(f.payload, f.dependencies)).duplicate, true);
    const changed = Buffer.from(f.bytes); changed[changed.length - 1] ^= 1;
    for (const media of [{ ...f.payload.media, asDocument: true }, { ...f.payload.media, dataUrl: 'data:' + mime + ';base64,' + changed.toString('base64') }]) {
      await assert.rejects(sendCrmTextMessage({ ...f.payload, media }, f.dependencies), e => e.code.endsWith('IDEMPOTENCY_CONFLICT'));
    }
    assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 1); assert.equal(f.journalEvents.length, 1); assert.equal(f.imports(), 1);
  });
  test('ambiguous ' + mime + ' pipeline remains locked after store reconstruction', async t => {
    const f = pipelineFixture(t, mime, fileName, new Error('synthetic lost response'));
    await assert.rejects(sendCrmTextMessage(f.payload, f.dependencies), e => e.code.endsWith('UNCONFIRMED_NO_RETRY'));
    f.dependencies.attemptStore = createRedisOutboundAttemptStore(f.command);
    await assert.rejects(sendCrmTextMessage(f.payload, f.dependencies), e => e.code.endsWith('UNCONFIRMED_NO_RETRY'));
    assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 1); assert.equal(f.journalEvents.length, 0); assert.equal(f.imports(), 0);
  });
}
