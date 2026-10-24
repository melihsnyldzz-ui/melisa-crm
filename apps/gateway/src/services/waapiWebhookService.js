import { WAAPI_INSTANCE, WAAPI_RECIPIENT, waapiError, waapiProvider, isWaapiTrialPeer } from '../providers/waapiProvider.js';
import { waapiJournal } from './waapiJournal.js';
import { assertMediaFormat } from '../utils/mediaFormatValidation.js';
import { env } from '../config/env.js';

const events = new Set(['message', 'message_create', 'message_ack', 'ready', 'disconnected', 'auth_failure']);
const mediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export function normalizeWaapiMedia(media) {
  if (!media) return null;
  const mimeType = String(media.mimetype || '').split(';')[0].trim().toLowerCase();
  // Webhook inline media only. Never fetch an untrusted remote URL or follow redirects.
  if (!mediaTypes.has(mimeType) || typeof media.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(media.data)
    || media.data.length > 13981016 || media.data.length % 4 !== 0) throw waapiError('WAAPI_MEDIA_REJECTED', false, 400);
  const bytes = Buffer.from(media.data, 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.toString('base64') !== media.data) throw waapiError('WAAPI_MEDIA_REJECTED', false, 400);
  try { assertMediaFormat(bytes, mimeType); } catch { throw waapiError('WAAPI_MEDIA_REJECTED', false, 400); }
  return { mimeType, data: media.data, byteLength: bytes.length, fileName: String(media.filename || 'attachment').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120) };
}
const jidValue = value => typeof value === 'string' ? value : value?._serialized;
export function normalizeWaapiEvent(body, config = env.waapi) {
  if (String(body?.instanceId) !== WAAPI_INSTANCE) throw waapiError('WAAPI_INSTANCE_MISMATCH', false, 403);
  if (!events.has(body.event)) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  if (['ready', 'disconnected', 'auth_failure'].includes(body.event)) return { instanceId: WAAPI_INSTANCE, event: body.event };
  const m = body.data?.message; const raw = m?._data || {}; const id = m?.id || raw.id;
  const fromMe = m?.fromMe ?? id?.fromMe;
  const peer = fromMe === true ? (m?.to || raw.to || id?.remote) : (m?.from || raw.from || id?.remote);
  const jid = jidValue(peer);
  if (m?.isStatus || raw.isStatus || m?.broadcast || raw.broadcast || m?.isGroupMsg || raw.isGroupMsg
    || !/^(?:[1-9]\d{6,14}@c\.us|\d{10,20}@lid)$/.test(jid || '')) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  // Outgoing echoes and ACKs retain their original trial-recipient boundary.
  if ((fromMe === true || body.event === 'message_ack') && !isWaapiTrialPeer(jid, config)) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  if (fromMe === false && config.incomingTestOnly && !isWaapiTrialPeer(jid, config)) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  const serialized = id?._serialized;
  if (typeof fromMe !== 'boolean' || typeof serialized !== 'string' || serialized.length > 1024
    || !serialized.startsWith(`${fromMe}_${jid}_`) || serialized.length <= `${fromMe}_${jid}_`.length
    || id.fromMe !== fromMe || jidValue(id.remote) !== jid) throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  // Providers expose the same identity in both the public message and its raw data.
  // A contradictory supplied field is never resolved by choosing one of the two.
  for (const supplied of [m?.fromMe, raw.fromMe, raw.id?.fromMe]) {
    if (supplied !== undefined && supplied !== fromMe) throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  }
  for (const supplied of [fromMe ? m?.to : m?.from, fromMe ? raw.to : raw.from, raw.id?.remote]) {
    if (supplied !== undefined && jidValue(supplied) !== jid) throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  }
  if (raw.id?._serialized !== undefined && raw.id._serialized !== serialized) throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  const phone = fromMe || body.event === 'message_ack' ? WAAPI_RECIPIENT : (jid.endsWith('@c.us') ? jid.slice(0, -5) : null);
  if (!fromMe && config.incomingTestOnly && phone && phone !== WAAPI_RECIPIENT) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  const ack = body.data.acknowledged ?? m.ack ?? raw.ack;
  const hasMedia = Boolean(m.hasMedia || ['image', 'audio', 'ptt', 'video', 'document', 'sticker'].includes(m.type || raw.type));
  const timestamp = Number(m.timestamp ?? raw.t);
  return { instanceId: WAAPI_INSTANCE, event: body.event, providerMessageId: id._serialized,
    direction: fromMe ? 'outgoing' : 'incoming', phone, peerJid: jid, text: String(m.body ?? raw.body ?? '').slice(0, 20000),
    timestamp: Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= 8640000000000 ? timestamp : null,
    ack: Number.isInteger(ack) && ack >= -1 && ack <= 4 ? ack : null,
    media: normalizeWaapiMedia(body.data.media), mediaPending: hasMedia && !body.data.media };
}
export async function acceptWaapiWebhook(body, { journal = waapiJournal, provider = waapiProvider, config = env.waapi } = {}) {
  // Durable acceptance comes before any provider identity lookup; the worker retries it.
  const event = normalizeWaapiEvent(body, config);
  if (event.event === 'ignored') return { accepted: true, ignored: true };
  const result = await journal.accept(event);
  // A ready event invalidates cached status; it is never proof of current readiness.
  if (['ready', 'disconnected', 'auth_failure'].includes(event.event)) provider.invalidate();
  return result;
}
