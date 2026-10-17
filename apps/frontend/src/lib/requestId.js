// HTTP LAN browsers expose getRandomValues even when randomUUID is unavailable.
export function newRequestId(cryptoApi=globalThis.crypto) {
  try {
    if(typeof cryptoApi?.getRandomValues==='function') {
      const bytes=cryptoApi.getRandomValues(new Uint8Array(16));
      bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
    if(typeof cryptoApi?.randomUUID==='function') {
      const id=cryptoApi.randomUUID();
      if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return id;
    }
  } catch { /* Never fall back to weak or predictable randomness. */ }
  throw new Error('İşlem için güvenli rastgele kimlik üretilemedi. Güncel bir tarayıcı kullanın.');
}
