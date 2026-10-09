// Approved single-CRM-login reader. No listener, ERP login, credential store, cache or business write.
import { ERP_ORIGIN, ERP_DATABASE, ERP_PRODUCT_DATABASE } from './erpSourceContract.mjs';
const PREFIX = '/crm/catalog/products';
// Internal only: router rechecks the read lease immediately before committing response bytes.
export const CATALOG_RESPONSE_GUARD = Symbol('catalog-response-guard');
const fail = (status, code) => Response.json({ success: false, error: { code, message: code } }, { status, headers: { 'cache-control': 'no-store' } });
const identity = id => (typeof id === 'string' && id.trim()) || (Number.isSafeInteger(id) && id > 0);
const sameId = (a, b) => identity(a) && identity(b) && String(a) === String(b);
async function bytes(response, max) {
  if (!response.body) throw Error('EMPTY_BODY');
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    length += value.length; if (length > max) { await reader.cancel(); throw Error('LIMIT'); } chunks.push(value);
  } } finally { reader.releaseLock(); }
  const all = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; } return all;
}
function numberOrNull(value) {
  // Native API emits numbers. Never coerce strings, empty values or missing fields into zero.
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
}
function photoPath(row) {
  const images = Array.isArray(row.images) ? row.images.filter(x => x?.isActive === true && typeof x.filePath === 'string') : [];
  images.sort((a, b) => Number(b.isPrimary === true) - Number(a.isPrimary === true) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id || 0) - Number(b.id || 0));
  const raw = typeof row.imageUrl === 'string' && row.imageUrl ? row.imageUrl : images[0]?.filePath;
  // No caller URLs, query tokens, remote origins, traversal, encoded separators or filesystem paths.
  if (typeof raw !== 'string' || raw.length > 500 || !/^\/uploads\/vega-products\/[A-Za-z0-9][A-Za-z0-9 ._-]*\.(?:jpe?g|png|webp)$/i.test(raw)
    || raw.includes('..')) return null;
  // Existing 4100 filenames include spaces. Encode ONLY a validated single basename.
  // Percent escapes, slashes, query delimiters and non-ASCII characters remain rejected.
  return '/uploads/vega-products/' + encodeURIComponent(raw.slice('/uploads/vega-products/'.length));
}
function sanitize(row) {
  if (!row || typeof row.id!=='string' || !/^vega-[1-9][0-9]*$/.test(row.id) || !Number.isSafeInteger(Number(row.id.slice(5))) || typeof row.stockCode !== 'string' || !row.stockCode.trim()
    || typeof row.productName !== 'string' || !row.productName.trim()) throw Error('PRODUCT_CONTRACT');
  if (!(row.isPassive === false || row.isActive === true)) throw Error('ACTIVE_PRODUCT_REQUIRED');
  const price = numberOrNull(row.salePrice); const qty = numberOrNull(row.stockQuantity);
  const currency = typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
  // Source normal DTO has Number(raw || 0); a zero may be coerced missing data. Keep it unverified.
  const priceStatus = price === null || !currency ? 'unknown' : price < 0 ? 'invalid' : price === 0 ? 'zero-unverified' : 'recorded';
  return { id: String(row.id), stockCode: row.stockCode, productName: row.productName,
    brand: typeof row.brand === 'string' ? row.brand : null, category: typeof row.category === 'string' ? row.category : null,
    salePrice: price, currency, priceStatus, priceBasis: 'per-item', priceBasisStatus: 'user-confirmed',
    stockQuantity: qty, stockStatus: qty === null ? 'unknown' : qty === 0 ? 'zero-unverified' : qty > 0 ? 'in-stock' : 'not-positive',
    photoPath: photoPath(row) ? `${PREFIX}/${encodeURIComponent(String(row.id))}/photo` : null,
    photoStatus: photoPath(row) ? 'guarded-path' : 'unavailable',
    sourceUpdatedAt: null, pricedDocumentEligible: false, pricedDocumentBlockReason: 'SOURCE_FRESHNESS_UNVERIFIED' };
}
export function isTestCatalogPhotoOrigin(value){
  try{const url=new URL(value);return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&(url.port==='62402'||process.env.CRM_ISOLATED_PREPARATION==='true'&&url.hostname==='127.0.0.1'&&url.port==='62602')&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash}catch{return false}
}
export function createCatalogBridge({ deploymentApproved = false, transport, authorizeCrm, resolveCrmReadSession, now = Date.now, maxReadAgeMs = 15000, photoCrmAuthorization = false } = {}) {
  if(photoCrmAuthorization&&!isTestCatalogPhotoOrigin(ERP_ORIGIN))throw Error('TEST_PHOTO_AUTH_ORIGIN_REQUIRED');
  if (deploymentApproved && (![transport, authorizeCrm, resolveCrmReadSession].every(x => typeof x === 'function'))) throw Error('EXPLICIT_AUTH_AND_TRANSPORT_REQUIRED');
  // resolveCrmReadSession: verified current CRM JWT read lease only; no ERP login/credential or UI role claim.
  // authorizeCrm: fresh verified CRM actor and explicit catalog grant. No role-name equivalence or default staff access.
  async function exchange(path, session, assertCurrent, signal) {
    assertCurrent();
    const response = await transport(new URL(path, ERP_ORIGIN), { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      headers: { accept: 'application/json', authorization: session.authorization }, signal });
    assertCurrent();
    if (response.status >= 300 && response.status < 400) throw Error('REDIRECT');
    if (!response.ok) {
      const allowed = new Set(['AUTH_TOKEN_EXPIRED','AUTH_TOKEN_INVALID','WHATSAPP_CRM_AUTH_TOKEN_REQUIRED','WHATSAPP_CRM_RATE_LIMITED','CRM_CATALOG_SCOPE_REQUIRED','CATALOG_SESSION_REVOKED','CRM_VERIFICATION_UNAVAILABLE','ERP_SOURCE_IDENTITY_REQUIRED','ERP_CATALOG_SQL_UNAVAILABLE','ERP_CATALOG_REQUEST_CANCELLED','ERP_CATALOG_PRODUCT_CONTRACT','ERP_CATALOG_LIST_CONTRACT','ERP_CATALOG_UNAVAILABLE','PRODUCT_NOT_FOUND','INVALID_QUERY','INVALID_PRODUCT_ID']);
      let code;
      if (response.headers.get('content-type')?.startsWith('application/json')) { const errorBody = JSON.parse(new TextDecoder().decode(await bytes(response, 65536))); assertCurrent(); if (allowed.has(errorBody?.error?.code)) code = errorBody.error.code; }
      return { status: response.status, code };
    }
    if (!response.headers.get('content-type')?.startsWith('application/json')) throw Error('CONTENT_TYPE');
    const data = JSON.parse(new TextDecoder().decode(await bytes(response, 2 * 1024 * 1024)));
    assertCurrent();
    if (data?.success !== true) throw Error('SUCCESS_CONTRACT'); return { status: response.status, data };
  }
  return async function handle(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return fail(405, 'GET_ONLY');
    const tail = url.pathname.slice(PREFIX.length);
    if (!url.pathname.startsWith(PREFIX) || !/^(?:|\/(?:vega|erp)-[1-9][0-9]*(?:\/photo)?)$/.test(tail)) return fail(404, 'ROUTE_NOT_ALLOWED');
    const isPhoto = tail.endsWith('/photo'); const id = tail ? tail.split('/')[1] : null;
    const query = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if(isPhoto&&key==='variant'&&url.searchParams.getAll(key).length===1&&['thumbnail','preview'].includes(value)){query.set(key,value);continue;}
      if (tail || !['search', 'barcode', 'brand', 'category', 'hasImage', 'page', 'limit'].includes(key) || url.searchParams.getAll(key).length !== 1) return fail(400, 'INVALID_QUERY');
      if (key === 'hasImage' ? !['true','false'].includes(value) : ['search', 'barcode', 'brand', 'category'].includes(key) ? value.length > 120 : !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(+value) || (key === 'limit' && +value > 100)) return fail(400, 'INVALID_QUERY');
      query.set(key, value);
    }
    if (!deploymentApproved) return fail(503, 'BRIDGE_NOT_DEPLOYED');
    const started = now();
    let activeSession;
    try {
      const crm = await authorizeCrm(request);
      if (crm?.catalogReadRevoked) return fail(401, 'CATALOG_SESSION_REVOKED');
      if (!crm || !identity(crm.id) || crm.catalogReadApproved !== true || !Array.isArray(crm.permissions) || !crm.permissions.includes('crm.view')) return fail(403, 'CRM_CATALOG_SCOPE_REQUIRED');
      const session = await resolveCrmReadSession(crm, request);
      if (!session || !sameId(session.crmActorId, crm.id) || !/^Bearer [^\s]+$/.test(session.authorization || '')
        || !Number.isFinite(session.expiresAt) || session.expiresAt <= now() || typeof session.isCurrent !== 'function' || !(session.signal instanceof AbortSignal)) return fail(401, 'CURRENT_CRM_SESSION_REQUIRED');
      activeSession=session;
      const assertCurrent=()=>{if(!session.isCurrent()||session.signal.aborted||session.expiresAt<=now())throw Error('CATALOG_SESSION_REVOKED')};
      const signal=AbortSignal.any([request.signal,session.signal,AbortSignal.timeout(maxReadAgeMs)]);
      const protect=response=>{assertCurrent();Object.defineProperty(response,CATALOG_RESPONSE_GUARD,{value:assertCurrent});return response};
      const upstream = await exchange(id ? `/api/crm-catalog/products/${id}` : `/api/crm-catalog/products?${query}`, session, assertCurrent, signal);
      if (upstream.status === 404 && upstream.code !== 'PRODUCT_NOT_FOUND') return fail(503, 'ERP_SINGLE_LOGIN_ROUTE_UNAVAILABLE');
      if (upstream.status !== 200) return fail(upstream.status >= 400 ? upstream.status : 502, upstream.code || 'ERP_READ_REJECTED');
      if (upstream.data.meta?.catalogVersion === 'melisa-catalog.v1') {
        const m=upstream.data.meta;
        if(m.source!=='melisa-erp-catalog'||m.environment!=='CANONICAL_TEST'||m.sourceDatabaseVerified!==true||!sameId(m.verifiedCrmActorId,crm.id)||m.verifiedCrmRole!==crm.role||m.cached!==false) return fail(503,'ERP_SOURCE_IDENTITY_REQUIRED');
        const validate=row=>{if(!row||!/^erp-[1-9]\d*$/.test(row.id||'')||row.id!==`erp-${row.erpProductId}`||!Number.isSafeInteger(row.erpProductId)||typeof row.stockCode!=='string'||!row.stockCode||!(row.productName===null||typeof row.productName==='string')||!/^[a-f0-9]{64}$/.test(row.revision||'')||!['guarded-path','unavailable'].includes(row.photoStatus)||row.photoPath!==(row.photoStatus==='guarded-path'?`${PREFIX}/${row.id}/photo`:null))throw Error('PRODUCT_CONTRACT');return row;};
        const data=id?validate(upstream.data.data):upstream.data.data.map(validate);
        if(id&&data.id!==id)return fail(502,'PRODUCT_ID_MISMATCH');
        if(isPhoto){
          if(!data.photoPath||data.photo?.validationStatus!=='CONFIRMED'||data.hold?.blocked!==false)return fail(404,'VERIFIED_PHOTO_PATH_REQUIRED');
          const photo=await transport(new URL(`/api/crm-catalog/products/${id}/photo?variant=${query.get('variant')||'preview'}`,ERP_ORIGIN),{method:'GET',headers:{accept:'image/jpeg,image/png,image/webp',authorization:session.authorization},redirect:'manual',cache:'no-store',signal});assertCurrent();
          const mime=(photo.headers.get('content-type')||'').split(';')[0];if(!photo.ok||!['image/jpeg','image/png','image/webp'].includes(mime))return fail(502,'PHOTO_REJECTED');
          const body=await bytes(photo,3*1024*1024);const signature=mime==='image/jpeg'?body[0]===255&&body[1]===216&&body[2]===255:mime==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>body[i]===v):new TextDecoder().decode(body.slice(0,4))==='RIFF'&&new TextDecoder().decode(body.slice(8,12))==='WEBP';
          if(!signature)return fail(502,'PHOTO_BYTES_OR_FRESHNESS_REJECTED');return protect(new Response(body,{headers:{'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff'}}));
        }
        if(!id&&(m.page!==Number(query.get('page')||1)||m.limit!==Number(query.get('limit')||50)||data.length!==Math.min(m.limit,Math.max(0,m.total-(m.page-1)*m.limit))))return fail(502,'PAGINATION_CONTRACT_REQUIRED');
        return protect(Response.json({success:true,data,meta:m},{headers:{'cache-control':'no-store'}}));
      }
      if (upstream.data.meta?.source !== 'crm-existing-stock-select-only' || upstream.data.meta?.sourceDatabaseVerified !== true || upstream.data.meta?.productDatabaseVerified!==true || upstream.data.meta?.imageDatabaseVerified!==true || upstream.data.meta?.imageDatabaseName !== ERP_DATABASE || upstream.data.meta?.productDatabaseName!==ERP_PRODUCT_DATABASE) return fail(503, 'ERP_SOURCE_IDENTITY_REQUIRED');
      if (!sameId(upstream.data.meta?.verifiedCrmActorId, crm.id) || upstream.data.meta?.verifiedCrmRole !== crm.role) return fail(502, 'CRM_SOURCE_ACTOR_MISMATCH');
      if (now() - started > maxReadAgeMs || session.expiresAt <= now()) return fail(503, 'FRESH_READ_REQUIRED');
      if (id) {
        if (!sameId(upstream.data.data?.id, id)) return fail(502, 'PRODUCT_ID_MISMATCH');
        if (!(upstream.data.data.isPassive === false || upstream.data.data.isActive === true)) return fail(403, 'ACTIVE_PRODUCT_REQUIRED');
        if (isPhoto) {
          const path = photoPath(upstream.data.data); if (!path) return fail(404, 'VERIFIED_PHOTO_PATH_REQUIRED');
          // Legacy public ERP assets retain accept-only headers. Explicit TEST adapter
          // may receive the verified CRM read lease; no ERP credential is forwarded.
          assertCurrent();
          const headers={accept:'image/png,image/jpeg,image/webp',...(photoCrmAuthorization?{authorization:session.authorization}:{})};
          const response = await transport(new URL(path, ERP_ORIGIN), { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', headers, signal });
          assertCurrent();
          if (!response.ok || response.status >= 300 && response.status < 400) return fail(502, 'PHOTO_REJECTED');
          const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return fail(502, 'PHOTO_MIME_REQUIRED');
          const body = await bytes(response, 3 * 1024 * 1024);
          assertCurrent();
          const signature = mime === 'image/png' ? body.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => body[i] === v)
            : mime === 'image/jpeg' ? body[0] === 255 && body[1] === 216 && body[2] === 255
            : body.length >= 12 && new TextDecoder().decode(body.slice(0,4)) === 'RIFF' && new TextDecoder().decode(body.slice(8,12)) === 'WEBP';
          if (!signature || now() - started > maxReadAgeMs || session.expiresAt <= now()) return fail(502, 'PHOTO_BYTES_OR_FRESHNESS_REJECTED');
          return protect(new Response(body, { headers: { 'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' } }));
        }
        return protect(Response.json({ success: true, data: sanitize(upstream.data.data), meta: { source: 'melisa-existing-erp-stock-read', catalogVersion:'existing-stock-v1', sourceDatabases:{products:ERP_PRODUCT_DATABASE,images:ERP_DATABASE}, stockFreshness:'unverified', fetchedAt: new Date(now()).toISOString(), cached: false, sourceUpdatedAt: null, sourceDatabaseVerified: true, capabilities: { read: true, unpricedCatalog: true, pricedPdf: false } } }, { headers: { 'cache-control': 'no-store' } }));
      }
      if (!Array.isArray(upstream.data.data) || upstream.data.meta?.source !== 'crm-existing-stock-select-only') return fail(502, 'LIST_CONTRACT_REQUIRED');
      const data = upstream.data.data.map(sanitize); const m = upstream.data.meta;
      const pagination = Object.fromEntries(['page','limit','total','totalPages','hasNextPage','hasPreviousPage'].map(k => [k,m[k]]));
      if (!['page','limit','total','totalPages'].every(k => Number.isSafeInteger(pagination[k]) && pagination[k] >= 0)
        || !['hasNextPage','hasPreviousPage'].every(k => typeof pagination[k] === 'boolean')) return fail(502, 'PAGINATION_CONTRACT_REQUIRED');
      const expectedPage=Number(query.get('page')||1),expectedLimit=Number(query.get('limit')||24);
      if(pagination.page!==expectedPage||pagination.limit!==expectedLimit||pagination.totalPages!==Math.max(1,Math.ceil(pagination.total/expectedLimit))||data.length!==Math.min(expectedLimit,Math.max(0,pagination.total-(expectedPage-1)*expectedLimit)))return fail(502,'PAGINATION_CONTRACT_REQUIRED');
      const publicOptions=rows=>{if(!Array.isArray(rows)||rows.length>500)throw Error('FACET_CONTRACT');return rows.map(row=>{if(typeof row?.value!=='string'||!row.value||row.value.length>120||!Number.isSafeInteger(row.count)||row.count<1)throw Error('FACET_CONTRACT');return{value:row.value,count:row.count}})};
      const expectedFilters={search:(query.get('search')||'').trim(),brand:(query.get('brand')||'').trim()||null,category:(query.get('category')||'').trim()||null,hasImage:query.get('hasImage')!=='false'};
      if(Object.keys(expectedFilters).some(key=>m.filters?.[key]!==expectedFilters[key])||m.photoEligibility!=='guarded-existing-ui-reference'||m.facets?.scope!=='current-query-excluding-own-facet'||!Number.isSafeInteger(m.totalPhotoEligible)||m.totalPhotoEligible<0||m.totalPhotoEligible>m.total||expectedFilters.hasImage&&(m.totalPhotoEligible!==m.total||data.some(row=>!row.photoPath)))throw Error('FILTER_CONTRACT');
      const facetMeta={totalPhotoEligible:m.totalPhotoEligible,photoEligibility:m.photoEligibility,filters:expectedFilters,facets:{scope:m.facets.scope,brands:publicOptions(m.facets.brands),categories:publicOptions(m.facets.categories)}};
      return protect(Response.json({ success: true, data, meta: { ...pagination,...facetMeta, source: 'melisa-existing-erp-stock-read', catalogVersion:'existing-stock-v1', sourceDatabases:{products:ERP_PRODUCT_DATABASE,images:ERP_DATABASE}, stockFreshness:'unverified', fetchedAt: new Date(now()).toISOString(), cached: false, sourceUpdatedAt: null, sourceDatabaseVerified: true, capabilities: { read: true, unpricedCatalog: true, pricedPdf: false } } }, { headers: { 'cache-control': 'no-store' } }));
    } catch (error) { return activeSession&&(!activeSession.isCurrent()||activeSession.signal.aborted||activeSession.expiresAt<=now()) ? fail(401,'CATALOG_SESSION_REVOKED') : fail(error?.status || 502, error?.message === 'CATALOG_SESSION_LIMIT' ? 'CATALOG_SESSION_LIMIT' : 'ERP_BRIDGE_UNAVAILABLE'); } finally { activeSession?.release?.(); }
  };
}
