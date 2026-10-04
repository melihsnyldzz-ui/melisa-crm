import { env } from '../config/env.js';
import { chatwootApiRequest } from './chatwootApiService.js';
import { waapiJournal } from './waapiJournal.js';
import { waapiError, WAAPI_INSTANCE } from '../providers/waapiProvider.js';
import { resolveWaapiInboundIdentity, assertWaapiPhoneScope } from './waapiInboundIdentityService.js';

export class WaapiChatwootBridge {
  constructor({ request = chatwootApiRequest, journal = waapiJournal, config = env, provider } = {}) {
    this.request = request; this.journal = journal; this.config = config; this.tail = Promise.resolve();
    this.provider = provider;
    this.lastSafety = { bridgeReady: false, reason: 'not-checked', checkedAt: null };
  }
  async assertSafe() {
    try {
      if (!this.config.waapi.bridgeEnabled || this.config.chatwoot.accountId !== 2 || this.config.chatwoot.inboxId !== 1) throw waapiError('WAAPI_BRIDGE_DISABLED');
      const inbox = await this.request('/inboxes/1');
      if (inbox.id !== 1 || inbox.channel_type !== 'Channel::Api' || inbox.webhook_url || inbox.callback_webhook_url
        || inbox.enable_auto_assignment || inbox.greeting_enabled) throw waapiError('WAAPI_BRIDGE_UNSAFE_INBOX');
      const hooks = await this.request('/webhooks');
      const list = hooks?.payload?.webhooks;
      if (!Array.isArray(list) || list.length) throw waapiError('WAAPI_BRIDGE_ACCOUNT_WEBHOOKS');
      const rules = await this.request('/automation_rules');
      // Unknown/active automation can assign or send. Import remains blocked until reviewed/disabled.
      if (!Array.isArray(rules?.payload) || rules.payload.some(r => r.active)) throw waapiError('WAAPI_BRIDGE_AUTOMATION_ACTIVE');
      const bot = await this.request('/inboxes/1/agent_bot');
      if (bot && Object.keys(bot).length) throw waapiError('WAAPI_BRIDGE_BOT_ACTIVE');
      this.lastSafety = { bridgeReady: true, reason: null, checkedAt: new Date().toISOString() };
      return this.lastSafety;
    } catch (e) {
      this.lastSafety = { bridgeReady: false, reason: e.code || 'bridge-check-failed', checkedAt: new Date().toISOString() };
      throw e;
    }
  }
  serial(fn) {
    const promise = this.tail.then(fn); this.tail = promise.catch(() => {}); return promise;
  }
  async once(key, find, create, scope) {
    const id = this.journal.key(key); const previous = await this.journal.get('state', id);
    if (scope && previous?.scope && JSON.stringify(previous.scope) !== JSON.stringify(scope)) throw waapiError('WAAPI_CHATWOOT_SCOPE_CONFLICT', false, 409);
    if (previous?.result && (!scope || previous.scope)) return previous.result;
    const found = await find();
    if (found) { await this.journal.put('state', id, { result: found, ...(scope ? { scope } : {}) }); return found; }
    if (previous?.started || previous?.result) throw waapiError('WAAPI_CHATWOOT_IMPORT_UNCONFIRMED');
    await this.journal.put('state', id, { started: true, startedAt: new Date().toISOString(), ...(scope ? { scope } : {}) });
    // No automatic retry of an ambiguous Chatwoot write. Reconcile with reads only.
    const result = await create();
    if (!result?.id) throw waapiError('WAAPI_CHATWOOT_IMPORT_UNCONFIRMED');
    await this.journal.put('state', id, { result: { id: result.id, source_id: result.source_id }, ...(scope ? { scope } : {}) });
    return result;
  }
  async exactContacts(phone) {
    const seen = new Set(); const matches = []; let total; let withMeta;
    const pageSize = 15; const pageLimit = 20;
    const pageNumber = value => {
      if (typeof value !== 'number' && !(typeof value === 'string' && /^[1-9]\d*$/.test(value))) return null;
      const number = Number(value);
      return Number.isSafeInteger(number) && number > 0 ? number : null;
    };
    for (let page = 1; page <= pageLimit; page++) {
      const r = await this.request(`/contacts/search?q=${phone}&page=${page}`);
      if (!Array.isArray(r?.payload) || r.payload.length > pageSize) throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
      const hasMeta = r.meta !== undefined;
      if (withMeta !== undefined && withMeta !== hasMeta) throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
      withMeta = hasMeta;
      if (hasMeta) {
        const meta = r.meta;
        const current = pageNumber(meta?.current_page ?? meta?.page);
        if (!meta || !Number.isSafeInteger(meta.count) || meta.count < 0 || current !== page
          || (meta.current_page !== undefined && meta.page !== undefined && pageNumber(meta.current_page) !== pageNumber(meta.page))
          || (total !== undefined && total !== meta.count)) throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
        total = meta.count;
        if (total > pageSize * pageLimit) throw waapiError('WAAPI_CONTACT_LOOKUP_LIMIT');
      }
      for (const contact of r.payload) {
        const id = Number(contact?.id);
        if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
        seen.add(id);
        if (String(contact.phone_number || '').replace(/\D/g, '') === phone) matches.push(contact);
      }
      if (hasMeta) {
        if (seen.size > total || (seen.size < total && r.payload.length < pageSize)) throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
        if (r.meta.has_more !== undefined && (typeof r.meta.has_more !== 'boolean' || r.meta.has_more !== (seen.size < total))) {
          throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
        }
        if (seen.size === total) return matches;
      } else if (r.payload.length < pageSize) return matches;
    }
    // An incomplete or looping search is never evidence that a contact is absent.
    throw waapiError('WAAPI_CONTACT_LOOKUP_LIMIT');
  }
  async resolveConversation(phone, conversationId, { direction = 'outgoing', allowResolved = false } = {}) {
    assertWaapiPhoneScope(phone, direction, this.config.waapi);
    if (conversationId) {
      if (!/^\d+$/.test(String(conversationId))) throw waapiError('WAAPI_CONVERSATION_INVALID');
      const c = await this.request(`/conversations/${conversationId}`);
      if (c.inbox_id !== 1 || String(c.meta?.sender?.phone_number || '').replace(/\D/g, '') !== phone) throw waapiError('WAAPI_CONVERSATION_MISMATCH');
      if (direction === 'incoming' && c.status === 'resolved' && !allowResolved) throw waapiError('WAAPI_CONVERSATION_RESOLVED');
      return c;
    }
    const contact = await this.once(`contact:${phone}`, async () => {
      const matches = await this.exactContacts(phone);
      if (matches.length > 1) throw waapiError('WAAPI_CONTACT_AMBIGUOUS');
      return matches[0];
    }, async () => {
      const r = await this.request('/contacts', { method: 'POST', body: { inbox_id: 1, name: `WhatsApp ${phone.slice(-4)}`, phone_number: `+${phone}` } });
      return r.payload?.contact;
    });
    // A durable contact id can outlive an edited/merged contact. Verify ownership
    // again before creating or selecting any conversation for this phone.
    const exact = await this.exactContacts(phone);
    if (exact.length !== 1 || String(exact[0].id) !== String(contact.id)) throw waapiError('WAAPI_CONTACT_AMBIGUOUS');
    const lookup = async () => {
      const r = await this.request(`/contacts/${contact.id}/conversations`);
      if (!Array.isArray(r.payload)) throw waapiError('WAAPI_CONVERSATION_LOOKUP_INVALID');
      const matches = r.payload.filter(c => c.inbox_id === 1 && c.status !== 'resolved');
      if (matches.length > 1) throw waapiError('WAAPI_CONVERSATION_AMBIGUOUS');
      return { active: matches[0], closed: r.payload.filter(c => c.inbox_id === 1 && c.status === 'resolved') };
    };
    let key = `conversation:${phone}`;
    if (direction === 'incoming') {
      // A phone's conversation cache must not hide a new message in a closed thread.
      const current = await lookup();
      if (current.active) return current.active;
      if (current.closed.some(c => !Number.isSafeInteger(Number(c.id)) || Number(c.id) <= 0)) throw waapiError('WAAPI_CONVERSATION_LOOKUP_INVALID');
      if (current.closed.length) key += `:after:${Math.max(...current.closed.map(c => Number(c.id)))}`;
    }
    return this.once(key, async () => (await lookup()).active,
      () => this.request('/conversations', { method: 'POST', body: { inbox_id: 1, contact_id: contact.id, status: 'open', assignee_id: null, team_id: null } }));
  }
  async findMessage(conversationId, providerMessageId) {
    let before = '';
    for (let page = 0; page < 100; page++) {
      const r = await this.request(`/conversations/${conversationId}/messages${before ? `?before=${before}` : ''}`);
      if (!Array.isArray(r.payload)) throw waapiError('WAAPI_MESSAGE_LOOKUP_INVALID');
      const match = r.payload.find(m => m.source_id === providerMessageId);
      if (match) return match;
      if (!r.payload.length) return null;
      const next = Math.min(...r.payload.map(m => Number(m.id)));
      if (!Number.isSafeInteger(next) || String(next) === before) throw waapiError('WAAPI_MESSAGE_LOOKUP_INVALID');
      before = String(next);
    }
    throw waapiError('WAAPI_MESSAGE_LOOKUP_LIMIT');
  }
  sync(event, conversationId) {
    return this.serial(async () => {
      event = await resolveWaapiInboundIdentity(event, { provider: this.provider, config: this.config.waapi });
      await this.assertSafe();
      if (event.mediaPending) throw waapiError('WAAPI_MEDIA_PENDING');
      const previous = await this.journal.get('state', this.journal.key(`message:${event.providerMessageId}`));
      if ((previous?.result || previous?.started) && !previous.scope && !conversationId) {
        // An old unscoped proof cannot identify its thread. Reconcile only when
        // the caller supplies a conversation, before any contact/thread creation.
        throw waapiError('WAAPI_CHATWOOT_IMPORT_UNCONFIRMED');
      }
      if (previous?.scope) {
        if (previous.scope.phone !== event.phone || previous.scope.direction !== event.direction
          || (conversationId && String(conversationId) !== previous.scope.conversationId)) throw waapiError('WAAPI_CHATWOOT_SCOPE_CONFLICT', false, 409);
        // A duplicate reconciles its original thread even if that thread has since closed.
        conversationId = previous.scope.conversationId;
      }
      const options = { direction: event.direction, allowResolved: Boolean(previous?.scope || previous?.result || previous?.started) };
      const conversation = await this.resolveConversation(event.phone, conversationId, options);
      const id = conversation.id;
      await this.resolveConversation(event.phone, id, options);
      const message = await this.once(`message:${event.providerMessageId}`,
        () => this.findMessage(id, event.providerMessageId),
        () => this.request(`/conversations/${id}/messages`, {
          method: 'POST',
          body: { content: event.text, message_type: event.direction, private: false,
            source_id: event.providerMessageId, content_attributes: { provider_message_id: event.providerMessageId, provider: 'waapi',
              provider_timestamp: event.timestamp || null, provider_accepted: event.direction === 'outgoing' } },
          media: event.media,
        }), { phone: event.phone, conversationId: String(id), direction: event.direction });
      return { confirmed: true, chatwootMessageId: String(message.id), providerMessageId: event.providerMessageId };
    });
  }
  async process(event) {
    if (!event.providerMessageId) return;
    if (event.event === 'message_ack') {
      assertWaapiPhoneScope(event.phone, 'outgoing', this.config.waapi);
      // ACK journal is separate from acceptance and Chatwoot recording. Monotonic receipt evidence.
      const key = this.journal.key(`ack:${event.providerMessageId}`);
      await this.journal.update('state', key, previous => ({ providerMessageId: event.providerMessageId,
        ack: Math.max(previous?.ack ?? -1, event.ack ?? -1), checkedAt: new Date().toISOString() }));
      return;
    }
    await this.sync(event, event.conversationId);
  }
}
export const waapiChatwootBridge = new WaapiChatwootBridge();
export function createWaapiWorker({ journal = waapiJournal, bridge = waapiChatwootBridge, config = env,
  now = Date.now, setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval } = {}) {
  let running = false;
  const timer = setIntervalFn(async () => {
    if (running || config.whatsapp.provider !== 'waapi') return;
    running = true;
    try {
      for (const item of await journal.pending(WAAPI_INSTANCE)) {
        if (String(item.event?.instanceId) !== WAAPI_INSTANCE) continue;
        try {
          if (!config.waapi.bridgeEnabled && ['message', 'message_create'].includes(item.event.event)) continue;
          await bridge.process(item.event);
          await journal.update('events', item.key, current => ({ ...(current || item), done: true,
            attemptCount: ((current || item).attemptCount || 0) + 1, processedAt: new Date(now()).toISOString(), retryAt: null, lastError: null }));
        } catch (e) {
          await journal.update('events', item.key, current => {
            const latest = current || item;
            const retryCount = (latest.retryCount || 0) + 1;
            const hydrated = item.event.mediaPending && latest.event.media && !latest.event.mediaPending;
            return { ...latest, attemptCount: (latest.attemptCount || 0) + 1, retryCount,
              lastError: String(e.code || 'IMPORT_FAILED'), lastCheckedAt: new Date(now()).toISOString(),
              retryAt: hydrated ? null : new Date(now() + Math.min(60000 * 2 ** Math.min(retryCount - 1, 4), 900000)).toISOString() };
          });
        }
      }
    } catch { /* durable files remain pending; no provider send is possible from this worker */ }
    finally { running = false; }
  }, 5000);
  timer.unref();
  return () => clearIntervalFn(timer);
}
export function startWaapiWorker() { return createWaapiWorker(); }
