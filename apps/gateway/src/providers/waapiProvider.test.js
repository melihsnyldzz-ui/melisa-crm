import test from 'node:test';
import assert from 'node:assert/strict';
import { WaapiProvider, WAAPI_INSTANCE, WAAPI_RECIPIENT } from './waapiProvider.js';
import { env } from '../config/env.js';

const config = { apiToken: 'fake-test-token', instanceId: '105185', timeoutMs: 20 };
const ready = { status: 'success', clientStatus: { status: 'success', instanceId: '105185', instanceStatus: 'ready' } };
const sent = { status: 'success', data: { status: 'success', instanceId: '105185', data: { _data: { id: { _serialized: 'true_19999999999@c.us_TEST', fromMe: true, remote: '19999999999@c.us' } } } } };
const payload = { phone: WAAPI_RECIPIENT, text: 'synthetic test' };
function setup(action = sent, state = ready) {
  const calls = []; const provider = new WaapiProvider({ config, fetchFn: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/status')) return { ok: true, json: async () => state };
    if (action instanceof Error) throw action;
    return action?.http ? { ok: false, status: action.http } : { ok: true, json: async () => action };
  } });
  return { calls, provider };
}
test('WAAPI only sends after nested ready and validates message identity', async () => {
  const { provider, calls } = setup(); const r = await provider.sendMessage(payload);
  assert.equal(r.providerAccepted, true); assert.equal(r.delivered, false);
  assert.equal(calls.length, 2); assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[0].url, 'https://waapi.app/api/v1/instances/105185/client/status');
  assert.equal(calls[1].url, 'https://waapi.app/api/v1/instances/105185/client/action/send-message');
  assert.deepEqual(JSON.parse(calls[1].options.body), { chatId: `${WAAPI_RECIPIENT}@c.us`, message: payload.text });
});
for (const state of ['disconnected', 'authenticated', 'qr', 'auth_failure']) {
  test(`WAAPI ${state} prevents send POST`, async () => {
    const { provider, calls } = setup(sent, { ...ready, clientStatus: { ...ready.clientStatus, instanceStatus: state } });
    await assert.rejects(provider.sendMessage(payload), /WAAPI_NOT_READY/); assert.equal(calls.length, 1);
  });
}
test('WAAPI does not treat HTTP 200 nested error as success', async () => {
  const { provider } = setup({ status: 'success', data: { status: 'error', message: 'sensitive upstream body' } });
  await assert.rejects(provider.sendMessage(payload), e => e.meta.transportAttempted && !e.message.includes('sensitive'));
});
test('WAAPI missing provider id and wrong instance fail ambiguous', async () => {
  for (const action of [{ status: 'success', data: { status: 'success', instanceId: '105185', data: {} } }, { ...sent, data: { ...sent.data, instanceId: 'OTHER' } }, { ...sent, data: { ...sent.data, instanceId: '104978' } }]) {
    await assert.rejects(setup(action).provider.sendMessage(payload), e => e.meta.transportAttempted === true);
  }
});
for (const action of [new Error('timeout with secret'), { http: 500 }, { http: 429 }]) {
  test(`WAAPI never retries transport failure ${action.http || 'timeout'}`, async () => {
    const { provider, calls } = setup(action);
    await assert.rejects(provider.sendMessage(payload), e => e.meta.transportAttempted === true);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
  });
}
test('WAAPI rejects other recipient, groups and outgoing media before network', async () => {
  const { provider, calls } = setup();
  for (const input of [{ ...payload, phone: '905000000000' }, { ...payload, remoteJid: '123@g.us' }, { ...payload, media: {} }]) await assert.rejects(provider.sendMessage(input));
  assert.equal(calls.length, 0);
});
test('WAAPI cached ready expires, failures replace stale readiness and concurrent reads coalesce', async () => {
  let now = 0; let count = 0;
  const provider = new WaapiProvider({ config, now: () => now, fetchFn: async () => {
    count++; if (count > 1) throw new Error('offline'); return { ok: true, json: async () => ready };
  } });
  const statuses = await Promise.all(Array.from({ length: 30 }, () => provider.getStatus()));
  assert(statuses.every(s => s.providerConnected)); assert.equal(count, 1);
  now = 60001; assert.equal((await provider.getStatus()).providerConnected, false);
  assert.equal((await provider.getStatus()).providerConnected, false); assert.equal(count, 2);
});
test('WAAPI missing token and old or wrong configured instance make no network request', async () => {
  for (const c of [{ ...config, apiToken: '' }, { ...config, instanceId: '104978' }, { ...config, instanceId: '42' }]) {
    const p = new WaapiProvider({ config: c, fetchFn: () => assert.fail('network') });
    const status = await p.getStatus();
    assert.equal(status.providerConnected, false);
    assert.equal(status.reason, 'WHATSAPP_CRM_WAAPI_NOT_CONFIGURED');
  }
});

test('WAAPI new instance is pinned and the empty-config default matches it', () => {
  assert.equal(WAAPI_INSTANCE, '105185');
  assert.equal(env.waapi.instanceId, '105185');
});

test('WAAPI old-instance ready response cannot authorize a send', async () => {
  const { provider, calls } = setup(sent, { ...ready, clientStatus: { ...ready.clientStatus, instanceId: '104978' } });
  await assert.rejects(provider.sendMessage(payload), /WAAPI_NOT_READY/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
});

test('WAAPI disconnect invalidates an in-flight ready result', async () => {
  let resolve;
  const p = new WaapiProvider({ config, fetchFn: () => new Promise(r => { resolve = r; }) });
  const pending = p.getStatus(); p.invalidate();
  resolve({ ok: true, json: async () => ready });
  assert.equal((await pending).providerConnected, false); assert.equal(p.connected(), false);
});

const incomingLid = '22252259123221@lid';
const mappedIncoming = { status: 'success', data: { status: 'success', instanceId: '105185',
  data: { contacts: [{ lid: incomingLid, pn: '19999999999@c.us' }], count: 1 } } };

test('WAAPI resolves direct phones without lookup; linked IDs require the instance-owned mapping', async () => {
  const { provider, calls } = setup(mappedIncoming);
  assert.equal(await provider.resolveIncomingPhone('19999999999@c.us'), '19999999999');
  assert.equal(calls.length, 0);
  assert.equal(await provider.resolveIncomingPhone(incomingLid), '19999999999');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://waapi.app/api/v1/instances/105185/client/action/get-lid');
  assert.deepEqual(JSON.parse(calls[0].options.body), { contactIds: [incomingLid] });
  assert(!calls.some(call => /send-/.test(call.url)));
});

test('WAAPI rejects unconfirmed, ambiguous, conflicting and invalid inbound mapping responses', async () => {
  const response = (contacts, patch = {}) => ({ ...mappedIncoming,
    data: { ...mappedIncoming.data, data: { contacts, count: contacts.length }, ...patch } });
  for (const action of [null, { status: 'error' }, { ...mappedIncoming, status: 'error' },
    response(mappedIncoming.data.data.contacts, { status: 'error' }),
    response(mappedIncoming.data.data.contacts, { instanceId: '104978' }), response([]),
    response([...mappedIncoming.data.data.contacts, ...mappedIncoming.data.data.contacts]),
    response([{ lid: '99999999999999@lid', pn: '19999999999@c.us' }]),
    response([{ lid: incomingLid, pn: '22252259123221@lid' }]),
    response([{ lid: incomingLid, pn: '123@g.us' }]),
    response([{ lid: incomingLid, pn: '09999999999@c.us' }]),
    { ...mappedIncoming, data: { ...mappedIncoming.data, data: { ...mappedIncoming.data.data, count: 2 } } }]) {
    const { provider, calls } = setup(action);
    await assert.rejects(provider.resolveIncomingPhone(incomingLid), /INCOMING_IDENTITY_UNCONFIRMED/);
    await assert.rejects(provider.resolveIncomingPhone(incomingLid), /INCOMING_IDENTITY_UNCONFIRMED/);
    assert.equal(calls.length, 2); // A failed lookup is never cached.
  }
  const { provider, calls } = setup(mappedIncoming);
  for (const jid of ['status@broadcast', '12345678900@g.us', '12345678900@newsletter',
    '123456@c.us', '09999999999@c.us', '22252259123221@lid/other', null, 12345]) {
    await assert.rejects(provider.resolveIncomingPhone(jid), /INCOMING_IDENTITY_INVALID/);
  }
  assert.equal(calls.length, 0);
});

test('WAAPI coalesces inbound mapping lookups and expires its bounded cache', async () => {
  let now = 0, count = 0;
  const provider = new WaapiProvider({ config, now: () => now, fetchFn: async () => {
    count++; return { ok: true, json: async () => mappedIncoming };
  } });
  const result = await Promise.all(Array.from({ length: 8 }, () => provider.resolveIncomingPhone(incomingLid)));
  assert(result.every(phone => phone === '19999999999')); assert.equal(count, 1);
  now = 599999; await provider.resolveIncomingPhone(incomingLid); assert.equal(count, 1);
  now = 600000; await provider.resolveIncomingPhone(incomingLid); assert.equal(count, 2);
});
