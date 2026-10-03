import { WAAPI_INSTANCE, WAAPI_RECIPIENT, waapiError, waapiProvider, isWaapiTrialPeer } from '../providers/waapiProvider.js';
import { waapiJournal } from './waapiJournal.js';
import { assertMediaFormat } from '../utils/mediaFormatValidation.js';

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
export function normalizeWaapiEvent(body, config) {
  if (String(body?.instanceId) !== WAAPI_INSTANCE) throw waapiError('WAAPI_INSTANCE_MISMATCH', false, 403);
  if (!events.has(body.event)) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  if (['ready', 'disconnected', 'auth_failure'].includes(body.event)) return { instanceId: WAAPI_INSTANCE, event: body.event };
  const m = body.data?.message; const raw = m?._data || {}; const id = m?.id || raw.id;
  const fromMe = m?.fromMe ?? id?.fromMe;
  const peer = fromMe === true ? (m?.to || raw.to || id?.remote) : (m?.from || raw.from || id?.remote);
  const jid = typeof peer === 'string' ? peer : peer?._serialized;
  if (m?.isStatus || m?.broadcast || raw.broadcast || !isWaapiTrialPeer(jid, config)) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  if (typeof fromMe !== 'boolean' || !id?._serialized || id.fromMe !== fromMe || id.remote !== jid) throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  const phone = WAAPI_RECIPIENT;
  if (phone !== WAAPI_RECIPIENT) return { instanceId: WAAPI_INSTANCE, event: 'ignored' };
  const ack = body.data.acknowledged ?? m.ack ?? raw.ack;
  const hasMedia = Boolean(m.hasMedia || ['image', 'audio', 'ptt', 'video', 'document', 'sticker'].includes(m.type || raw.type));
  const timestamp = Number(m.timestamp ?? raw.t);
  return { instanceId: WAAPI_INSTANCE, event: body.event, providerMessageId: id._serialized,
    direction: fromMe ? 'outgoing' : 'incoming', phone, text: String(m.body ?? raw.body ?? '').slice(0, 20000),
    timestamp: Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= 8640000000000 ? timestamp : null,
    ack: Number.isInteger(ack) && ack >= -1 && ack <= 4 ? ack : null,
    media: normalizeWaapiMedia(body.data.media), mediaPending: hasMedia && !body.data.media };
}
export async function acceptWaapiWebhook(body, { journal = waapiJournal, provider = waapiProvider } = {}) {
  const event = normalizeWaapiEvent(body);
  if (event.event === 'ignored') return { accepted: true, ignored: true };
  const result = await journal.accept(event);
  // A ready event invalidates cached status; it is never proof of current readiness.
  if (['ready', 'disconnected', 'auth_failure'].includes(event.event)) provider.invalidate();
  return result;
}
