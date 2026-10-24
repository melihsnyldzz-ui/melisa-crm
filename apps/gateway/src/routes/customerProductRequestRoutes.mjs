const fail = (code, statusCode = 400) => { throw Object.assign(new Error(code), { code, statusCode }); };
const PREFIX = '/customer-product-requests';
const STAFF_PREFIX = '/crm/customer-product-requests';
const bodyLimit = 16 * 1024;

/** Uses the normal staff verifier only on staff routes; customer capabilities never become CRM staff. */
export function createCustomerProductRequestRouter({ Router, service, verifyStaff, allowedOrigins = [] } = {}) {
  if (typeof Router !== 'function' || !service || typeof verifyStaff !== 'function' || !Array.isArray(allowedOrigins)
    || allowedOrigins.some(value => { try { const url = new URL(value); return url.origin !== value || !!url.username || !!url.password || !['http:', 'https:'].includes(url.protocol); } catch { return true; } })) throw Error('CUSTOMER_REQUEST_ROUTER_CONFIG_INVALID');
  const router = Router(), origins = new Set(allowedOrigins);
  const token = req => {
    const authorization = req.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
    return authorization.slice(7);
  };
  const mutation = req => {
    if (!origins.has(req.get('origin'))) fail('CUSTOMER_REQUEST_ORIGIN_REQUIRED', 403);
    if (!/^application\/json(?:\s*;|$)/i.test(req.get('content-type') || '') || Buffer.byteLength(JSON.stringify(req.body) || '') > bodyLimit) fail('CUSTOMER_REQUEST_BODY_INVALID');
    if (Object.keys(req.query || {}).length) fail('CUSTOMER_REQUEST_QUERY_INVALID');
  };
  const noQuery = req => { if (Object.keys(req.query || {}).length) fail('CUSTOMER_REQUEST_QUERY_INVALID'); };
  const response = fn => async (req, res, next) => {
    res.setHeader('cache-control', 'no-store'); res.setHeader('referrer-policy', 'no-referrer'); res.setHeader('x-content-type-options', 'nosniff');
    try {
      if (!service.isEnabled()) fail('CUSTOMER_REQUEST_DISABLED', 503);
      const result = await fn(req);
      if (res.destroyed) return;
      if (result?.bytes instanceof Uint8Array) {
        res.setHeader('content-type', result.mime); res.setHeader('content-disposition', 'inline'); return res.status(200).send(Buffer.from(result.bytes));
      }
      if (result?.data && result?.meta) return res.status(200).json({ success: true, data: result.data, meta: result.meta });
      return res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  };
  router.get(`${PREFIX}/session`, response(req => { noQuery(req); return service.session(token(req)); }));
  router.get(`${PREFIX}/products`, response(req => service.products(token(req), req.query)));
  router.get(`${PREFIX}/products/:id/photo`, response(req => { noQuery(req); return service.photo(token(req), req.params.id); }));
  router.put(`${PREFIX}/draft`, response(req => { mutation(req); return service.saveDraft(token(req), req.body); }));
  router.post(`${PREFIX}/submit`, response(req => { mutation(req); return service.submit(token(req), req.body); }));
  router.post(`${STAFF_PREFIX}/sessions`, response(async req => { mutation(req); return service.issue(await verifyStaff(req), req.body); }));
  router.post(`${STAFF_PREFIX}/sessions/:id/revoke`, response(async req => {
    mutation(req); if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) fail('CUSTOMER_REQUEST_BODY_INVALID');
    return service.revoke(await verifyStaff(req), req.params.id);
  }));
  router.get(STAFF_PREFIX, response(async req => {
    if (Object.keys(req.query || {}).length !== 1 || typeof req.query.conversationId !== 'string') fail('CUSTOMER_REQUEST_QUERY_INVALID');
    return service.staffList(await verifyStaff(req), req.query.conversationId);
  }));
  router.get(`${STAFF_PREFIX}/:id`, response(async req => { noQuery(req); return service.staffGet(await verifyStaff(req), req.params.id); }));
  return router;
}
