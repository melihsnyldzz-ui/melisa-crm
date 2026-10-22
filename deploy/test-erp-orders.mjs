import http from 'node:http';
import { pathToFileURL } from 'node:url';
import {resolveTestEndpoints,sharedTestHealthSafe,cleanSyntheticTestHealthSafe} from './test-endpoints.mjs';
const endpoints=resolveTestEndpoints();
export const ERP_TEST_IDENTITY = Object.freeze({ database:endpoints.database, environment: 'CANONICAL_TEST', purpose: 'crm-order-draft-only' });
const crmOrigin = endpoints.gatewayOrigin;
const nativeOrigin = endpoints.nativeOrigin;
function fail(code, statusCode = 400) { throw Object.assign(new Error(code), { code, statusCode }); }
async function readBody(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 65536) fail('ERP_REQUEST_TOO_LARGE', 413); }
  try { return JSON.parse(text || '{}'); } catch { fail('ERP_REQUEST_INVALID'); }
}
function bearer(value) { return typeof value === 'string' && /^Bearer [^\s]+$/.test(value); }
// Only HTTP contracts cross this boundary; no SQL, imported ERP modules or fallback writer.
export function createTestOrderHandler({ fetchFn = (...args) => fetch(...args),testEndpoints=resolveTestEndpoints(),nativeSourceCommit=process.env.CRM_TEST_NATIVE_SOURCE_COMMIT,nativePackageId=process.env.CRM_TEST_NATIVE_PACKAGE_ID } = {}) {
  const crmOrigin=testEndpoints.gatewayOrigin,nativeOrigin=testEndpoints.nativeOrigin;
  const expectedIdentity={...ERP_TEST_IDENTITY,database:testEndpoints.database,environment:testEndpoints.cleanSynthetic?'CLEAN_SYNTHETIC_TEST':testEndpoints.isolated?'ISOLATED_TEST_COPY':'CANONICAL_TEST'};
  const healthSafe=testEndpoints.cleanSynthetic?cleanSyntheticTestHealthSafe:sharedTestHealthSafe;
  const loginAttempts = new Map();
  async function call(origin, path, options = {}) {
    let response;
    try { response = await fetchFn(new URL(path, origin), { ...options, redirect: 'error', signal: AbortSignal.timeout(45000) }); }
    catch { fail('ERP_TEST_SERVICE_UNAVAILABLE', 503); }
    let payload;
    try { payload = await response.json(); } catch { fail('ERP_TEST_RESPONSE_INVALID', 502); }
    if (!response.ok || payload?.success === false) {
      const code = payload?.error?.code;
      fail(/^[A-Z0-9_]+$/.test(code || '') ? code : 'ERP_TEST_REQUEST_FAILED', response.status >= 400 ? response.status : 502);
    }
    return payload?.data ?? payload;
  }
  async function identity() {
    const health = await call(nativeOrigin, '/test-health');
    if (!Object.entries(expectedIdentity).every(([key, value]) => health[key] === value)) fail('ERP_TEST_IDENTITY_MISMATCH', 503);
    if(testEndpoints.isolated&&(!healthSafe(health)||health.automaticJobs!==false||health.reservationEffect!==false))fail('ERP_TEST_IDENTITY_MISMATCH',503);
    if(testEndpoints.isolated||nativeSourceCommit||nativePackageId){
      if(!/^[a-f0-9]{40}$/.test(nativeSourceCommit||'')||typeof nativePackageId!=='string'||!nativePackageId||health.sourceCommit!==nativeSourceCommit||health.packageId!==nativePackageId||health.port!==testEndpoints.native||health.stockEffect!==false||health.ledgerEffect!==false)fail('ERP_TEST_IDENTITY_MISMATCH',503);
    }
  }
  async function conversationAccess(authorization,conversationId,peer) {
    if(!/^[1-9]\d*$/.test(String(conversationId))||!Number.isSafeInteger(Number(conversationId))||!/^\d{8,15}$/.test(peer||''))fail('CRM_V2_CUSTOMER_MAPPING_REQUIRED');
    const detail=await call(crmOrigin,'/crm/conversations/'+conversationId,{headers:{authorization}});
    if(String(detail.id)!==String(conversationId)||typeof detail.phone!=='string'||detail.phone.replace(/\D/g,'')!==peer)fail('CRM_V2_CONVERSATION_IDENTITY_MISMATCH',403);
  }
  return async (req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost');
      const authorization = req.headers.authorization;
      if (!bearer(authorization)) fail('CRM_SESSION_REQUIRED', 401);
      const actor = await call(crmOrigin, '/auth/me', { headers: { authorization } });
      if (!actor?.permissions?.includes('crm.send')) fail('CRM_ORDER_PERMISSION_REQUIRED', 403);
      let data;
      if (req.method === 'GET' && url.pathname === '/crm/erp/drafts') {
        data = { orders: [], loginRequired: true };
      } else {
        let nativePath, input;
        if (req.method === 'POST' && url.pathname === '/crm/erp/login') {
          const recent = (loginAttempts.get(actor.id) || []).filter(at => at > Date.now() - 900000);
          if (recent.length >= 5) fail('ERP_LOGIN_RATE_LIMIT', 429);
          recent.push(Date.now()); loginAttempts.set(actor.id, recent);
          const credentials = await readBody(req);
          if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string' || !credentials.username || !credentials.password) fail('ERP_LOGIN_REQUIRED', 401);
          input = { username: credentials.username, password: credentials.password };
          nativePath = '/api/auth/login';
        } else if(req.method==='GET'&&url.pathname==='/crm/erp/v2/customers'){
          if([...url.searchParams.keys()].some(key=>!['phone','conversationId','search'].includes(key))||[...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1)||!/^\d{7,15}$/.test(url.searchParams.get('phone')||'')||(testEndpoints.businessScope?!/^[1-9]\d*$/.test(url.searchParams.get('conversationId')||'')||!Number.isSafeInteger(Number(url.searchParams.get('conversationId'))):url.searchParams.get('conversationId')!=='55')||(url.searchParams.get('search')||'').length>120)fail('CRM_V2_CUSTOMER_MAPPING_REQUIRED');
          nativePath='/api/test/crm/orders/v2/customers?'+url.searchParams;
        } else if(req.method==='POST'&&url.pathname==='/crm/erp/v2/drafts'){
          input=await readBody(req);nativePath='/api/test/crm/orders/v2/drafts';
        } else if(req.method==='GET'&&/^\/crm\/erp\/v2\/drafts\/[0-9a-f-]{36}$/i.test(url.pathname)&&!url.search){
          nativePath='/api/test/crm/orders/v2/drafts/'+url.pathname.split('/').at(-1);
        } else if (req.method === 'GET' && ['/crm/erp/context', '/crm/erp/customers'].includes(url.pathname)) {
          nativePath = '/api/test/crm/orders/context';
        } else if (req.method === 'POST' && url.pathname === '/crm/erp/drafts') {
          input = await readBody(req);
          nativePath = '/api/test/crm/orders/drafts';
        } else if (req.method === 'GET' && /^\/crm\/erp\/drafts\/[0-9a-f-]{36}$/i.test(url.pathname)) {
          nativePath = '/api/test/crm/orders/drafts/' + url.pathname.split('/').at(-1);
        } else fail('ERP_ROUTE_NOT_FOUND', 404);
        const nativeToken = req.headers['x-erp-token'];
        if (nativePath !== '/api/auth/login' && (typeof nativeToken !== 'string' || !nativeToken || /\s/.test(nativeToken))) fail('ERP_LOGIN_REQUIRED', 401);
        const scopedCustomerRead=testEndpoints.businessScope&&url.pathname==='/crm/erp/v2/customers';
        const scopedCreate=testEndpoints.businessScope&&req.method==='POST'&&url.pathname==='/crm/erp/v2/drafts';
        if(scopedCustomerRead)await conversationAccess(authorization,url.searchParams.get('conversationId'),url.searchParams.get('phone'));
        if(scopedCreate)await conversationAccess(authorization,input?.conversationId,input?.peer);
        await identity();
        const sharedLogin=testEndpoints.isolated&&nativePath==='/api/auth/login';
        if(sharedLogin){const health=await call(testEndpoints.erpOrigin,'/test-health');if(!health.ok||!healthSafe(health)||health.databaseName!==testEndpoints.database||health.port!==testEndpoints.erpPort||health.mode!=='erp'||health.writes!==true)fail('ERP_TEST_IDENTITY_MISMATCH',503);}
        data = await call(sharedLogin?testEndpoints.erpOrigin:nativeOrigin, nativePath, {
          method: req.method,
          headers: { ...(sharedLogin?{origin:testEndpoints.erpUiOrigin}:{}),'X-CRM-Authorization': authorization, ...(nativeToken ? { Authorization: `Bearer ${nativeToken}` } : {}), ...(input ? { 'Content-Type': 'application/json' } : {}) },
          ...(input ? { body: JSON.stringify(input) } : {}),
        });
        if(testEndpoints.businessScope&&/^\/crm\/erp\/v2\/drafts\//.test(url.pathname))await conversationAccess(authorization,data?.request?.conversationId,data?.request?.peer);
        if(scopedCustomerRead)await conversationAccess(authorization,url.searchParams.get('conversationId'),url.searchParams.get('phone'));
        if(scopedCreate)await conversationAccess(authorization,input?.conversationId,input?.peer);
        if (nativePath === '/api/auth/login') {
          if (!data.user?.permissions?.includes('sales.create') || !data.accessToken) fail('ERP_PERMISSION_REQUIRED', 403);
          if(sharedLogin){const current=await call(testEndpoints.erpOrigin,'/api/auth/me',{headers:{authorization:`Bearer ${data.accessToken}`}});const user=current.user??current;if(String(user.id)!==String(data.user.id)||!user.permissions?.includes('sales.create'))fail('ERP_PERMISSION_REQUIRED',403);}
          data = { accessToken: data.accessToken, user: { id: data.user.id, displayName: data.user.displayName }, ...expectedIdentity };
        }
        if (url.pathname === '/crm/erp/customers') {
          if (data.customer?.id !== 593 || data.customer?.code !== 'TEST-V70-20260929-C') fail('ERP_TEST_CONTEXT_INVALID', 502);
          const search = (url.searchParams.get('search') || '').toLocaleLowerCase('tr-TR');
          data = { ...data, customers: `${data.customer.code} ${data.customer.name}`.toLocaleLowerCase('tr-TR').includes(search) ? [data.customer] : [] };
        }
      }
      res.writeHead(200); res.end(JSON.stringify({ success: true, data }));
    } catch (error) {
      const code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'ERP_TEST_REQUEST_FAILED';
      const messages = { AUTH_INVALID_CREDENTIALS: 'ERP kullanıcı adı veya parola doğru değil.', ERP_LOGIN_REQUIRED: 'Mevcut ERP TEST hesabınızla giriş yapın.', ERP_PERMISSION_REQUIRED: 'Bu ERP hesabının sipariş oluşturma yetkisi yok.', ERP_PRODUCT_MAPPING_REQUIRED: 'Seçilen ürün kanonik TEST ERP ile tam eşleşmedi. Seçiminiz korunuyor.', ERP_TEST_IDENTITY_MISMATCH: 'ERP servisi beklenen kanonik TEST ortamı değil. İşlem yapılmadı.', ERP_LOGIN_RATE_LIMIT: 'Çok fazla giriş denemesi yapıldı. Bir süre sonra tekrar deneyin.' };
      res.writeHead(error.statusCode || 503); res.end(JSON.stringify({ success: false, error: { code, message: messages[code] || 'ERP TEST işlemi tamamlanamadı. Seçiminiz korunuyor.' } }));
    }
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = http.createServer(createTestOrderHandler()).listen(endpoints.orders, '127.0.0.1', () => console.log('Kanonik ERP TEST sözleşme adapteri hazır.'));
  server.on('error', error => { console.error(error.code); process.exit(1); });
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
