// Local-only pilot state. This module has no network, CRM send or ERP write API.
const ROOM_PATTERN = /^MelisaPilot-[a-f0-9]{32}$/;
export const JITSI_ORIGIN = 'https://meet.jit.si';
export const JITSI_JOIN_OPTIONS = '#config.startWithAudioMuted=true&config.startWithVideoMuted=true';
export function createRoomName(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('Güvenli rastgele bağlantı üretilemedi.');
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `MelisaPilot-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
export function roomURL(room, { join = false } = {}) {
  if (!ROOM_PATTERN.test(room || '')) throw new Error('Görüşme bağlantısı geçersiz.');
  return `${JITSI_ORIGIN}/${room}${join ? JITSI_JOIN_OPTIONS : ''}`;
}
export function invitationPreview(room) {
  // Recipient identity is shown in the CRM only, never inserted in the URL or invitation.
  return `Merhaba, Melisa Baby görüntülü ürün görüşmesine bu bağlantıdan katılabilirsiniz:\n${roomURL(room, { join: true })}\n\nBağlantıyı açtığınızda kamera ve mikrofon tercihlerinizi kontrol edin.`;
}
export function createPilotSession({ isCurrent, cryptoApi } = {}) {
  let closed = false, room = '';
  const active = () => {
    if (closed) return false;
    if (typeof isCurrent !== 'function' || !isCurrent()) { closed = true; room = ''; return false; }
    return true;
  };
  return {
    current() { return active() ? room : ''; },
    prepare() {
      if (!active()) throw new Error('Görüşme bağlamı değişti. Paneli yeniden açın.');
      // Repeated clicks never create several rooms. No external room is contacted here.
      if (!room) room = createRoomName(cryptoApi);
      return room;
    },
    close() { closed = true; room = ''; },
    isActive: active,
  };
}
export function bindPilotNavigation(target, close) {
  // Do not add history entries: Back/Forward can only dismiss, never recreate a room.
  const dismiss = () => close();
  target.addEventListener('popstate', dismiss);
  target.addEventListener('pagehide', dismiss);
  return () => {
    target.removeEventListener('popstate', dismiss);
    target.removeEventListener('pagehide', dismiss);
  };
}
export function quoteDraftProducts(products, selectedIds) {
  const selected = new Set(selectedIds.map(String));
  return products.filter(product => selected.has(String(product.id))).map(product => ({
    id: String(product.id), code: String(product.code || ''), name: String(product.name || ''),
  }));
}
