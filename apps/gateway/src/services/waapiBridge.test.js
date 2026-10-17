import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WaapiJournal, waapiJournal } from './waapiJournal.js';
import { WaapiChatwootBridge, waapiChatwootBridge, startWaapiWorker } from './waapiChatwootBridge.js';
import { env } from '../config/env.js';
import { WAAPI_INSTANCE } from '../providers/waapiProvider.js';
import { acceptWaapiWebhook, normalizeWaapiEvent, normalizeWaapiMedia } from './waapiWebhookService.js';
import { enrichWaapiReceipt } from './waapiReceiptService.js';
import { validMediaBytes } from '../utils/validMediaFixtures.js';

const config = { waapi: { bridgeEnabled: true }, chatwoot: { accountId: 2, inboxId: 1 } };
function envelope(fromMe = false, event = 'message') {
  return { instanceId: '105185', event, data: { message: { id: { fromMe, remote: '19999999999@c.us', _serialized: `${fromMe}_19999999999@c.us_TEST` }, fromMe,
    from: fromMe ? '905435195029@c.us' : '19999999999@c.us', to: fromMe ? '19999999999@c.us' : '905435195029@c.us', body: 'synthetic', type: 'chat' } } };
}
async function fixture(t, override) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'waapi-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = new WaapiJournal(dir); const messages = []; const writes = [];
  const request = async (url, options = {}) => {
    const overridden = override?.(url, options); if (overridden !== undefined) return overridden;
    if (url === '/inboxes/1') return { id: 1, channel_type: 'Channel::Api' };
    if (url === '/webhooks') return { payload: { webhooks: [] } };
    if (url === '/automation_rules') return { payload: [] };
    if (url === '/inboxes/1/agent_bot') return null;
    if (url === '/conversations/55') return { id: 55, inbox_id: 1, meta: { sender: { phone_number: '+19999999999' } } };
    if (url === '/conversations/55/messages' && options.method === 'POST') {
      writes.push(options); const m = { id: 123, ...options.body }; messages.push(m); return m;
    }
    if (url.startsWith('/conversations/55/messages')) return { payload: messages };
    throw new Error(`Unexpected synthetic path ${url}`);
  };
  return { journal, writes, bridge: new WaapiChatwootBridge({ request, journal, config }), request, dir };
}
test('WAAPI event directions use fromMe and reject wrong instance', () => {
  assert.equal(normalizeWaapiEvent(envelope(false)).direction, 'incoming');
  assert.equal(normalizeWaapiEvent(envelope(true, 'message_create')).direction, 'outgoing');
  assert.throws(() => normalizeWaapiEvent({ ...envelope(), instanceId: '1' }), /INSTANCE_MISMATCH/);
  assert.throws(() => normalizeWaapiEvent({ ...envelope(), instanceId: '104978' }), /INSTANCE_MISMATCH/);
});
test('WAAPI ignores group, status, broadcast and nontrial recipient in TEST scope', () => {
  for (const patch of [{ from: '1@g.us' }, { isStatus: true }, { broadcast: true }, { from: '905000000000@c.us', id: { fromMe: false, remote: '905000000000@c.us', _serialized: 'false_905000000000@c.us_TEST' } }]) {
    const body = envelope(); Object.assign(body.data.message, patch); assert.equal(normalizeWaapiEvent(body, { incomingTestOnly: true }).event, 'ignored');
  }
});
test('WAAPI journals before ack; duplicate event stays one durable record after reopen', async t => {
  const f = await fixture(t); const body = envelope();
  assert.equal((await acceptWaapiWebhook(body, { journal: f.journal })).duplicate, false);
  assert.equal((await acceptWaapiWebhook(body, { journal: new WaapiJournal(f.dir) })).duplicate, true);
  assert.equal((await f.journal.pending()).length, 1);
  await assert.rejects(acceptWaapiWebhook(body, { journal: { accept: async () => { throw new Error('disk full'); } } }), /disk full/);
});
test('WAAPI same message across events imports once, including after restart', async t => {
  const f = await fixture(t); const event = normalizeWaapiEvent(envelope(true));
  await f.bridge.sync(event, 55);
  const restarted = new WaapiChatwootBridge({ request: f.request, journal: new WaapiJournal(f.dir), config });
  await restarted.sync({ ...event, event: 'message_create' }, 55);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].body.message_type, 'outgoing');
  assert.equal(f.writes[0].body.source_id, event.providerMessageId);
});
test('WAAPI blocks Chatwoot echo path, account hook, automation and bot before write', async t => {
  const cases = [ ['/inboxes/1', { id: 1, channel_type: 'Channel::Api', webhook_url: 'https://old-provider.invalid' }],
    ['/webhooks', { payload: { webhooks: [{ id: 1 }] } }], ['/automation_rules', { payload: [{ active: true }] }],
    ['/inboxes/1/agent_bot', { agent_bot: { id: 1 } }] ];
  for (const [target, result] of cases) {
    const f = await fixture(t, url => url === target ? result : undefined);
    await assert.rejects(f.bridge.sync(normalizeWaapiEvent(envelope(true)), 55)); assert.equal(f.writes.length, 0);
  }
});
test('WAAPI ambiguous Chatwoot write is never posted again', async t => {
  let posts = 0;
  const f = await fixture(t, (url, o) => {
    if (o.method === 'POST') { posts++; return Promise.reject(new Error('timeout')); }
  });
  const event = normalizeWaapiEvent(envelope(true));
  await assert.rejects(f.bridge.sync(event, 55)); await assert.rejects(f.bridge.sync(event, 55), /IMPORT_UNCONFIRMED/);
  assert.equal(posts, 1);
});
test('WAAPI preserves inline photo, audio, video and document attachments', async t => {
  for (const mime of ['image/jpeg', 'audio/ogg; codecs=opus', 'video/mp4', 'application/pdf']) {
    const f = await fixture(t); const body = envelope(); body.data.message.hasMedia = true;
    body.data.media = { mimetype: mime, data: validMediaBytes(mime.split(';')[0]).toString('base64'), filename: '../sample' };
    const event = normalizeWaapiEvent(body); await f.bridge.sync(event, 55);
    assert.equal(f.writes[0].media.mimeType, mime.split(';')[0]); assert(!f.writes[0].media.fileName.includes('/'));
  }
});
test('WAAPI rejects URL-only, invalid base64, oversized and executable media', () => {
  for (const input of [{ url: 'http://127.0.0.1/secret' }, { mimetype: 'text/html', data: 'YQ==' }, { mimetype: 'image/jpeg', data: 'invalid' }, { mimetype: 'image/jpeg', data: 'A'.repeat(13981020) }]) assert.throws(() => normalizeWaapiMedia(input), /MEDIA_REJECTED/);
});
test('WAAPI receipt ACK is monotonic and independent of import success', async t => {
  const f = await fixture(t); const event = { ...normalizeWaapiEvent(envelope(true, 'message_ack')), ack: 3 };
  await f.bridge.process(event); await f.bridge.process({ ...event, ack: 1 });
  assert.equal((await f.journal.get('state', f.journal.key(`ack:${event.providerMessageId}`))).ack, 3);
  assert.equal(f.writes.length, 0);
  const source = { source_id: event.providerMessageId, status: 'read', content_attributes: { provider: 'waapi' } };
  assert.equal((await enrichWaapiReceipt({ direction: 'outgoing' }, source, f.journal)).status, 'read');
  assert.equal((await enrichWaapiReceipt({ direction: 'outgoing' }, { ...source, source_id: 'no-ack-evidence' }, f.journal)).status, 'accepted');
});

test('WAAPI incoming LID is durably normalizable but never treated as a phone', () => {
  const body = envelope(); const lid = '22252259123221@lid';
  Object.assign(body.data.message, { from: lid, id: { fromMe: false, remote: lid, _serialized: `false_${lid}_TEST` } });
  assert.equal(normalizeWaapiEvent(body, {}).phone, null);
  assert.equal(normalizeWaapiEvent(body, { verifiedRecipientLid: '99999999999999@lid' }).phone, null);
  const event = normalizeWaapiEvent(body, { verifiedRecipientLid: lid });
  assert.equal(event.phone, null); assert.equal(event.peerJid, lid); assert.equal(event.direction, 'incoming');
  assert.equal(event.providerMessageId, `false_${lid}_TEST`);
  body.data.message.id.remote = '19999999999@c.us';
  assert.throws(() => normalizeWaapiEvent(body, { verifiedRecipientLid: lid }), /EVENT_INVALID/);
});

test('WAAPI rejects old-instance webhooks before any durable write or cache invalidation', async () => {
  let writes = 0; let invalidations = 0;
  await assert.rejects(acceptWaapiWebhook({ ...envelope(), instanceId: '104978' }, {
    journal: { accept: async () => { writes++; } },
    provider: { invalidate: () => { invalidations++; } },
  }), /INSTANCE_MISMATCH/);
  assert.equal(writes, 0); assert.equal(invalidations, 0);
});

test('WAAPI filters old history before the batch limit and leaves every file unchanged', async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 101; i++) {
    await f.journal.put('events', i.toString(16).padStart(64, '0'), {
      event: { instanceId: '104978', event: 'message_ack', providerMessageId: `old-${i}`, ack: 3 }, done: false,
    });
  }
  const activeKey = 'f'.repeat(64);
  await f.journal.put('events', activeKey, {
    event: { instanceId: 105185, event: 'message', providerMessageId: 'new-instance-message' }, done: false,
  });
  await f.journal.put('events', '0'.repeat(64), { event: {}, done: false });
  const eventsDir = path.join(f.dir, 'events');
  const snapshot = async () => {
    const names = (await readdir(eventsDir)).sort();
    return Promise.all(names.map(async name => [name, await readFile(path.join(eventsDir, name), 'utf8')]));
  };
  const before = await snapshot();
  const batch = await new WaapiJournal(f.dir).pending(WAAPI_INSTANCE);
  assert.equal(batch.length, 1); assert.equal(batch[0].key, activeKey);
  assert.equal((await f.journal.pending('104978')).length, 100);
  assert.deepEqual(await snapshot(), before);
});

test('WAAPI active-instance filtering preserves batch, completion and retry boundaries', async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 101; i++) {
    await f.journal.put('events', i.toString(16).padStart(64, '0'), {
      event: { instanceId: WAAPI_INSTANCE, event: 'message_ack', providerMessageId: `active-${i}` }, done: false,
    });
  }
  await f.journal.put('events', 'd'.repeat(64), {
    event: { instanceId: WAAPI_INSTANCE, providerMessageId: 'completed' }, done: true,
  });
  await f.journal.put('events', 'e'.repeat(64), {
    event: { instanceId: WAAPI_INSTANCE, providerMessageId: 'future' }, done: false,
    retryAt: new Date(Date.now() + 600000).toISOString(),
  });
  const batch = await f.journal.pending(WAAPI_INSTANCE);
  assert.equal(batch.length, 100);
  assert(batch.every(item => item.event.providerMessageId.startsWith('active-')));
});

test('WAAPI worker requests the active instance and never processes or updates old records', async t => {
  const originals = {
    provider: env.whatsapp.provider, bridgeEnabled: env.waapi.bridgeEnabled,
    pending: waapiJournal.pending, put: waapiJournal.put, update: waapiJournal.update, process: waapiChatwootBridge.process,
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
  };
  t.after(() => {
    env.whatsapp.provider = originals.provider; env.waapi.bridgeEnabled = originals.bridgeEnabled;
    waapiJournal.pending = originals.pending; waapiJournal.put = originals.put;
    waapiJournal.update = originals.update;
    waapiChatwootBridge.process = originals.process;
    globalThis.setInterval = originals.setInterval; globalThis.clearInterval = originals.clearInterval;
  });
  env.whatsapp.provider = 'waapi'; env.waapi.bridgeEnabled = true;
  let tick; const processed = []; const updated = [];
  globalThis.setInterval = (callback, delay) => { assert.equal(delay, 5000); tick = callback; return { unref() {} }; };
  globalThis.clearInterval = () => {};
  waapiJournal.pending = async instance => {
    assert.equal(instance, '105185');
    return [
      ...['message', 'message_create', 'message_ack'].map(event => ({ key: `old-${event}`, event: { instanceId: '104978', event, providerMessageId: event } })),
      { key: 'missing-instance', event: { event: 'message_ack', providerMessageId: 'missing' } },
      { key: 'active', event: { instanceId: '105185', event: 'message_ack', providerMessageId: 'active' } },
    ];
  };
  waapiChatwootBridge.process = async event => { processed.push(event); };
  waapiJournal.put = async (group, key, value) => { updated.push({ group, key, value }); };
  waapiJournal.update = async (group, key, change) => waapiJournal.put(group, key, change({ event: { instanceId: WAAPI_INSTANCE } }));
  const stop = startWaapiWorker();
  await tick(); stop();
  assert.deepEqual(processed.map(event => event.instanceId), ['105185']);
  assert.deepEqual(updated.map(item => [item.group, item.key, item.value.done]), [['events', 'active', true]]);
});
