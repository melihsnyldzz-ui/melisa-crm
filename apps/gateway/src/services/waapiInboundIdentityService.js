import { env } from '../config/env.js';
import { WAAPI_RECIPIENT, waapiError, waapiProvider } from '../providers/waapiProvider.js';

export function isWaapiPhone(phone) {
  return typeof phone === 'string' && /^[1-9]\d{6,14}$/.test(phone);
}

export function assertWaapiPhoneScope(phone, direction, config = env.waapi) {
  if (!isWaapiPhone(phone)) throw waapiError('WAAPI_INBOUND_IDENTITY_UNCONFIRMED');
  if (!['incoming', 'outgoing'].includes(direction)) throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  // Incoming scope is independent of the unchanged outbound trial allowlist.
  if ((direction === 'outgoing' || config.incomingTestOnly) && phone !== WAAPI_RECIPIENT) {
    throw waapiError('WAAPI_RECIPIENT_NOT_ALLOWED', false, 403);
  }
  return phone;
}

export async function resolveWaapiInboundIdentity(event, { provider = waapiProvider, config = env.waapi } = {}) {
  if (event.direction !== 'incoming') {
    assertWaapiPhoneScope(event.phone, event.direction, config);
    return event;
  }
  const peer = event.peerJid;
  // Legacy already-journaled trial events contain a validated phone, but no peerJid.
  if (!peer) {
    if (event.phone !== WAAPI_RECIPIENT) throw waapiError('WAAPI_INBOUND_IDENTITY_UNCONFIRMED');
    assertWaapiPhoneScope(event.phone, 'incoming', config);
    return event;
  }
  if (typeof event.providerMessageId !== 'string' || !event.providerMessageId.startsWith(`false_${peer}_`)) {
    throw waapiError('WAAPI_EVENT_INVALID', false, 400);
  }
  let phone;
  if (/^[1-9]\d{6,14}@c\.us$/.test(peer)) phone = peer.slice(0, -5);
  else if (/^\d{10,20}@lid$/.test(peer)) {
    // Only the instance's authenticated get-lid result can map an opaque LID to a phone.
    phone = await provider.resolveIncomingPhone(peer);
  } else throw waapiError('WAAPI_INBOUND_IDENTITY_UNCONFIRMED');
  assertWaapiPhoneScope(phone, 'incoming', config);
  if (event.phone != null && event.phone !== phone) throw waapiError('WAAPI_INBOUND_IDENTITY_CONFLICT', false, 409);
  return { ...event, phone };
}
