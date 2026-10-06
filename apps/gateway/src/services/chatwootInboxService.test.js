import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import {
  listChatwootInboxOverview,
  getChatwootConversationDetail,
  mapChatwootMessage,
  normalizeChatwootMessageDirection,
} from './chatwootInboxService.js';

test('message_type 0 is incoming', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: 0 }), 'incoming');
});

test('message_type 1 is outgoing', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: 1 }), 'outgoing');
});

test('string message_type 1 is outgoing', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: '1' }), 'outgoing');
});

test('User sender is outgoing when message type is absent', () => {
  assert.equal(normalizeChatwootMessageDirection({ sender: { type: 'User' } }), 'outgoing');
});

test('Contact sender is incoming when message type is absent', () => {
  assert.equal(normalizeChatwootMessageDirection({ sender: { type: 'Contact' } }), 'incoming');
});

test('incoming and outgoing photos preserve blank text and attachments', () => {
  const attachment = {
    id: 7, file_type: 'image', content_type: 'image/jpeg',
    data_url: 'https://chatwoot.local/image.jpg', thumb_url: 'https://chatwoot.local/thumb.jpg',
  };
  const incoming = mapChatwootMessage({ id: 1, message_type: 0, content: '', attachments: [attachment] });
  const outgoing = mapChatwootMessage({ id: 2, message_type: 1, content: '', attachments: [attachment] });
  assert.equal(incoming.direction, 'incoming');
  assert.equal(outgoing.direction, 'outgoing');
  assert.equal(incoming.text, '');
  assert.equal(outgoing.text, '');
  assert.equal(incoming.attachments.length, 1);
  assert.equal(outgoing.attachments.length, 1);
  assert.equal(incoming.imageUrl, attachment.data_url);
  assert.equal(outgoing.thumbnailUrl, attachment.thumb_url);
});

test('official message type wins when direction indicators conflict', () => {
  assert.equal(normalizeChatwootMessageDirection({
    message_type: 0,
    sender: { type: 'User' },
    is_outgoing: true,
  }), 'incoming');
});

test('missing direction fields fall back safely to incoming', () => {
  assert.equal(normalizeChatwootMessageDirection({}), 'incoming');
});

test('activity is excluded and template is outgoing', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: 2, sender: { type: 'User' } }), null);
  assert.equal(normalizeChatwootMessageDirection({ message_type: 3 }), 'outgoing');
});

test('Chatwoot inbox is mapped to the safe CRM read model', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = {
    ...env.chatwoot,
    agentPersonnelMap: new Map(env.chatwoot.agentPersonnelMap),
  };
  const originalWhatsapp = { ...env.whatsapp };
  const calls = [];

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token';
  env.chatwoot.agentPersonnelMap = new Map([[7, 19]]);
  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = false;

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith('/conversations?status=all&page=1&sort_by=created_at_desc')) {
      return new Response(JSON.stringify({
        data: {
          meta: { all_count: 1 },
          payload: [{
            id: 41,
            inbox_id: 1,
            status: 'open',
            unread_count: 2,
            last_activity_at: 1_720_000_000,
            labels: ['musteri'],
            custom_attributes: { melisa_stage: 'Teklif' },
            meta: {
              sender: { name: 'Test Musteri', phone_number: '+38640111222', identifier: '38640111222@s.whatsapp.net' },
              assignee: { id: 19, name: 'Ahmet' },
              team: { id: 3, name: 'Slovenya' },
            },
          }],
        },
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      payload: [{
        id: 90,
        content: 'Merhaba',
        message_type: 0,
        created_at: 1_720_000_000,
        status: 'sent',
        attachments: [{
          id: 501,
          file_type: 'image',
          content_type: 'image/jpeg',
          data_url: 'https://chatwoot.local/rails/active_storage/blobs/image.jpg',
          thumb_url: 'https://chatwoot.local/rails/active_storage/representations/image.jpg',
          file_size: 12345,
          width: 640,
          height: 480,
        }, {
          id: 502,
          file_type: 'file',
          content_type: 'application/pdf',
          data_url: 'https://chatwoot.local/rails/active_storage/blobs/document.pdf',
          fallback_title: 'document.pdf',
          file_size: 67890,
        }],
      }, {
        id: 91,
        content: 'CRM notu: Fiyat bekliyor',
        message_type: 1,
        private: true,
        created_at: 1_720_000_100,
        content_attributes: { melisa_crm: { type: 'note', data: { note: 'Fiyat bekliyor' } } },
        attachments: [],
      }],
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview({ limit: 25, offset: 0 });
    assert.equal(result.summary.source, 'chatwoot-crm');
    assert.equal(result.conversations.length, 1);
    assert.equal(result.conversations[0].assignedUserId, 7);
    assert.equal(result.conversations[0].phoneIdentity.countryCode, 'SI');
    assert.equal(result.conversations[0].messages[0].direction, 'incoming');
    assert.equal(result.conversations[0].messages[0].messageType, 'incoming');
    assert.equal(result.conversations[0].messages[0].senderType, '');
    assert.equal(result.conversations[0].messages[0].createdAt, '2024-07-03T09:46:40.000Z');
    assert.equal(result.conversations[0].messages[0].type, 'image');
    assert.equal(result.conversations[0].messages[0].imageUrl, 'https://chatwoot.local/rails/active_storage/blobs/image.jpg');
    assert.equal(result.conversations[0].messages[0].attachments.length, 2);
    assert.equal(result.conversations[0].messages[0].attachments[0].file_type, 'image');
    assert.equal(result.conversations[0].messages[0].attachments[1].file_name, 'document.pdf');
    assert.equal(result.conversations[0].messages.length, 1);
    assert.equal(result.conversations[0].notes, 'Fiyat bekliyor');
    assert.equal(result.conversations[0].capabilities.assign, true);
    assert.equal(result.conversations[0].capabilities.send, false);
    assert.equal(result.conversations[0].capabilities.localWorkflow, false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers.api_access_token, 'test-token');
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
    Object.assign(env.whatsapp, originalWhatsapp);
  }
});

test('Chatwoot inbox can return more than one internal 25-row page', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token-pages';
  env.chatwoot.includeGroups = false;

  const conversations = Array.from({ length: 27 }, (_, index) => ({
    id: index + 1,
    inbox_id: 1,
    status: index >= 24 ? 'open' : 'resolved',
    meta: { sender: { phone_number: `+90530000${String(index).padStart(4, '0')}` } },
  }));

  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200 });
    }
    const page = Number(new URL(text).searchParams.get('page') || 1);
    const start = (page - 1) * 25;
    return new Response(JSON.stringify({
      data: {
        meta: { all_count: conversations.length },
        payload: conversations.slice(start, start + 25),
      },
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview({ limit: 50, offset: 0 });
    assert.equal(result.conversations.length, 27);
    assert.equal(result.pagination.total, 27);
    assert.equal(result.summary.open, 3);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});

test('Chatwoot inbox enables send only after guarded live approval', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };
  const originalWhatsapp = { ...env.whatsapp };

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token-send';
  env.whatsapp.provider = 'chatwoot';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;

  global.fetch = async (url) => {
    if (String(url).includes('/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: {
        meta: { all_count: 1 },
        payload: [{ id: 51, inbox_id: 1, status: 'open', meta: { sender: { phone_number: '+905301112233' } } }],
      },
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview();
    assert.equal(result.capabilities.send, true);
    assert.equal(result.conversations[0].capabilities.send, true);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
    Object.assign(env.whatsapp, originalWhatsapp);
  }
});

test('Chatwoot inbox ignores conversations from other inboxes', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 9;
  env.chatwoot.apiAccessToken = 'test-token-inbox';

  global.fetch = async () => new Response(JSON.stringify({
    data: {
      meta: { all_count: 1 },
      payload: [{ id: 8, inbox_id: 3, meta: {}, messages: [] }],
    },
  }), { status: 200 });

  try {
    const result = await listChatwootInboxOverview();
    assert.equal(result.conversations.length, 0);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});

test('Chatwoot customer inbox hides group conversations by default', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token-groups';
  env.chatwoot.includeGroups = false;

  global.fetch = async (url) => {
    if (String(url).includes('/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: {
        meta: { all_count: 2 },
        payload: [
          { id: 1, inbox_id: 1, status: 'open', unread_count: 1, meta: { sender: { name: 'Satis Grubu (GROUP)', identifier: '120363@g.us' } } },
          { id: 2, inbox_id: 1, status: 'open', unread_count: 2, meta: { sender: { name: 'Musteri', phone_number: '+905301112233' } } },
        ],
      },
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview();
    assert.equal(result.conversations.length, 1);
    assert.equal(result.conversations[0].id, 2);
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.unread, 2);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});

function inboxFixture(t, name) {
  const originals = { fetch: global.fetch, chatwoot: { ...env.chatwoot }, whatsapp: { ...env.whatsapp }, now: Date.now };
  t.after(() => { global.fetch = originals.fetch; Object.assign(env.chatwoot, originals.chatwoot); Object.assign(env.whatsapp, originals.whatsapp); Date.now = originals.now; });
  Object.assign(env.chatwoot, { baseUrl: 'http://chatwoot.local', accountId: 2, inboxId: 1, apiAccessToken: 'synthetic-' + name, includeGroups: false });
  Object.assign(env.whatsapp, { provider: 'evolution', sendEnabled: false });
}
const syntheticConversation = (id, agent = 7, inbox = 1) => ({ id, inbox_id: inbox, status: 'open',
  last_activity_at: 1700000000 - id,
  meta: { sender: { phone_number: '+18880000001', name: 'Synthetic ' + id }, assignee: { id: agent } } });
const jsonResponse = body => new Response(JSON.stringify(body), { status: 200 });

test('management bootstrap reads one fresh activity page without messages, workflow or exact counts', async t => {
  inboxFixture(t, 'bootstrap-fresh');
  const requests = [];
  global.fetch = async url => {
    const parsed = new URL(String(url)); requests.push(parsed);
    if (parsed.pathname.endsWith('/messages')) return jsonResponse({ payload: [] });
    const bootstrap = parsed.searchParams.get('sort_by') === 'last_activity_at_desc';
    const row = syntheticConversation(bootstrap ? 2 : 1);
    row.unread_count = 3;
    row.messages = [{ content: 'private provider content', private: true }];
    return jsonResponse({ data: { meta: { all_count: bootstrap ? 748 : 1 }, payload: bootstrap
      ? Array.from({ length: 25 }, (_, i) => ({ ...row, id: i + 2 })) : [row] } });
  };
  const user = { role: 'patron', permissions: ['crm.assign'] };
  await listChatwootInboxOverview({ user });
  requests.length = 0;
  env.whatsapp.provider = 'waapi'; // A cold readiness refresh would add a forbidden provider request.
  const result = await listChatwootInboxOverview({ view: 'bootstrap', user, limit: Infinity, offset: 50 });
  assert.equal(requests.length, 1); assert.equal(requests[0].searchParams.get('page'), '1');
  assert.equal(requests[0].searchParams.get('sort_by'), 'last_activity_at_desc');
  assert.equal(result.conversations.length, 25); assert.equal(result.conversations[0].id, 2);
  assert.equal(result.conversations[0].unread, 3); assert.equal(result.conversations[0].chatwootAgentId, 7);
  assert.equal(result.capabilities.assign, true); assert.equal(result.capabilities.send, false);
  assert.deepEqual(result.summary, { total: null, open: null, unread: null, pendingHumanReply: null, complete: false, source: 'chatwoot-crm' });
  assert.deepEqual(result.pagination, { limit: 25, offset: 0, hasNext: true, nextOffset: 0, total: null });
  for (const row of result.conversations) {
    assert.equal(row.messagesLoaded, false); assert.equal(row.detailLoaded, false);
    assert.equal(row.preview, 'Son mesaj yükleniyor…'); assert.equal(row.waitingForReply, null);
    for (const key of ['messages', 'notes', 'tasks', 'productInterests', 'quotes']) assert.equal(Object.hasOwn(row, key), false);
  }
  await listChatwootInboxOverview({ view: 'bootstrap', user, limit: 1.9 });
  assert.equal(requests.length, 2);
});

test('bootstrap rejects malformed provider data and does not claim zero for uncounted filtered rows', async t => {
  inboxFixture(t, 'bootstrap-invalid');
  let response;
  global.fetch = async () => jsonResponse(response);
  const options = { view: 'bootstrap', user: { role: 'patron', permissions: [] } };
  for (const data of [
    { meta: { all_count: 2001 }, payload: [] },
    { meta: { all_count: 'x' }, payload: [] },
    { meta: { all_count: 1 }, payload: [] },
    { meta: { all_count: 2 }, payload: [syntheticConversation(1), syntheticConversation(1)] },
    { meta: { all_count: 1 }, payload: [{ ...syntheticConversation(1), id: -1 }] },
    { meta: { all_count: 26 }, payload: Array.from({ length: 26 }, (_, i) => syntheticConversation(i + 1)) },
  ]) {
    response = { data };
    await assert.rejects(listChatwootInboxOverview(options), e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_INVALID');
  }
  const group = syntheticConversation(1); group.meta.sender.identifier = 'synthetic@g.us';
  response = { data: { payload: [group] } };
  const result = await listChatwootInboxOverview(options);
  assert.equal(result.conversations.length, 0); assert.equal(result.summary.total, null);
  assert.equal(result.summary.complete, false); assert.equal(result.pagination.hasNext, true);
});

test('bootstrap skips filtered pages and only proves zero after complete provider traversal', async t => {
  inboxFixture(t, 'bootstrap-empty'); let reads = 0; let empty = false;
  global.fetch = async url => {
    const parsed = new URL(String(url)); assert(!parsed.pathname.endsWith('/messages'));
    reads++;
    const page = Number(parsed.searchParams.get('page'));
    const rows = page === 1 ? Array.from({ length: 25 }, (_, i) => syntheticConversation(i + 1, 7, 2))
      : [syntheticConversation(26, 7, empty ? 2 : 1)];
    return jsonResponse({ data: { meta: { all_count: 26 }, payload: rows } });
  };
  const options = { view: 'bootstrap', user: { role: 'mudur', permissions: [] }, limit: -1 };
  const result = await listChatwootInboxOverview(options);
  assert.equal(reads, 2); assert.deepEqual(result.conversations.map(c => c.id), [26]);
  assert.equal(result.summary.total, null); assert.equal(result.pagination.limit, 1);
  empty = true;
  const none = await listChatwootInboxOverview(options);
  assert.equal(reads, 4); assert.equal(none.summary.total, 0); assert.equal(none.summary.complete, true);
  assert.equal(none.pagination.hasNext, false);
});

test('bootstrap identity and inbox policy changes fail closed', async t => {
  for (const field of ['apiAccessToken', 'inboxId', 'includeGroups']) {
    await t.test(field, async t => {
      inboxFixture(t, 'bootstrap-drift-' + field);
      global.fetch = async () => {
        env.chatwoot[field] = field === 'apiAccessToken' ? 'changed' : field === 'inboxId' ? 2 : true;
        return jsonResponse({ data: { meta: { all_count: 1 }, payload: [syntheticConversation(1)] } });
      };
      await assert.rejects(listChatwootInboxOverview({ view: 'bootstrap', user: { role: 'patron' } }),
        error => error.code === 'WHATSAPP_CRM_CHATWOOT_READ_IDENTITY_CHANGED');
    });
  }
});

test('personnel and unknown bootstrap retain fresh full traversal and personnel assignment boundary', async t => {
  inboxFixture(t, 'bootstrap-staff'); let listReads = 0; let messageReads = 0;
  const row = syntheticConversation(1, 7);
  global.fetch = async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/messages')) { messageReads++; return jsonResponse({ payload: [] }); }
    assert.equal(parsed.searchParams.get('sort_by'), 'created_at_desc'); listReads++;
    return jsonResponse({ data: { meta: { all_count: 1 }, payload: [row] } });
  };
  await listChatwootInboxOverview({ user: { role: 'patron' } });
  row.meta.assignee.id = 8;
  const staff = await listChatwootInboxOverview({ view: 'bootstrap', user: { role: 'personel', chatwootAgentId: 7 } });
  assert.equal(staff.conversations.length, 0); assert.equal(listReads, 2);
  const unknown = await listChatwootInboxOverview({ view: 'bootstrap' });
  assert.equal(listReads, 3); assert.equal(messageReads, 2); assert.equal(unknown.summary.total, 1);
});

test('concurrent overview offsets share one complete page traversal and overlapping in-flight message reads', async t => {
  inboxFixture(t, 'coalesce'); const rows = Array.from({ length: 27 }, (_, i) => syntheticConversation(i + 1));
  const pageReads = []; const messageReads = [];
  global.fetch = async url => {
    await new Promise(resolve => setTimeout(resolve, 3));
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/messages')) {
      messageReads.push(parsed.pathname); return jsonResponse({ payload: [] });
    }
    const page = Number(parsed.searchParams.get('page')); pageReads.push(page);
    return jsonResponse({ data: { meta: { all_count: rows.length }, payload: rows.slice((page - 1) * 25, page * 25) } });
  };
  const [first, remaining, overlapping] = await Promise.all([
    listChatwootInboxOverview({ limit: 20 }), listChatwootInboxOverview({ limit: 20, offset: 20 }), listChatwootInboxOverview({ limit: 20 }),
  ]);
  assert.deepEqual(pageReads, [1, 2]); assert.equal(messageReads.length, 27);
  assert.deepEqual(first.conversations.map(c => c.id), overlapping.conversations.map(c => c.id));
  assert.equal(first.conversations.length, 20); assert.equal(remaining.conversations.length, 7);
});

test('management snapshots preserve per-request permissions while personnel always reads fresh assignments', async t => {
  inboxFixture(t, 'role-fresh'); const rows = [syntheticConversation(1, 7), syntheticConversation(2, 8), syntheticConversation(3, 7, 2)]; let pages = 0;
  global.fetch = async url => {
    await Promise.resolve();
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    pages++; return jsonResponse({ data: { meta: { all_count: rows.length }, payload: rows } });
  };
  const staff = { role: 'personel', chatwootAgentId: 7, permissions: [] };
  const [patron, personel] = await Promise.all([
    listChatwootInboxOverview({ user: { role: 'patron', permissions: ['crm.assign'] } }), listChatwootInboxOverview({ user: staff }),
  ]);
  assert.equal(pages, 2); assert.deepEqual(patron.conversations.map(c => c.id), [1, 2]);
  assert.deepEqual(personel.conversations.map(c => c.id), [1]); assert.equal(personel.capabilities.assign, false);
  rows[0].meta.assignee.id = 8;
  const afterReassignment = await listChatwootInboxOverview({ user: staff });
  assert.equal(pages, 3); assert.equal(afterReassignment.conversations.length, 0);
  const otherStaff = await listChatwootInboxOverview({ user: { ...staff, chatwootAgentId: 8 } });
  assert.deepEqual(otherStaff.conversations.map(c => c.id), [1, 2]); assert.equal(pages, 4);
  const currentPolicy = await listChatwootInboxOverview({ user: { role: 'patron', permissions: [] } });
  assert.equal(pages, 4); assert.equal(currentPolicy.capabilities.assign, false);
  assert(currentPolicy.conversations.every(c => c.capabilities.assign === false));
});

test('overview failure clears coalesced work and does not cache a fallback or partial response', async t => {
  inboxFixture(t, 'failure'); let good = false; let reads = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    reads++; await Promise.resolve();
    if (!good) throw Error('synthetic backend unavailable');
    return jsonResponse({ data: { meta: { all_count: 1 }, payload: [syntheticConversation(1)] } });
  };
  const failed = await Promise.allSettled([listChatwootInboxOverview(), listChatwootInboxOverview()]);
  assert(failed.every(r => r.status === 'rejected')); assert.equal(reads, 1);
  good = true; assert.equal((await listChatwootInboxOverview()).conversations.length, 1); assert.equal(reads, 2);
});

test('snapshot TTL starts at successful completion and fresh polls still read messages and private workflow', async t => {
  inboxFixture(t, 'ttl'); let clock = 100000; Date.now = () => clock;
  let pageReads = 0; let messageVersion = 1; let rows = [syntheticConversation(1)];
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [
      { id: messageVersion, message_type: 0, content: 'Message ' + messageVersion, created_at: 1700000000 + messageVersion },
      { id: messageVersion + 100, private: true, content_attributes: { melisa_crm: { type: 'note', data: { note: 'Note ' + messageVersion } } } },
    ] });
    pageReads++; clock += 5000;
    return jsonResponse({ data: { meta: { all_count: rows.length }, payload: rows } });
  };
  await listChatwootInboxOverview(); assert.equal(clock, 105000);
  messageVersion = 2; clock = 124999;
  const beforeExpiry = await listChatwootInboxOverview(); assert.equal(pageReads, 1);
  assert.equal(beforeExpiry.conversations[0].messages[0].text, 'Message 2'); assert.equal(beforeExpiry.conversations[0].notes, 'Note 2');
  rows = [syntheticConversation(1, 8), syntheticConversation(2)]; clock = 125000;
  const afterExpiry = await listChatwootInboxOverview(); assert.equal(pageReads, 2);
  assert.equal(afterExpiry.conversations.length, 2); assert.equal(afterExpiry.conversations[0].chatwootAgentId, 8);
});

test('backend token/account/base changes invalidate raw snapshots while inbox/group policy filters remain per request', async t => {
  inboxFixture(t, 'identity'); let pageReads = 0;
  const rows = [syntheticConversation(1), syntheticConversation(2, 7, 2), { ...syntheticConversation(3), meta: { sender: { identifier: '18880000001@g.us' } } }];
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    pageReads++; return jsonResponse({ data: { meta: { all_count: rows.length }, payload: rows } });
  };
  assert.deepEqual((await listChatwootInboxOverview()).conversations.map(c => c.id), [1]);
  env.chatwoot.includeGroups = true;
  assert.deepEqual((await listChatwootInboxOverview()).conversations.map(c => c.id), [1, 3]); assert.equal(pageReads, 1);
  env.chatwoot.inboxId = 2;
  assert.deepEqual((await listChatwootInboxOverview()).conversations.map(c => c.id), [2]); assert.equal(pageReads, 1);
  env.chatwoot.apiAccessToken = 'synthetic-identity-rotated'; await listChatwootInboxOverview();
  env.chatwoot.accountId = 3; await listChatwootInboxOverview();
  env.chatwoot.baseUrl = 'http://different-chatwoot.local'; await listChatwootInboxOverview();
  assert.equal(pageReads, 4);
});

test('backend identity change during page read rejects old results and cannot retain a poisoned pending cache', async t => {
  inboxFixture(t, 'changing'); let changed = false; let pageReads = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    pageReads++;
    if (!changed) { changed = true; env.chatwoot.apiAccessToken = 'synthetic-changing-new'; }
    return jsonResponse({ data: { meta: { all_count: 1 }, payload: [syntheticConversation(1)] } });
  };
  await assert.rejects(listChatwootInboxOverview(), e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_IDENTITY_CHANGED');
  assert.equal((await listChatwootInboxOverview()).conversations.length, 1); assert.equal(pageReads, 2);
});

test('an in-flight message failure is evicted so the next read sees new history without a repeated page traversal', async t => {
  inboxFixture(t, 'message-failure'); let good = false; let pages = 0; let messages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) {
      messages++; await Promise.resolve(); if (!good) throw Error('synthetic message unavailable');
      return jsonResponse({ payload: [{ id: 1, message_type: 0, content: 'Recovered' }] });
    }
    pages++; return jsonResponse({ data: { meta: { all_count: 1 }, payload: [syntheticConversation(1)] } });
  };
  const failed = await Promise.allSettled([listChatwootInboxOverview(), listChatwootInboxOverview()]);
  assert(failed.every(r => r.status === 'rejected')); assert.equal(messages, 1);
  good = true; const result = await listChatwootInboxOverview();
  assert.equal(result.conversations[0].messages[0].text, 'Recovered'); assert.equal(messages, 2); assert.equal(pages, 1);
});

test('personnel cannot inherit an older management traversal across reassignment', async t => {
  inboxFixture(t, 'pending-personnel-acl');
  const rows = Array.from({ length: 26 }, (_, i) => syntheticConversation(i + 1, i === 0 ? 7 : 8));
  let release; const blocked = new Promise(resolve => { release = resolve; });
  let started; const pageTwoStarted = new Promise(resolve => { started = resolve; });
  t.after(release); let blockedOnce = false; let messageReads = 0; let pageReads = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) { messageReads++; return jsonResponse({ payload: [{ id: 1, message_type: 0, content: 'Protected synthetic text' }] }); }
    const page = Number(new URL(String(url)).searchParams.get('page')); pageReads++;
    if (page === 2 && !blockedOnce) { blockedOnce = true; started(); await blocked; }
    return jsonResponse({ data: { meta: { all_count: rows.length }, payload: rows.slice((page - 1) * 25, page * 25) } });
  };
  const adminRead = listChatwootInboxOverview({ limit: 1, user: { role: 'patron', permissions: ['crm.view'] } });
  await pageTwoStarted; rows[0].meta.assignee.id = 8;
  const personnel = await listChatwootInboxOverview({ user: { role: 'personel', chatwootAgentId: 7, permissions: ['crm.view'] } });
  assert.equal(personnel.conversations.length, 0); assert.equal(messageReads, 0); assert.equal(pageReads, 4);
  release(); await adminRead;
  await listChatwootInboxOverview({ limit: 1, user: { role: 'patron', permissions: ['crm.view'] } });
  assert.equal(pageReads, 4);
});

test('empty or truncated overview with a positive reported count is rejected and the next poll retries', async t => {
  inboxFixture(t, 'truncated'); let valid = false; let pageReads = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    pageReads++; return jsonResponse({ data: { meta: { all_count: 1 }, payload: valid ? [syntheticConversation(1)] : [] } });
  };
  await assert.rejects(listChatwootInboxOverview(), e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_INVALID');
  valid = true; assert.equal((await listChatwootInboxOverview()).conversations.length, 1); assert.equal(pageReads, 2);
});

test('malformed count, malformed row and repeated conversation pages are not cached as successful snapshots', async t => {
  inboxFixture(t, 'invalid-pages');
  const badResponses = [
    () => ({ data: { meta: { all_count: -1 }, payload: [] } }),
    () => ({ data: { meta: { all_count: 'unknown' }, payload: [] } }),
    () => ({ data: { meta: { all_count: 1 }, payload: [null] } }),
    () => ({ data: { meta: { all_count: 1 }, payload: [{ id: 'bad' }] } }),
    () => ({ data: { meta: { all_count: 26 }, payload: Array.from({ length: 25 }, (_, i) => syntheticConversation(i + 1)) } }),
  ];
  let valid = false; let response;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    return jsonResponse(valid ? { data: { meta: { all_count: 0 }, payload: [] } } : response());
  };
  for (let i = 0; i < badResponses.length; i++) {
    env.chatwoot.apiAccessToken = 'synthetic-invalid-pages-' + i; response = badResponses[i]; valid = false;
    await assert.rejects(listChatwootInboxOverview(), e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_INVALID');
    valid = true; assert.equal((await listChatwootInboxOverview()).conversations.length, 0);
  }
});

test('overview traverses beyond 500 raw rows while retaining its 500-message per-request limit', async t => {
  inboxFixture(t, 'cap'); let pages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    const page = Number(new URL(String(url)).searchParams.get('page')); pages++;
    return jsonResponse({ data: { meta: { all_count: 600 }, payload: Array.from({ length: 25 }, (_, i) => syntheticConversation((page - 1) * 25 + i + 1)) } });
  };
  const result = await listChatwootInboxOverview({ limit: 600 });
  assert.equal(pages, 24); assert.equal(result.pagination.total, 600); assert.equal(result.conversations.length, 500);
  assert.equal(result.pagination.limit, 500); assert.equal(result.pagination.nextOffset, 500);
  const remaining = await listChatwootInboxOverview({ limit: 500, offset: 500 });
  assert.equal(remaining.conversations.length, 100); assert.equal(remaining.pagination.hasNext, false); assert.equal(pages, 24);
});

test('stable creation pagination reads all 731 unique rows and restores recent-first order for 728 scoped conversations', async t => {
  inboxFixture(t, 'activity-overlap'); let pages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    const parsed = new URL(String(url)); const page = Number(parsed.searchParams.get('page')); pages++;
    assert.equal(parsed.searchParams.get('sort_by'), 'created_at_desc');
    const rows = Array.from({ length: Math.min(25, 731 - (page - 1) * 25) }, (_, i) => {
      const id = 731 - (page - 1) * 25 - i; const row = syntheticConversation(id);
      if ([20, 30, 600].includes(id)) row.meta.sender.identifier = '123456@g.us';
      return row;
    });
    return jsonResponse({ data: { meta: { all_count: 731 }, payload: rows } });
  };
  const result = await listChatwootInboxOverview({ limit: 500 });
  assert.equal(pages, 30); assert.equal(result.pagination.total, 728); assert.equal(result.conversations.length, 500);
  assert.equal(result.conversations[0].id, 1);
  assert(result.conversations.slice(0, 100).some(c => c.id === 1));
  const remaining = await listChatwootInboxOverview({ limit: 500, offset: 500 });
  assert.equal(remaining.conversations.length, 228); assert.equal(remaining.pagination.hasNext, false);
  assert.equal(new Set([...result.conversations, ...remaining.conversations].map(c => c.id)).size, 728);
  await listChatwootInboxOverview({ limit: 1 }); assert.equal(pages, 30);
});

test('recent ordering handles epoch seconds and ISO fallbacks with a stable descending id tie across offsets', async t => {
  inboxFixture(t, 'recent-order'); let pages = 0;
  const rows = [syntheticConversation(4), syntheticConversation(3), syntheticConversation(2), syntheticConversation(1)];
  rows[0].last_activity_at = 1700000002; rows[1].last_activity_at = '1700000003';
  delete rows[2].last_activity_at; rows[2].timestamp = 1700000003;
  delete rows[3].last_activity_at; rows[3].updated_at = new Date(1700000003000).toISOString();
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    pages++; assert.equal(new URL(String(url)).searchParams.get('sort_by'), 'created_at_desc');
    return jsonResponse({ data: { meta: { all_count: 4 }, payload: rows } });
  };
  const first = await listChatwootInboxOverview({ limit: 2 });
  const remaining = await listChatwootInboxOverview({ limit: 2, offset: 2 });
  assert.deepEqual(first.conversations.map(c => c.id), [3, 2]);
  assert.deepEqual(remaining.conversations.map(c => c.id), [1, 4]); assert.equal(pages, 1);
});

test('reported raw count beyond the bounded 2000-row traversal rejects without messages or a partial cache', async t => {
  inboxFixture(t, 'raw-bound'); let oversized = true; let pages = 0; let messages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) { messages++; return jsonResponse({ payload: [] }); }
    pages++;
    return jsonResponse({ data: { meta: { all_count: oversized ? 2001 : 1 }, payload: [syntheticConversation(1)] } });
  };
  await assert.rejects(listChatwootInboxOverview(), e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_INVALID');
  assert.equal(messages, 0);
  oversized = false; assert.equal((await listChatwootInboxOverview()).conversations.length, 1); assert.equal(pages, 2);
});

test('a complete traversal at the 80-page boundary remains available through normal overview pagination', async t => {
  inboxFixture(t, 'raw-boundary'); let pages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    const page = Number(new URL(String(url)).searchParams.get('page')); pages++;
    return jsonResponse({ data: { meta: { all_count: 2000 }, payload: Array.from({ length: 25 }, (_, i) => syntheticConversation((page - 1) * 25 + i + 1)) } });
  };
  const result = await listChatwootInboxOverview({ limit: 1, offset: 1999 });
  assert.equal(pages, 80); assert.equal(result.pagination.total, 2000); assert.equal(result.conversations[0].id, 2000);
  assert.equal(result.pagination.hasNext, false);
});

test('a terminal partial overlap uses raw progress for completion and unique rows for UI pagination', async t => {
  inboxFixture(t, 'terminal-overlap'); let pages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    const page = Number(new URL(String(url)).searchParams.get('page')); pages++;
    const rows = page === 1 ? Array.from({ length: 25 }, (_, i) => syntheticConversation(i + 1))
      : [syntheticConversation(25, 8), syntheticConversation(26)];
    return jsonResponse({ data: { meta: { all_count: 27 }, payload: rows } });
  };
  const result = await listChatwootInboxOverview({ limit: 50 });
  assert.equal(pages, 2); assert.equal(result.pagination.total, 26);
  assert.equal(result.conversations.find(c => c.id === 25).chatwootAgentId, 8);
  assert.equal(result.pagination.hasNext, false);
});

test('missing overview metadata keeps legacy response compatibility but is never reused as a settled snapshot', async t => {
  inboxFixture(t, 'metadata-fallback'); let pageReads = 0; let validMetadata = false;
  global.fetch = async url => {
    if (String(url).includes('/messages')) return jsonResponse({ payload: [] });
    pageReads++;
    return jsonResponse({ data: validMetadata ? { meta: { all_count: 1 }, payload: [syntheticConversation(1)] } : { payload: [] } });
  };
  assert.equal((await listChatwootInboxOverview()).conversations.length, 0);
  validMetadata = true;
  assert.equal((await listChatwootInboxOverview()).conversations.length, 1); assert.equal(pageReads, 2);
});

test('conversation detail rejects account drift before message access instead of combining an old assignment with another backend', async t => {
  inboxFixture(t, 'detail-identity'); let messages = 0;
  global.fetch = async url => {
    if (String(url).includes('/messages')) { messages++; return jsonResponse({ payload: [{ id: 1, message_type: 0, content: 'Protected synthetic text' }] }); }
    env.chatwoot.accountId = 3;
    return jsonResponse(syntheticConversation(1, 7));
  };
  await assert.rejects(getChatwootConversationDetail({ conversationId: 1, user: { role: 'personel', chatwootAgentId: 7, permissions: ['crm.view'] } }),
    e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_IDENTITY_CHANGED' && e.statusCode === 503);
  assert.equal(messages, 0);
});

test('conversation detail rejects backend or inbox policy changes during the shared message read', async t => {
  inboxFixture(t, 'detail-mid-read');
  for (const mutate of [() => { env.chatwoot.apiAccessToken += '-rotated'; }, () => { env.chatwoot.inboxId = 2; }, () => { env.chatwoot.includeGroups = true; }]) {
    env.chatwoot.inboxId = 1; env.chatwoot.includeGroups = false;
    global.fetch = async url => {
      if (!String(url).includes('/messages')) return jsonResponse(syntheticConversation(1, 7));
      mutate(); return jsonResponse({ payload: [{ id: 1, message_type: 0, content: 'Protected synthetic text' }] });
    };
    await assert.rejects(getChatwootConversationDetail({ conversationId: 1, user: { role: 'personel', chatwootAgentId: 7, permissions: ['crm.view'] } }),
      e => e.code === 'WHATSAPP_CRM_CHATWOOT_READ_IDENTITY_CHANGED' && e.statusCode === 503);
  }
});

test('personnel detail rejects another assignment before hydrating messages and reassignment during history read',async t=>{
 inboxFixture(t,'terminal-assignment');let assignee=8,messageReads=0;
 const user={role:'personel',chatwootAgentId:7,permissions:['crm.view']};
 global.fetch=async url=>{if(String(url).includes('/messages')){messageReads++;assignee=8;return jsonResponse({payload:[{id:1,message_type:0,content:'Must stay private'}]});}return jsonResponse(syntheticConversation(1,assignee));};
 await assert.rejects(()=>getChatwootConversationDetail({conversationId:1,user}),e=>e.statusCode===403);assert.equal(messageReads,0);
 assignee=7;await assert.rejects(()=>getChatwootConversationDetail({conversationId:1,user}),e=>e.statusCode===403);assert.equal(messageReads,1);
});
