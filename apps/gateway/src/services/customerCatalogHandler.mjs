const json = (data, status = 200) => Response.json({ success: true, data }, { status, headers: {
  'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
const fail = (code, statusCode) => { throw Object.assign(new Error(code), { code, statusCode }); };
const messages = {
  CUSTOMER_CATALOG_SESSION_INVALID: 'Bağlantınızın süresi dolmuş veya iptal edilmiş. WhatsApp’taki güncel bağlantıyı yeniden açın.',
  CUSTOMER_CATALOG_PRICE_CHANGED: 'Ürün bilgisi veya fiyat güncellendi. Sepetinizi kontrol edip tekrar onaylayın.',
  CUSTOMER_CATALOG_REVISION_CONFLICT: 'Sepetiniz güncellendi. Son seçimleri yükleyip yeniden kontrol edin.',
  CUSTOMER_CATALOG_STOCK_LIMIT: 'Seçtiğiniz tam seri miktarı şu an uygun değil. Miktarı azaltın veya modeli çıkarın.',
  CUSTOMER_CATALOG_ORDER_LOCKED: 'Seçiminizin kayıt sonucu kontrol ediliyor. Sipariş durumunu yeniden kontrol edin.',
  CUSTOMER_CATALOG_PILOT_DISABLED: 'Bu kişisel katalog denemesi henüz açılmadı. WhatsApp görüşmenizden bilgi alabilirsiniz.',
  CUSTOMER_CATALOG_OPERATOR_REQUIRED: 'CRM oturumunun yeniden doğrulanması gerekiyor. WhatsApp görüşmenizden bilgi alabilirsiniz.',
  CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED: 'Bu görüşme için katalog bağlantısı oluşturma yetkiniz doğrulanamadı.',
};
async function body(request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) fail('CUSTOMER_CATALOG_REQUEST_TOO_LARGE', 413);
  try { return JSON.parse(raw); } catch { fail('CUSTOMER_CATALOG_REQUEST_INVALID', 400); }
}
function capability(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '');
  if (!match) fail('CUSTOMER_CATALOG_SESSION_INVALID', 401);
  return match[1];
}

/** Shared Request handler mounted by the reviewed TEST UI proxy; never starts a listener. */
export function createCustomerCatalogHandler({ service, authorizeStaff, linkOrigin } = {}) {
  if (!service) throw Error('CUSTOMER_CATALOG_SERVICE_REQUIRED');
  return async request => {
    try {
      const url = new URL(request.url), method = request.method;
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) fail('CUSTOMER_CATALOG_ORIGIN_REQUIRED', 403);
      const contextPath = /^\/crm\/customer-catalog\/sessions\/([0-9a-f-]{36})\/sales-context$/.exec(url.pathname);
      if (contextPath) {
        if (method !== 'GET' || url.search) fail('CUSTOMER_CATALOG_REQUEST_INVALID', 400);
        if (typeof authorizeStaff !== 'function') fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
        return json(await service.staffSalesContext(await authorizeStaff(request), contextPath[1]));
      }
      const staffPath = /^\/crm\/customer-catalog\/sessions(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname);
      if (staffPath) {
        const listing = method === 'GET' && !staffPath[1];
        if (listing ? [...url.searchParams.keys()].join(',') !== 'conversationId' || url.searchParams.getAll('conversationId').length !== 1 : url.search) fail('CUSTOMER_CATALOG_REQUEST_INVALID', 400);
        if (typeof authorizeStaff !== 'function') fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
        const actor = await authorizeStaff(request);
        if (listing) return json(await service.staffSessions(actor, url.searchParams.get('conversationId')));
        if (method === 'POST' && !staffPath[1]) {
          const issued = await service.issue(actor, await body(request));
          return json({ ...issued, ...(linkOrigin ? { linkOrigin } : {}) }, 201);
        }
        if (method === 'GET' && staffPath[1]) return json(await service.staffRead(actor, staffPath[1]));
        if (method === 'DELETE' && staffPath[1]) return json(await service.revoke(actor, staffPath[1]));
        fail('CUSTOMER_CATALOG_METHOD_NOT_ALLOWED', 405);
      }
      if (!url.pathname.startsWith('/customer-catalog/')) fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
      const token = capability(request);
      if (url.pathname !== '/customer-catalog/products' && url.search) fail('CUSTOMER_CATALOG_REQUEST_INVALID', 400);
      if (method === 'GET' && url.pathname === '/customer-catalog/session') return json(await service.session(token));
      if (method === 'GET' && url.pathname === '/customer-catalog/products') {
        if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) fail('CUSTOMER_CATALOG_FILTER_INVALID', 400);
        return json(await service.products(token, Object.fromEntries(url.searchParams)));
      }
      const photo = /^\/customer-catalog\/products\/(erp-[1-9]\d*)\/photo$/.exec(url.pathname);
      if (method === 'GET' && photo) return await service.photo(token, photo[1]);
      if (method === 'PUT' && url.pathname === '/customer-catalog/cart') return json(await service.updateCart(token, await body(request)));
      if (method === 'POST' && url.pathname === '/customer-catalog/order') return json(await service.submitOrder(token, await body(request)));
      if (method === 'GET' && url.pathname === '/customer-catalog/order') return json(await service.order(token));
      fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
    } catch (error) {
      const code = /^CUSTOMER_CATALOG_[A-Z_]+$/.test(error?.code || '') ? error.code : 'CUSTOMER_CATALOG_SOURCE_UNAVAILABLE';
      const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 503;
      return Response.json({ success: false, error: { code, message: messages[code] || 'Katalog işlemi şu an tamamlanamadı. Lütfen tekrar kontrol edin.' } }, { status, headers: {
        'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
    }
  };
}
