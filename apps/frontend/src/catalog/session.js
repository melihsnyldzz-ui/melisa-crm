import { catalogSource, loadCatalog, normalizeLiveCatalogEnvelope } from './source.js';
import { createCatalogPhotoCache } from './photoCache.js';

export const MAX_CATALOG_VIEW_MS = 15 * 60 * 1000;
const diagnosticCodes = new Set(['USER_ERP_SESSION_REQUIRED','CATALOG_SESSION_REVOKED','ERP_LOGIN_REJECTED','ERP_SOURCE_IDENTITY_REQUIRED','ERP_PRODUCT_PERMISSION_REQUIRED','AUTH_TOKEN_EXPIRED','AUTH_TOKEN_INVALID','WHATSAPP_CRM_AUTH_TOKEN_REQUIRED','WHATSAPP_CRM_INTERNAL_ERROR','SESSION_CONTEXT_CHANGED','CATALOG_CONTRACT_INVALID','CATALOG_AUTH_RESPONSE_INVALID','CRM_INVALID_RESPONSE','CRM_REQUEST_TIMEOUT','CRM_RATE_LIMITED','CATALOG_CANCELLED','CRM_CATALOG_SCOPE_REQUIRED','ERP_SIGN_IN_NOT_REQUIRED','INVALID_QUERY']);
export function catalogErrorDiagnostic(error) {
  return {status:Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:null,code:diagnosticCodes.has(error?.code)?error.code:'UNCLASSIFIED_ERROR'};
}
const empty = (state, message, error) => ({ ...catalogSource, state, message, ...(error?{diagnostic:catalogErrorDiagnostic(error)}:{}) });
export function catalogAccessError(error, {authMode='erp'} = {}) {
  if (authMode === 'crm' && error?.status === 401) return empty('blocked', 'CRM oturumu doğrulanamadı. CRM’ye yeniden giriş yapın.', error);
  if (authMode !== 'crm' && error?.status === 401 && ['USER_ERP_SESSION_REQUIRED','CATALOG_SESSION_REVOKED','ERP_LOGIN_REJECTED'].includes(error?.code)) return empty('credentials', error.code === 'ERP_LOGIN_REJECTED' ? 'ERP kullanıcı adı veya şifresi doğrulanamadı. Bilgilerinizi kontrol ederek yeniden giriş yapın.' : 'Katalog oturumu doğrulanamadı. ERP hesabınızla giriş yapın; CRM oturumunuz sona erdiyse önce CRM’ye yeniden bağlanın.', error);
  if (error?.status === 401 || error?.status === 403) return empty('blocked', authMode==='crm'?'Bu CRM hesabının katalog görüntüleme yetkisi doğrulanamadı.':'Bu hesabın katalog erişimi doğrulanamadı. ERP ürün görüntüleme yetkisi ve bağlantı izni kontrol edilmeli.', error);
  if (error?.status === 404 || error?.status === 503) return empty('error', 'ERP katalog bağlantısı şu anda kullanılamıyor. Ürünler yüklenmedi.', error);
  if (error?.status === 429) return empty('error', 'İstek sınırına ulaşıldı. Bir süre sonra yeniden okuyabilirsiniz.', error);
  return empty('error', 'ERP katalog kaydı alınamadı veya yanıt doğrulanamadı. Ürünler yüklenmedi.', error);
}

// Owns only this mounted catalog's CRM/recipient context. No ERP token, password,
// server response or product data is persisted. Mutations are never retried.
export function createCatalogSession({ api, token, isCurrent, onState, onCrmExpired, urlApi, authMode='erp',
  now = Date.now, schedule = setTimeout, unschedule = clearTimeout } = {}) {
  const reads = new Set();
  let generation = 0, active = null, closed = false, expiresAt = 0, timer;
  let state = empty('idle', 'ERP katalog erişimi kontrol ediliyor…');
  const valid = () => !closed && Boolean(token) && isCurrent();
  const crmAuthFailed = error => authMode==='crm'?error?.status===401:error?.code==='AUTH_TOKEN_EXPIRED';
  const current = operation => valid() && active === operation && operation.generation === generation && !operation.controller.signal.aborted;
  const photoCache = createCatalogPhotoCache({
    urlApi,
    isCurrent: () => valid() && state.state === 'ready' && now() < expiresAt,
    fetchPhoto: (id, options) => api.catalogPhoto(token, id, options),
  });
  function cancel() { generation++; active?.controller.abort(); active = null; for (const controller of reads) controller.abort(); reads.clear(); unschedule(timer); timer = undefined; photoCache.clear(); }
  function publish(next) { state = next; if (valid()) onState(next); }
  function expire() {
    cancel(); expiresAt = 0;
    publish(empty(authMode==='crm'?'idle':'credentials', authMode==='crm'?'Katalog görüntüleme süresi doldu. Bağlantıyı kontrol ederek ürünleri yeniden okuyun.':'Katalog görüntüleme süresi doldu. Yeniden erişim kontrolü yapın veya ERP hesabınızla giriş yapın.'));
  }
  function armExpiry(startedAt, serverExpiry) {
    expiresAt = Math.min(startedAt + MAX_CATALOG_VIEW_MS, Number.isFinite(serverExpiry) ? serverExpiry : Infinity);
    if (expiresAt <= now()) throw Object.assign(new Error('Catalog access expired'), {status:401});
    timer = schedule(expire, expiresAt - now());
  }
  function start(kind, credentials) {
    if (!valid()) return Promise.resolve(null);
    if (active?.pending) return active.promise;
    cancel();
    const operation = { generation, controller:new AbortController(), pending:true, promise:null };
    active = operation;
    publish(empty(kind === 'sign-in' ? 'signing-in' : 'loading', kind === 'sign-in' ? 'ERP girişiniz doğrulanıyor…' : 'ERP ürün kaydı okunuyor…'));
    operation.promise = (async () => {
      const startedAt = now(); let authResult;
      try {
        if (kind === 'sign-in') {
          try { authResult = await api.catalogSignIn(token, credentials, {signal:operation.controller.signal}); }
          finally { credentials = null; }
          if (!current(operation)) return null;
        }
        const source = await loadCatalog({token,api,authMode,isCurrent:()=>current(operation),signal:operation.controller.signal});
        if (!current(operation)) return null;
        armExpiry(startedAt, authResult?.expiresAt);
        publish({...source,accessExpiresAt:expiresAt});
        return source;
      } catch (error) {
        if (current(operation)) {
          photoCache.clear();
          if(crmAuthFailed(error)){cancel();publish(empty('blocked','CRM oturumu sona erdi.',error));onCrmExpired?.();return null;}
          // A lost auth response is not a confirmed failure. Offer a read-only
          // check, never another automatic sign-in or a fabricated success.
          const uncertain = kind === 'sign-in' && !error?.status && error?.code !== 'CATALOG_CONTRACT_INVALID';
          publish(uncertain ? empty('uncertain', 'ERP giriş sonucu doğrulanamadı. Giriş otomatik tekrarlanmadı; önce bağlantıyı kontrol edin.',error) : catalogAccessError(error,{authMode}));
        }
        return null;
      } finally { credentials = null; if (current(operation)) operation.pending = false; }
    })();
    return operation.promise;
  }
  async function photo(product) {
    if (!valid() || state.state !== 'ready' || now() >= expiresAt) { if (valid()) expire(); throw new Error('Katalog erişimi sona erdi.'); }
    const own = generation;
    try { return await photoCache.load(product); }
    catch (error) {
      if (valid() && own === generation && (error?.status === 401 || error?.status === 403)) { cancel(); publish(catalogAccessError(error,{authMode})); if(crmAuthFailed(error))onCrmExpired?.(); }
      throw new Error('Ürün fotoğrafı alınamadı. Katalog erişimini kontrol edin.');
    }
  }
  async function verifyOutput() {
    if (!valid() || state.state !== 'ready' || now() >= expiresAt) { if (valid()) expire(); throw new Error('Katalog erişimi sona erdi.'); }
    const own = generation, controller = new AbortController(); reads.add(controller);
    try {
      const result = await api.catalogProducts(token,{page:1,limit:100,...(authMode==='crm'?{authMode}:{}),signal:controller.signal});
      normalizeLiveCatalogEnvelope(result);
      if (!valid() || own !== generation || state.state !== 'ready' || now() >= expiresAt) throw new Error('Katalog bağlamı değişti.');
    } catch (error) {
      if (valid() && own === generation) { cancel(); publish(catalogAccessError(error,{authMode})); if(crmAuthFailed(error))onCrmExpired?.(); }
      throw new Error('Katalog erişimi doğrulanamadı. Çıktı hazırlanmadı.');
    } finally { reads.delete(controller); }
  }
  async function disconnect() {
    if (authMode==='crm') return null;
    if (!valid() || active?.pending) return null;
    cancel(); const operation = { generation, controller:new AbortController(), pending:true }; active = operation;
    publish(empty('disconnecting', 'ERP katalog bağlantısı kapatılıyor…'));
    try {
      const result = await api.catalogSignOut(token,{signal:operation.controller.signal});
      if (!current(operation)) return null;
      publish(empty('disconnected', 'ERP katalog bağlantısı kapatıldı. Yeniden kullanmak için ERP hesabınızla giriş yapın.'));
      return result;
    } catch {
      if (current(operation)) publish(empty('uncertain', 'Yerel katalog temizlendi; sunucudaki çıkış doğrulanamadı. Çıkış otomatik tekrarlanmadı.'));
      return null;
    } finally { if (current(operation)) operation.pending = false; }
  }
  return {
    read: () => start('read'),
    signIn: credentials => authMode==='crm'?Promise.resolve(null):start('sign-in', credentials),
    disconnect, photo, verifyOutput,
    isUsable: () => valid() && state.state === 'ready' && now() < expiresAt,
    close() { cancel(); expiresAt = 0; closed = true; state = empty('closed', ''); },
  };
}
