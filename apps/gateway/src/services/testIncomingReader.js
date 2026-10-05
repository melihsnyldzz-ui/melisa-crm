import {waapiProvider, WAAPI_INSTANCE, WAAPI_RECIPIENT} from '../providers/waapiProvider.js';
import {normalizeWaapiEvent} from './waapiWebhookService.js';
import {waapiChatwootBridge} from './waapiChatwootBridge.js';
import {waapiJournal} from './waapiJournal.js';
import {env} from '../config/env.js';
import {resolveWaapiInboundIdentity} from './waapiInboundIdentityService.js';
import {createHash} from 'node:crypto';

const PAGE_SIZE = 100;
const MAX_QUEUE = 256;
const MAX_PEERS = 1024;
const MAX_MESSAGE_PAGES = 200;
const MAX_PENDING_MEDIA = 1000;
const WINDOW_MS = 300000;
const digest = value => createHash('sha256').update(value).digest('hex');
const peerValue = value => typeof value === 'string' ? value : value?._serialized;
const isPeer = peer => /^(?:[1-9]\d{6,14}@c\.us|[1-9]\d{9,19}@lid)$/.test(peer || '');
const code = error => /^[A-Z0-9_]+$/.test(error.code || error.message) ? error.code || error.message : 'READ_FAILED';
const quotaError = error => error.statusCode === 429 || /RATE_LIMIT|HTTP_429/.test(error.code || error.message || '');
function rowsFrom(response) {
  if (response?.status !== 'success' || response.data?.status !== 'success'
    || String(response.data.instanceId) !== WAAPI_INSTANCE || !Array.isArray(response.data.data)
    || response.data.data.length > PAGE_SIZE) {
    throw Error('WAAPI_INCOMING_READ_INVALID');
  }
  return response.data.data;
}

// One passive scheduler. Outbound authorization and the separate journal worker are unchanged.
export function startTestIncomingReader({provider = waapiProvider, bridge = waapiChatwootBridge,
  journal = waapiJournal, normalize = normalizeWaapiEvent, resolveIdentity = resolveWaapiInboundIdentity,
  config = env.waapi, now = Date.now, setIntervalFn = setInterval, clearIntervalFn = clearInterval} = {}) {
  let busy = false, stopped = false, blockedUntil = 0;
  const completed = new Set();
  const since = Math.floor(now() / 1000) - 86400;
  const recent = timestamp => Number.isSafeInteger(timestamp) && timestamp >= since && timestamp <= Math.floor(now() / 1000) + 300;
  const calls = [];
  // resolveIncomingPhone calls this.request; therefore LID lookups share the same budget.
  const readerProvider = Object.create(provider);
  readerProvider.request = async (path, body) => {
    while (calls.length && calls[0] <= now() - WINDOW_MS) calls.shift();
    if (now() < blockedUntil || calls.length >= 8) {
      const error = Object.assign(Error('WAAPI_READER_RATE_LIMIT'), {statusCode: 429});
      blockedUntil = Math.max(blockedUntil, calls.length ? calls[0] + WINDOW_MS : now() + WINDOW_MS);
      throw error;
    }
    calls.push(now());
    try { return await provider.request(path, body); }
    catch (error) { if (quotaError(error)) blockedUntil = now() + WINDOW_MS; throw error; }
  };

  const trialTick = async () => {
    const rows = rowsFrom(await readerProvider.request('action/fetch-messages', {
      chatId: WAAPI_RECIPIENT + '@c.us', limit: PAGE_SIZE, fromMe: false, includeMedia: true,
    }));
    for (const row of rows) {
      const message = row?.message, id = message?.id || message?._data?.id;
      if (id?.fromMe !== false || !recent(Number(message?.timestamp ?? message?._data?.t)) || completed.has(id?._serialized)) continue;
      let event = normalize({instanceId: WAAPI_INSTANCE, event: 'message', data: {message, media: row.media ?? undefined}}, {...config, incomingTestOnly: true});
      if (event.event === 'ignored') continue;
      event = await resolveIdentity(event, {provider: readerProvider, config: {...config, incomingTestOnly: true}});
      if (event.direction !== 'incoming' || event.phone !== WAAPI_RECIPIENT) throw Error('TEST_INCOMING_SCOPE_INVALID');
      if (event.mediaPending) continue;
      const result = await bridge.sync(event, 55);
      if (result.confirmed) completed.add(event.providerMessageId);
    }
  };

  const peers = new Map(), jobs = new Map(), queue = [];
  let discoveryOffset = 0, discoveryRows = null, discoveryIndex = 0, discoveryDue = 0, discoveryTurn = true;
  const discoveryPages = new Set();
  const enqueue = (peer, marker, state) => {
    const current = jobs.get(peer);
    if (current) { if (current.marker !== marker) current.changedMarker = marker; return true; }
    if (queue.length >= MAX_QUEUE) return false;
    const job = {peer, marker, offset: 0, rows: null, index: 0, phone: null, pages: new Set(), retryAt: 0};
    jobs.set(peer, job); queue.push(job); state.queued = true; return true;
  };
  const discover = async () => {
    if (!discoveryRows) {
      discoveryRows = rowsFrom(await readerProvider.request('action/get-chats', {offset: discoveryOffset, limit: PAGE_SIZE}));
      discoveryRows = [...discoveryRows].sort((a, b) => Math.max(Number(b?.timestamp) || 0, Number(b?.lastMessage?.timestamp) || 0)
        - Math.max(Number(a?.timestamp) || 0, Number(a?.lastMessage?.timestamp) || 0));
      discoveryIndex = 0;
      const signature = JSON.stringify(discoveryRows.map(chat => [peerValue(chat?.id), chat?.timestamp, chat?.lastMessage?.id?._serialized]));
      if (discoveryRows.length === PAGE_SIZE && (discoveryPages.has(signature) || discoveryOffset >= 20000)) {
        discoveryRows = null; discoveryOffset = 0; discoveryPages.clear(); discoveryDue = now() + WINDOW_MS;
        throw Error('WAAPI_INCOMING_CHAT_PAGINATION_INCOMPLETE');
      }
      discoveryPages.add(signature);
    }
    while (discoveryIndex < discoveryRows.length) {
      const chat = discoveryRows[discoveryIndex], peer = peerValue(chat?.id);
      const timestamp = Math.max(Number(chat?.timestamp) || 0, Number(chat?.lastMessage?.timestamp) || 0);
      if (!isPeer(peer) || chat.isGroup !== false || !recent(timestamp)) { discoveryIndex++; continue; }
      // lastMessage is a discovery hint only, never a message to import (including outgoing hints).
      const marker = `${timestamp}:${chat.lastMessage?.id?._serialized || ''}`;
      let state = peers.get(peer);
      if (!state) {
        if (peers.size >= MAX_PEERS) {
          const disposable = [...peers.keys()].find(key => !jobs.has(key));
          if (disposable) peers.delete(disposable);
          else return;
        }
        state = {marker: null, queued: false, hydrateAt: 0, pendingMedia: new Set(), mediaOverflow: false}; peers.set(peer, state);
      }
      if (state.marker !== marker || (state.hydrateAt && state.hydrateAt <= now())) {
        if (!enqueue(peer, marker, state)) return; // Retain the page/cursor until queue space is available.
      }
      discoveryIndex++;
    }
    const full = discoveryRows.length === PAGE_SIZE;
    discoveryRows = null; discoveryIndex = 0;
    discoveryOffset = full ? discoveryOffset + PAGE_SIZE : 0;
    if (!full) discoveryPages.clear();
    discoveryDue = full ? now() : now() + 45000;
  };
  const finish = job => {
    const state = peers.get(job.peer);
    state.marker = job.marker; state.queued = false;
    state.hydrateAt = state.pendingMedia.size || state.mediaOverflow ? now() + WINDOW_MS : 0;
    jobs.delete(job.peer);
    if (job.changedMarker && job.changedMarker !== job.marker) enqueue(job.peer, job.changedMarker, state);
  };
  const readPeer = async job => {
    if (!job.phone) job.phone = job.peer.endsWith('@c.us') ? job.peer.slice(0, -5) : await readerProvider.resolveIncomingPhone(job.peer);
    if (!job.mediaRestored && typeof journal.pendingMedia === 'function') {
      const pending = await journal.pendingMedia(WAAPI_INSTANCE, {peerJid: job.peer, phone: job.phone, limit: MAX_PENDING_MEDIA});
      const state = peers.get(job.peer);
      for (const id of pending.providerMessageIds) {
        if (state.pendingMedia.size < MAX_PENDING_MEDIA || state.pendingMedia.has(digest(id))) state.pendingMedia.add(digest(id));
        else state.mediaOverflow = true;
      }
      state.mediaOverflow ||= pending.overflow;
      if (state.mediaOverflow) console.warn('TEST inbound:', 'WAAPI_INCOMING_MEDIA_RECOVERY_INCOMPLETE');
      job.mediaRestored = true;
    }
    if (!job.rows) {
      if (job.offset >= PAGE_SIZE * MAX_MESSAGE_PAGES) throw Error('WAAPI_INCOMING_MESSAGE_PAGINATION_INCOMPLETE');
      const rows = rowsFrom(await readerProvider.request('action/fetch-messages', {
        chatId: job.peer, offset: job.offset, limit: PAGE_SIZE, fromMe: false, includeMedia: true,
      }));
      if (rows.length === PAGE_SIZE) {
        const signature = digest(JSON.stringify(rows.map(row => [String(row?.message?.id?._serialized || row?.message?._data?.id?._serialized || '').slice(0, 1024),
          Number(row?.message?.timestamp ?? row?.message?._data?.t)])));
        if (job.pages.has(signature)) throw Error('WAAPI_INCOMING_MESSAGE_PAGINATION_INCOMPLETE');
        job.pages.add(signature);
      }
      job.rows = rows;
      job.index = 0;
    }
    while (job.index < job.rows.length) {
      const row = job.rows[job.index], message = row?.message, id = message?.id || message?._data?.id;
      const remote = peerValue(id?.remote);
      const timestamp = Number(message?.timestamp ?? message?._data?.t);
      // Only an already accepted unresolved identity may recover outside the new-message window.
      const recovering = typeof id?._serialized === 'string' && peers.get(job.peer).pendingMedia.has(digest(id._serialized));
      if (id?.fromMe !== false || !Number.isSafeInteger(timestamp) || timestamp > Math.floor(now() / 1000) + 300
        || (!recent(timestamp) && !recovering)
        || remote !== job.peer) { job.index++; continue; }
      // A fetch response cannot introduce another peer, even an allegedly matching LID alias.
      let event;
      try {
        try {
          event = normalize({instanceId: WAAPI_INSTANCE, event: 'message', data: {message, media: row.media ?? undefined}}, {...config, incomingTestOnly: false});
        } catch (error) {
          if (!String(error.code || '').endsWith('WAAPI_MEDIA_REJECTED')) throw error;
          // Invalid inline bytes cannot replace a previously accepted attachment or cancel recovery.
          // Preserve only the validated message envelope; the rejected media is never journaled.
          event = normalize({instanceId: WAAPI_INSTANCE, event: 'message', data: {message}}, {...config, incomingTestOnly: false});
          if (!event.mediaPending) throw error;
          console.warn('TEST inbound:', code(error));
        }
        if (event.event === 'ignored') { job.index++; continue; }
        event = await resolveIdentity(event, {provider: readerProvider, config: {...config, incomingTestOnly: false}});
        if (event.direction !== 'incoming' || event.phone !== job.phone) { job.index++; continue; }
      } catch (error) {
        if (quotaError(error)) throw error;
        console.warn('TEST inbound:', code(error)); job.index++; continue;
      }
      // Pending media is durable too; a later fetch hydrates the same journal identity.
      const accepted = await journal.accept(event);
      const state = peers.get(job.peer), mediaKey = digest(event.providerMessageId);
      if (event.mediaPending) {
        const stored = accepted.duplicate && typeof journal.get === 'function' && typeof journal.key === 'function'
          ? await journal.get('events', journal.key(`${event.instanceId}:${event.event}:${event.providerMessageId}:${event.ack ?? ''}`)) : null;
        if (stored?.event?.media && !stored.event.mediaPending) state.pendingMedia.delete(mediaKey);
        else if (state.pendingMedia.size < MAX_PENDING_MEDIA || state.pendingMedia.has(mediaKey)) state.pendingMedia.add(mediaKey);
        else { state.mediaOverflow = true; console.warn('TEST inbound:', 'WAAPI_INCOMING_MEDIA_RECOVERY_INCOMPLETE'); }
      } else if (event.media) state.pendingMedia.delete(mediaKey);
      job.index++;
    }
    if (job.rows.length === PAGE_SIZE) {
      job.offset += PAGE_SIZE; job.rows = null; job.index = 0;
      queue.push(job); // Fair pagination: other peers get a turn before the next page.
    } else finish(job);
  };
  const generalTick = async () => {
    const index = queue.findIndex(job => job.retryAt <= now());
    if ((discoveryTurn || index === -1) && now() >= discoveryDue && queue.length < MAX_QUEUE) {
      discoveryTurn = false; await discover(); return;
    }
    if (index === -1) return;
    discoveryTurn = true;
    const [job] = queue.splice(index, 1);
    try { await readPeer(job); }
    catch (error) {
      const incomplete = error.message === 'WAAPI_INCOMING_MESSAGE_PAGINATION_INCOMPLETE';
      if (incomplete) {
        // Keep the peer unresolved, but revisit the newest page after backoff: a changed hint
        // or newly hydrated attachment must not be trapped behind the incomplete old cursor.
        job.offset = 0; job.rows = null; job.index = 0; job.pages.clear();
      }
      job.retryAt = quotaError(error) ? blockedUntil : now() + (incomplete ? WINDOW_MS : 45000);
      queue.push(job); throw error;
    }
  };
  const tick = async () => {
    if (stopped || busy || now() < blockedUntil) return;
    busy = true;
    try { if (config.incomingTestOnly === true) await trialTick(); else await generalTick(); }
    catch (error) { console.warn('TEST inbound:', code(error)); }
    finally { busy = false; }
  };
  const timer = setIntervalFn(tick, 45000); timer.unref?.(); void tick();
  return () => { stopped = true; clearIntervalFn(timer); };
}
