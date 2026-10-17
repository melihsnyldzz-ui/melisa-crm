import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WAAPI_RECIPIENT } from '../providers/waapiProvider.js';
import { WaapiJournal } from './waapiJournal.js';
import { WaapiChatwootBridge, createWaapiWorker } from './waapiChatwootBridge.js';
import { normalizeWaapiEvent, acceptWaapiWebhook } from './waapiWebhookService.js';
import { resolveWaapiInboundIdentity } from './waapiInboundIdentityService.js';

const peerA = '18880000001';
const peerB = '18880000002';
const lid = '77777777777777@lid';
const general = { waapi: { bridgeEnabled: true, incomingTestOnly: false }, chatwoot: { accountId: 2, inboxId: 1 } };
function envelope(peer, token = 'SYNTHETIC', fromMe = false, event = 'message') {
  return { instanceId: '105185', event, data: { message: { fromMe,
    id: { fromMe, remote: peer, _serialized: `${fromMe}_${peer}_${token}` },
    from: fromMe ? '18880000003@c.us' : peer, to: fromMe ? peer : '18880000003@c.us', body: token, type: 'chat' } } };
}
async function fixture(t, provider, config = general) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'crm-inbound-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const journal = new WaapiJournal(root); const contacts = []; const conversations = []; const messages = []; const writes = [];
  const request = async (url, options = {}) => {
    if (url === '/inboxes/1') return { id: 1, channel_type: 'Channel::Api' };
    if (url === '/webhooks') return { payload: { webhooks: [] } };
    if (url === '/automation_rules') return { payload: [] };
    if (url === '/inboxes/1/agent_bot') return null;
    if (options.method === 'POST') {
      writes.push({ url, body: options.body });
      if (url === '/contacts') {
        const contact = { id: contacts.length + 101, ...options.body }; contacts.push(contact); return { payload: { contact } };
      }
      if (url === '/conversations') {
        const contact = contacts.find(c => c.id === options.body.contact_id);
        const conversation = { id: conversations.length + 201, ...options.body, meta: { sender: { phone_number: contact.phone_number } } };
        conversations.push(conversation); return conversation;
      }
      const match = url.match(/^\/conversations\/(\d+)\/messages$/);
      if (match) { const message = { id: messages.length + 301, conversation_id: Number(match[1]), ...options.body }; messages.push(message); return message; }
    }
    if (url.startsWith('/contacts/search?q=')) {
      const params = new URLSearchParams(url.split('?')[1]); const page = Number(params.get('page') || 1);
      const found = contacts.filter(c => c.phone_number === '+' + params.get('q'));
      return { payload: found.slice((page - 1) * 15, page * 15), meta: { count: found.length, current_page: page } };
    }
    let match = url.match(/^\/contacts\/(\d+)\/conversations$/);
    if (match) return { payload: conversations.filter(c => c.contact_id === Number(match[1])) };
    match = url.match(/^\/conversations\/(\d+)$/);
    if (match) return conversations.find(c => c.id === Number(match[1]));
    match = url.match(/^\/conversations\/(\d+)\/messages(?:\?before=(\d+))?$/);
    if (match) return { payload: messages.filter(m => m.conversation_id === Number(match[1]) && (!match[2] || m.id < Number(match[2]))) };
    throw new Error('Unexpected synthetic Chatwoot path');
  };
  const bridge = new WaapiChatwootBridge({ journal, request, provider, config });
  return { root, journal, bridge, request, contacts, conversations, messages, writes };
}
test('two real-shaped synthetic incoming phones remain distinct across duplicate events and restart', async t => {
  const f = await fixture(t);
  for (const phone of [peerA, peerB]) {
    const event = normalizeWaapiEvent(envelope(phone + '@c.us', 'message-' + phone));
    await f.bridge.sync(event);
    await new WaapiChatwootBridge({ request: f.request, journal: new WaapiJournal(f.root), config: general }).sync({ ...event, event: 'message_create' });
  }
  assert.equal(f.contacts.length, 2); assert.equal(f.conversations.length, 2); assert.equal(f.messages.length, 2);
  assert.deepEqual(f.contacts.map(c => c.phone_number), ['+' + peerA, '+' + peerB]);
  assert.deepEqual(f.messages.map(m => m.conversation_id), [201, 202]);
  assert(f.messages.every(m => m.message_type === 'incoming'));
  assert(f.conversations.every(c => c.assignee_id === null && c.team_id === null));
});
test('opaque LID is journaled before lookup and worker retries failure without creating the wrong customer', async t => {
  let ready = false; let lookups = 0;
  const provider = { resolveIncomingPhone: async value => { assert.equal(value, lid); lookups++; if (!ready) throw Error('synthetic unavailable'); return peerB; } };
  const f = await fixture(t, provider); const body = envelope(lid);
  await acceptWaapiWebhook(body, { journal: f.journal, provider });
  assert.equal(lookups, 0); assert.equal((await f.journal.pending('105185'))[0].event.phone, null);
  let tick;
  const stop = createWaapiWorker({ journal: f.journal, bridge: f.bridge, config: { ...general, whatsapp: { provider: 'waapi' } },
    setIntervalFn: callback => { tick = callback; return { unref() {} }; }, clearIntervalFn() {} });
  await tick(); assert.equal(f.writes.length, 0);
  const key = f.journal.key('105185:message:false_' + lid + '_SYNTHETIC:');
  assert.equal((await f.journal.get('events', key)).done, false);
  ready = true;
  await f.journal.update('events', key, item => ({ ...item, retryAt: null }));
  await tick(); stop();
  assert.equal((await f.journal.get('events', key)).done, true);
  assert.equal(f.contacts[0].phone_number, '+' + peerB); assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].source_id, 'false_' + lid + '_SYNTHETIC');
});
test('TEST incoming scope cannot import another phone through direct identity, LID or an explicit conversation', async t => {
  const config = { ...general, waapi: { ...general.waapi, incomingTestOnly: true } };
  const f = await fixture(t, { resolveIncomingPhone: async () => peerB }, config);
  assert.equal(normalizeWaapiEvent(envelope(peerA + '@c.us'), config.waapi).event, 'ignored');
  await assert.rejects(f.bridge.sync(normalizeWaapiEvent(envelope(lid)), 55), /RECIPIENT_NOT_ALLOWED/);
  await assert.rejects(f.bridge.sync({ direction: 'incoming', phone: peerA }, 55), /IDENTITY_UNCONFIRMED/);
  assert.equal(f.writes.length, 0);
  const verified = await resolveWaapiInboundIdentity(normalizeWaapiEvent(envelope(lid)), {
    provider: { resolveIncomingPhone: async () => WAAPI_RECIPIENT }, config: config.waapi,
  });
  assert.equal(verified.phone, WAAPI_RECIPIENT);
});
test('TEST webhook ignores unknown linked peers before the durable journal and accepts only its provisioned peer', async () => {
  const config = { incomingTestOnly: true, verifiedRecipientLid: lid }; let writes = 0;
  const journal = { accept: async event => { writes++; assert.equal(event.peerJid, lid); assert.equal(event.phone, null); return { accepted: true }; } };
  assert.equal((await acceptWaapiWebhook(envelope('66666666666666@lid'), { config, journal })).ignored, true);
  assert.equal(writes, 0);
  assert.equal((await acceptWaapiWebhook(envelope(lid), { config, journal })).accepted, true);
  assert.equal(writes, 1);
});
test('contradictory from/raw/id and serialized identity fail before journaling', async () => {
  const patches = [ m => { m._data = { from: peerB + '@c.us' }; }, m => { m._data = { fromMe: true }; },
    m => { m.id.remote = peerB + '@c.us'; }, m => { m.id._serialized = 'false_' + peerB + '@c.us_WRONG'; },
    m => { m.id.fromMe = true; }, m => { m._data = { id: { _serialized: 'another-id' } }; } ];
  for (const patch of patches) {
    const body = envelope(peerA + '@c.us'); patch(body.data.message); let writes = 0;
    await assert.rejects(acceptWaapiWebhook(body, { journal: { accept: async () => { writes++; } } }), /EVENT_INVALID/);
    assert.equal(writes, 0);
  }
});
test('group/status/broadcast and all nontrial outgoing echoes and ACKs stay outside the journal', async () => {
  const bodies = [envelope('18880000001@g.us'), envelope('status@broadcast'), envelope('18880000001@newsletter'),
    envelope(peerA + '@c.us', 'SYNTHETIC', true, 'message_create'), envelope(peerA + '@c.us', 'SYNTHETIC', true, 'message_ack')];
  const broadcast = envelope(peerA + '@c.us'); broadcast.data.message._data = { broadcast: true }; bodies.push(broadcast);
  let writes = 0;
  for (const body of bodies) assert.equal((await acceptWaapiWebhook(body, { journal: { accept: async () => { writes++; } } })).ignored, true);
  assert.equal(writes, 0);
});
test('resolved LID cannot overwrite a conflicting phone or import into another contact conversation', async t => {
  const f = await fixture(t, { resolveIncomingPhone: async () => peerB });
  await f.bridge.sync(normalizeWaapiEvent(envelope(peerA + '@c.us')));
  const count = f.writes.length;
  await assert.rejects(f.bridge.sync({ ...normalizeWaapiEvent(envelope(lid)), phone: peerA }), /IDENTITY_CONFLICT/);
  await assert.rejects(f.bridge.sync(normalizeWaapiEvent(envelope(lid)), f.conversations[0].id), /CONVERSATION_MISMATCH/);
  assert.equal(f.writes.length, count);
});
test('durable message proof is bound to its original phone and conversation', async t => {
  const f = await fixture(t); const event = normalizeWaapiEvent(envelope(peerA + '@c.us'));
  await f.bridge.sync(event);
  f.conversations.push({ ...f.conversations[0], id: 299 });
  const count = f.writes.length;
  await assert.rejects(f.bridge.sync(event, 299), /SCOPE_CONFLICT/);
  assert.equal(f.writes.length, count);
});
test('a changed cached contact cannot create a conversation for its former phone', async t => {
  const f = await fixture(t); const event = normalizeWaapiEvent(envelope(peerA + '@c.us'));
  await f.bridge.sync(event);
  f.contacts[0].phone_number = '+' + peerB;
  const count = f.writes.length;
  await assert.rejects(f.bridge.sync(normalizeWaapiEvent(envelope(peerA + '@c.us', 'NEXT'))), /CONTACT_AMBIGUOUS/);
  assert.equal(f.writes.length, count);
});
test('a new incoming message selects a new active thread after closure while duplicates keep their original scope', async t => {
  const f = await fixture(t); const first = normalizeWaapiEvent(envelope(peerA + '@c.us', 'FIRST'));
  await f.bridge.sync(first); f.conversations[0].status = 'resolved';
  await new WaapiChatwootBridge({ request: f.request, journal: new WaapiJournal(f.root), config: general }).sync(first);
  assert.equal(f.conversations.length, 1); assert.equal(f.messages.length, 1);
  await f.bridge.sync(normalizeWaapiEvent(envelope(peerA + '@c.us', 'SECOND')));
  assert.equal(f.conversations.length, 2); assert.equal(f.conversations[1].status, 'open');
  assert.deepEqual(f.messages.map(m => m.conversation_id), [201, 202]);
  await assert.rejects(f.bridge.sync(normalizeWaapiEvent(envelope(peerA + '@c.us', 'THIRD')), 201), /CONVERSATION_RESOLVED/);
  assert.equal(f.messages.length, 2);
});
test('lost new-conversation response after closure is reconciled without a second create POST', async t => {
  const f = await fixture(t); await f.bridge.sync(normalizeWaapiEvent(envelope(peerA + '@c.us', 'FIRST')));
  f.conversations[0].status = 'resolved'; let creates = 0;
  const request = async (url, options = {}) => {
    if (url === '/conversations' && options.method === 'POST') {
      creates++; await f.request(url, options); throw Error('synthetic lost create response');
    }
    return f.request(url, options);
  };
  const next = normalizeWaapiEvent(envelope(peerA + '@c.us', 'SECOND'));
  await assert.rejects(new WaapiChatwootBridge({ request, journal: f.journal, config: general }).sync(next));
  await new WaapiChatwootBridge({ request, journal: new WaapiJournal(f.root), config: general }).sync(next);
  assert.equal(creates, 1); assert.equal(f.conversations.length, 2);
  assert.deepEqual(f.messages.map(m => m.conversation_id), [201, 202]);
});
const relatedContacts = (offset = 0, count = 15) => Array.from({ length: count }, (_, i) => ({
  id: offset + i + 1, name: `Related ${peerA}`, phone_number: '+18889999999',
}));
test('paginated contact search finds the exact phone beyond a full page of related names before any create', async t => {
  const f = await fixture(t); f.contacts.push({ id: 101, phone_number: '+' + peerA }); const pages = [];
  const request = async (url, options) => {
    if (url.startsWith('/contacts/search?')) {
      const page = Number(new URLSearchParams(url.split('?')[1]).get('page')); pages.push(page);
      return { payload: page === 1 ? relatedContacts() : [f.contacts[0]], meta: { count: 16, current_page: String(page), page, has_more: page === 1 } };
    }
    return f.request(url, options);
  };
  await new WaapiChatwootBridge({ request, journal: f.journal, config: general }).sync(normalizeWaapiEvent(envelope(peerA + '@c.us')));
  assert.deepEqual(pages, [1, 2, 1, 2]);
  assert.equal(f.contacts.length, 1); assert.equal(f.messages.length, 1);
  assert.equal(f.writes.filter(w => w.url === '/contacts').length, 0);
});
test('contact search reads a full page without metadata through its terminal page', async t => {
  const f = await fixture(t); f.contacts.push({ id: 101, phone_number: '+' + peerA }); const pages = [];
  const request = async (url, options) => {
    if (url.startsWith('/contacts/search?')) {
      const page = Number(new URLSearchParams(url.split('?')[1]).get('page')); pages.push(page);
      return { payload: page === 1 ? [...relatedContacts(0, 14), f.contacts[0]] : [] };
    }
    return f.request(url, options);
  };
  await new WaapiChatwootBridge({ request, journal: f.journal, config: general }).sync(normalizeWaapiEvent(envelope(peerA + '@c.us')));
  assert.deepEqual(pages, [1, 2, 1, 2]); assert.equal(f.contacts.length, 1); assert.equal(f.messages.length, 1);
});
test('a second exact-phone contact on another search page blocks every Chatwoot POST', async t => {
  const f = await fixture(t);
  const request = async (url, options) => {
    if (url.startsWith('/contacts/search?')) {
      const page = Number(new URLSearchParams(url.split('?')[1]).get('page'));
      return { payload: page === 1 ? [...relatedContacts(0, 14), { id: 101, phone_number: '+' + peerA }] : [{ id: 102, phone_number: '+' + peerA }],
        meta: { count: 16, page } };
    }
    return f.request(url, options);
  };
  await assert.rejects(new WaapiChatwootBridge({ request, journal: f.journal, config: general }).sync(normalizeWaapiEvent(envelope(peerA + '@c.us'))), /CONTACT_AMBIGUOUS/);
  assert.equal(f.writes.length, 0);
});
test('failed, repeated, truncated or inconsistent search pages cannot prove contact absence', async t => {
  const cases = [
    page => { if (page === 2) throw Error('synthetic search page unavailable'); return { payload: relatedContacts() }; },
    () => ({ payload: relatedContacts() }),
    page => ({ payload: relatedContacts((page - 1) * 15), meta: { count: 30, current_page: 1 } }),
    page => ({ payload: page === 1 ? relatedContacts() : [], meta: { count: 16, current_page: page } }),
    page => ({ payload: page === 1 ? relatedContacts() : relatedContacts(15, 1), meta: { count: page === 1 ? 16 : 17, current_page: page } }),
    () => ({ payload: [], meta: {} }),
    () => ({ payload: [], meta: { count: 0, current_page: '1.0' } }),
    () => ({ payload: [], meta: { count: 0, current_page: '1x' } }),
    () => ({ payload: [], meta: { count: 0, current_page: '1', page: '2' } }),
    () => ({ payload: [], meta: { count: 0, current_page: '1', has_more: true } }),
  ];
  for (const response of cases) {
    const f = await fixture(t);
    const request = async (url, options) => url.startsWith('/contacts/search?')
      ? response(Number(new URLSearchParams(url.split('?')[1]).get('page'))) : f.request(url, options);
    await assert.rejects(new WaapiChatwootBridge({ request, journal: f.journal, config: general }).sync(normalizeWaapiEvent(envelope(peerA + '@c.us'))));
    assert.equal(f.writes.length, 0);
  }
});
test('bounded contact search exhaustion leaves the incoming message unimported with no create POST', async t => {
  const f = await fixture(t); let pages = 0;
  const request = async (url, options) => {
    if (url.startsWith('/contacts/search?')) { pages++; return { payload: relatedContacts((pages - 1) * 15) }; }
    return f.request(url, options);
  };
  await assert.rejects(new WaapiChatwootBridge({ request, journal: f.journal, config: general }).sync(normalizeWaapiEvent(envelope(peerA + '@c.us'))), /CONTACT_LOOKUP_LIMIT/);
  assert.equal(pages, 20); assert.equal(f.writes.length, 0);
});
test('unscoped legacy message cache cannot create an empty thread after closure and reconciles only an explicit original thread', async t => {
  const f = await fixture(t); const first = normalizeWaapiEvent(envelope(peerA + '@c.us', 'LEGACY'));
  await f.bridge.sync(first); f.conversations[0].status = 'resolved';
  const key = f.journal.key('message:' + first.providerMessageId);
  await f.journal.put('state', key, { result: { id: f.messages[0].id, source_id: first.providerMessageId } });
  const count = f.writes.length;
  const bridge = new WaapiChatwootBridge({ request: f.request, journal: new WaapiJournal(f.root), config: general });
  await assert.rejects(bridge.sync(first), /IMPORT_UNCONFIRMED/);
  assert.equal(f.writes.length, count); assert.equal(f.conversations.length, 1);
  await bridge.sync(first, f.conversations[0].id);
  assert.equal(f.writes.length, count); assert.equal(f.messages.length, 1);
  assert.deepEqual((await f.journal.get('state', key)).scope, { phone: peerA, conversationId: '201', direction: 'incoming' });
});
