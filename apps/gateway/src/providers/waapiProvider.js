import { env } from '../config/env.js';

export const WAAPI_INSTANCE = '105185';
export const WAAPI_RECIPIENT = '19999999999';
// Operator-provisioned mapping, verified through this instance's get-lid endpoint.
export function isWaapiTrialPeer(jid, config = env.waapi) {
  return jid === WAAPI_RECIPIENT + '@c.us' || (/^\d{10,20}@lid$/.test(config.verifiedRecipientLid || '') && jid === config.verifiedRecipientLid);
}
export function waapiError(code, transportAttempted = false, statusCode = 503) {
  return Object.assign(new Error(`WAAPI: ${code}`), {
    code: `WHATSAPP_CRM_${code}`, statusCode, meta: { transportAttempted },
  });
}

export class WaapiProvider {
  constructor({ config = env.waapi, fetchFn = (...args) => fetch(...args), now = Date.now } = {}) {
    this.config = config; this.fetchFn = fetchFn; this.now = now;
    this.cached = null; this.pending = null; this.calls = []; this.generation = 0;
  }
  invalidate() { this.cached = null; this.generation++; }
  connected() { return Boolean(this.cached?.value.providerConnected && this.now() - this.cached.at < 60000); }
  async request(path, body) {
    if (!this.config.apiToken || this.config.instanceId !== WAAPI_INSTANCE) throw waapiError('WAAPI_NOT_CONFIGURED');
    this.calls = this.calls.filter(t => t > this.now() - 300000);
    // Reserve quota for the operator/panel; never automatically retry provider calls.
    if (this.calls.length >= 8) throw waapiError('WAAPI_RATE_LIMIT', false, 429);
    this.calls.push(this.now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs || 15000);
    try {
      const response = await this.fetchFn(`https://waapi.app/api/v1/instances/${WAAPI_INSTANCE}/client/${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiToken}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const error = waapiError(`WAAPI_HTTP_${response.status}`, Boolean(body), response.status === 429 ? 429 : 502);
        error.meta.status = response.status; throw error;
      }
      return await response.json();
    } catch (error) {
      if (String(error.code || '').startsWith('WHATSAPP_CRM_')) throw error;
      throw waapiError('WAAPI_UNCONFIRMED', Boolean(body), 502);
    } finally { clearTimeout(timer); }
  }
  async getStatus() {
    if (this.cached && this.now() - this.cached.at < 60000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const generation = this.generation;
      let providerConnected = false; let reason = 'WAAPI_NOT_CONFIGURED';
      try {
        const result = await this.request('status');
        providerConnected = result.status === 'success' && result.clientStatus?.status === 'success'
          && String(result.clientStatus.instanceId) === WAAPI_INSTANCE && result.clientStatus.instanceStatus === 'ready';
        reason = providerConnected ? null : 'WAAPI_NOT_READY';
      } catch (error) { reason = error.code; }
      if (generation !== this.generation) { providerConnected = false; reason = 'WAAPI_STATUS_INVALIDATED'; }
      const value = { provider: 'waapi', providerConnected, checkedAt: new Date(this.now()).toISOString(), reason };
      this.cached = { at: this.now(), value }; return value;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async sendMessage({ phone, text, media, remoteJid }) {
    if (phone !== WAAPI_RECIPIENT || /@(g.us|broadcast|newsletter)$/.test(remoteJid || '')) throw waapiError('WAAPI_RECIPIENT_NOT_ALLOWED', false, 403);
    if (media) throw waapiError('WAAPI_PILOT_TEXT_ONLY', false, 400);
    if (!(await this.getStatus()).providerConnected) throw waapiError('WAAPI_NOT_READY');
    const result = await this.request('action/send-message', { chatId: `${phone}@c.us`, message: text });
    if (result.status !== 'success' || result.data?.status !== 'success'
      || String(result.data?.instanceId) !== WAAPI_INSTANCE) throw waapiError('WAAPI_NESTED_REJECTED', true, 502);
    const message = result.data.data;
    const id = message?.id || message?._data?.id;
    if (!id?._serialized || id.fromMe !== true || !isWaapiTrialPeer(id.remote, this.config)) throw waapiError('WAAPI_MESSAGE_ID_UNCONFIRMED', true, 502);
    return { provider: 'waapi', providerMessageId: id._serialized, text, direction: 'outgoing',
      messageType: 'text', sentAt: new Date(this.now()).toISOString(), status: 'accepted',
      providerAccepted: true, delivered: false, read: false };
  }
}
export const waapiProvider = new WaapiProvider();
