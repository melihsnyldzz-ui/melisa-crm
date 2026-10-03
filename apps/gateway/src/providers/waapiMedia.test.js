import test from 'node:test';
import assert from 'node:assert/strict';
import { WaapiProvider, WAAPI_INSTANCE, WAAPI_RECIPIENT } from './waapiProvider.js';
import { validMediaBytes } from '../utils/validMediaFixtures.js';
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
for (const [mime, name, asDocument, type] of [['image/png','photo.png',false,'image'], ['image/png','original.png',true,'file'], ['application/pdf','sample.pdf',true,'file'], ['text/plain','sample.txt',true,'file']]) {
  test('WAAPI media exact single POST contract: ' + name, async t => {
    const { provider, calls } = fixture(t); const bytes = validMediaBytes(mime);
    const result = await provider.sendMessage({ phone: WAAPI_RECIPIENT, text: 'synthetic caption', media: {
      mimeType: mime, fileName: name, dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64'), asDocument } });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://waapi.app/api/v1/instances/105185/client/action/send-media');
    assert.deepEqual(JSON.parse(calls[1].options.body), { chatId: '19999999999@c.us', mediaBase64: bytes.toString('base64'),
      mediaName: name, mediaCaption: 'synthetic caption', asDocument, firedandforget: false });
    assert.equal(result.messageType, type); assert.equal(result.status, 'accepted');
    assert.equal(result.delivered, false); assert.equal(result.read, false);
    assert.equal(result.media.quality, asDocument ? 'original-file-requested' : 'provider-image-processing');
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
