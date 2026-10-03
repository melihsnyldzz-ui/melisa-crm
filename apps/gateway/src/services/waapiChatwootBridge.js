import { env } from '../config/env.js';
import { chatwootApiRequest } from './chatwootApiService.js';
import { waapiJournal } from './waapiJournal.js';
import { waapiError, WAAPI_INSTANCE, WAAPI_RECIPIENT } from '../providers/waapiProvider.js';

export class WaapiChatwootBridge {
  constructor({ request = chatwootApiRequest, journal = waapiJournal, config = env } = {}) {
    this.request = request; this.journal = journal; this.config = config; this.tail = Promise.resolve();
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
  async once(key, find, create) {
    const id = this.journal.key(key); const previous = await this.journal.get('state', id);
    if (previous?.result) return previous.result;
    const found = await find();
    if (found) { await this.journal.put('state', id, { result: found }); return found; }
    if (previous?.started) throw waapiError('WAAPI_CHATWOOT_IMPORT_UNCONFIRMED');
    await this.journal.put('state', id, { started: true, startedAt: new Date().toISOString() });
    // No automatic retry of an ambiguous Chatwoot write. Reconcile with reads only.
    const result = await create();
    if (!result?.id) throw waapiError('WAAPI_CHATWOOT_IMPORT_UNCONFIRMED');
    await this.journal.put('state', id, { result: { id: result.id, source_id: result.source_id } });
    return result;
  }
  async resolveConversation(phone, conversationId) {
    if (phone !== WAAPI_RECIPIENT) throw waapiError('WAAPI_RECIPIENT_NOT_ALLOWED');
    if (conversationId) {
      if (!/^\d+$/.test(String(conversationId))) throw waapiError('WAAPI_CONVERSATION_INVALID');
      const c = await this.request(`/conversations/${conversationId}`);
      if (c.inbox_id !== 1 || String(c.meta?.sender?.phone_number || '').replace(/\D/g, '') !== phone) throw waapiError('WAAPI_CONVERSATION_MISMATCH');
      return c;
    }
    const contact = await this.once(`contact:${phone}`, async () => {
      const r = await this.request(`/contacts/search?q=${phone}`);
      if (!Array.isArray(r.payload)) throw waapiError('WAAPI_CONTACT_LOOKUP_INVALID');
      const matches = r.payload.filter(c => String(c.phone_number || '').replace(/\D/g, '') === phone);
      if (matches.length > 1) throw waapiError('WAAPI_CONTACT_AMBIGUOUS');
      return matches[0];
    }, async () => {
      const r = await this.request('/contacts', { method: 'POST', body: { inbox_id: 1, name: `WhatsApp ${phone.slice(-4)}`, phone_number: `+${phone}` } });
      return r.payload?.contact;
    });
    return this.once(`conversation:${phone}`, async () => {
      const r = await this.request(`/contacts/${contact.id}/conversations`);
      if (!Array.isArray(r.payload)) throw waapiError('WAAPI_CONVERSATION_LOOKUP_INVALID');
      const matches = r.payload.filter(c => c.inbox_id === 1 && c.status !== 'resolved');
      if (matches.length > 1) throw waapiError('WAAPI_CONVERSATION_AMBIGUOUS');
      return matches[0];
    }, () => this.request('/conversations', { method: 'POST', body: { inbox_id: 1, contact_id: contact.id, status: 'open', assignee_id: null, team_id: null } }));
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
      await this.assertSafe();
      if (event.mediaPending) throw waapiError('WAAPI_MEDIA_PENDING');
      const conversation = await this.resolveConversation(event.phone, conversationId);
      const id = conversation.id;
      await this.resolveConversation(event.phone, id);
      const message = await this.once(`message:${event.providerMessageId}`,
        () => this.findMessage(id, event.providerMessageId),
        () => this.request(`/conversations/${id}/messages`, {
          method: 'POST',
          body: { content: event.text, message_type: event.direction, private: false,
            source_id: event.providerMessageId, content_attributes: { provider_message_id: event.providerMessageId, provider: 'waapi',
              provider_timestamp: event.timestamp || null, provider_accepted: event.direction === 'outgoing' } },
          media: event.media,
        }));
      return { confirmed: true, chatwootMessageId: String(message.id), providerMessageId: event.providerMessageId };
    });
  }
  async process(event) {
    if (!event.providerMessageId) return;
    if (event.event === 'message_ack') {
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
