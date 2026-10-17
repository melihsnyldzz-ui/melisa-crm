export const CUSTOMER_CAPABILITY_KEY = 'melisa.crm.customer-product-request.capability.v1';
export const CUSTOMER_OPERATION_KEY = 'melisa.crm.customer-product-request.operation.v1';
export const MAX_ITEMS = 50;
export const MAX_QUANTITY = 9999;
const capabilityPattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function newOperationId(cryptoApi=globalThis.crypto) {
  // getRandomValues also supports the approved HTTP LAN TEST; no insecure randomness fallback.
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('Talebi göndermek için güncel bir tarayıcı kullanın.');
  const bytes=cryptoApi.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function productId(value) {
  if (typeof value !== 'string' || !/^(?:vega|erp)-[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value.split('-')[1]))) throw new Error('Ürün bilgisi doğrulanamadı.');
  return value;
}
export function quantity(value) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_QUANTITY) throw new Error('Adet 1 ile 9999 arasında olmalı.');
  return number;
}
export function draftItems(items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new Error('En fazla 50 ürün seçebilirsiniz.');
  const seen = new Set();
  return items.map(item => {
    const id = productId(item.productId);
    if (seen.has(id)) throw new Error('Aynı ürün iki kez eklenemez.');
    seen.add(id);
    return {productId: id, quantity: quantity(item.quantity)};
  });
}
export function customerStorage() {
  try { return globalThis.window?.sessionStorage || null; } catch { return null; }
}
export function consumeCapability({location, history, storage = customerStorage()}) {
  const fragment = String(location?.hash || '');
  let capability = '';
  if (fragment) {
    // A newly opened link replaces this customer context; the fragment is never retained in the address bar.
    history?.replaceState(null, '', `${location.pathname || '/katalog'}${location.search || ''}`);
    const values = new URLSearchParams(fragment.slice(1));
    if ([...values.keys()].length === 1 && values.getAll('request').length === 1) capability = values.get('request') || '';
    try { const previous=storage?.getItem(CUSTOMER_CAPABILITY_KEY);storage?.removeItem(CUSTOMER_CAPABILITY_KEY);if(previous!==capability||!capabilityPattern.test(capability))storage?.removeItem(CUSTOMER_OPERATION_KEY); } catch { /* Server draft remains authoritative. */ }
    if (capabilityPattern.test(capability)) { try { storage?.setItem(CUSTOMER_CAPABILITY_KEY, capability); } catch { /* Allow this page to read in memory. */ } }
    else capability = '';
  } else {
    try { capability = storage?.getItem(CUSTOMER_CAPABILITY_KEY) || ''; } catch { capability = ''; }
  }
  return capabilityPattern.test(capability) ? capability : '';
}
export function clearCustomerStorage(storage = customerStorage()) {
  try { storage?.removeItem(CUSTOMER_CAPABILITY_KEY); storage?.removeItem(CUSTOMER_OPERATION_KEY); } catch { /* No other CRM session key is touched. */ }
}
export function operationStore(storage = customerStorage()) {
  return {
    read(sessionId) {
      try { const value = JSON.parse(storage?.getItem(CUSTOMER_OPERATION_KEY) || 'null'); return value?.sessionId === sessionId && uuidPattern.test(value?.operationId || '') ? value.operationId : null; } catch { return null; }
    },
    write(sessionId, operationId) {
      if (!uuidPattern.test(operationId || '') || typeof sessionId !== 'string') throw new Error('Talep kaydı hazırlanamadı.');
      if (!storage) throw new Error('Talebi göndermek için bu sayfayı normal tarayıcıda yeniden açın.');
      const serialized = JSON.stringify({sessionId, operationId});
      try { storage.setItem(CUSTOMER_OPERATION_KEY, serialized); if (storage.getItem(CUSTOMER_OPERATION_KEY) !== serialized) throw new Error('Storage unavailable'); }
      catch { throw new Error('Talebi göndermek için bu sayfayı normal tarayıcıda yeniden açın.'); }
    },
    clear(sessionId) { if (this.read(sessionId)) { try { storage?.removeItem(CUSTOMER_OPERATION_KEY); } catch { /* A confirmed server record prevents resubmission. */ } } },
  };
}
export function customerError(error, submitting = false) {
  if ([401,403,410].includes(error?.status)) return 'Bu katalog bağlantısı artık kullanılamıyor. Satış temsilcinizden yeni bağlantı isteyin.';
  if (error?.status === 429) return 'Biraz bekleyip yeniden deneyin. Seçimleriniz korunuyor.';
  if (error?.status === 409) return 'Seçimleriniz değişmiş olabilir. Kaydı yeniden kontrol edin.';
  if (submitting) return 'Talebin kaydı henüz doğrulanamadı. Yeniden denediğinizde aynı talep kontrol edilecek.';
  if (error?.status >= 500 || error?.name === 'TypeError' || error?.name === 'AbortError') return 'Şu anda bağlantı kurulamadı. Seçimlerinizi yeniden kontrol ederek devam edin.';
  return error?.publicMessage || 'İşlem tamamlanamadı. Yeniden deneyin.';
}
