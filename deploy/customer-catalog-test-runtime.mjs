import fs from 'node:fs';
import path from 'node:path';
import { createCustomerCatalogService } from '../apps/gateway/src/services/customerCatalog.mjs';
import { createCustomerCatalogHandler } from '../apps/gateway/src/services/customerCatalogHandler.mjs';
import { createCustomerCatalogTestAdapter } from './customer-catalog-test-adapter.mjs';

const fail = code => { throw Object.assign(new Error(code), { code, statusCode: 503 }); };
export function customerCatalogLinkOrigin({ endpoints, lanNetwork, tailscaleNetwork } = {}) {
  if (!endpoints?.isolated || endpoints.ui !== 62600) fail('CUSTOMER_CATALOG_PHONE_ORIGIN_REQUIRED');
  const origin = tailscaleNetwork?.origin || lanNetwork?.origin;
  if (!origin) fail('CUSTOMER_CATALOG_PHONE_ORIGIN_REQUIRED');
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.protocol !== 'http:' || parsed.port !== '62600'
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
      || !/^(?:192\.168\.1\.46|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2}))$/.test(parsed.hostname)
      || parsed.hostname.split('.').some(part => Number(part) > 255)) fail('CUSTOMER_CATALOG_PHONE_ORIGIN_REQUIRED');
  return origin;
}
export function readCustomerCatalogTestProfile(profilePath, repoRoot, runtimeDirectory) {
  if (!profilePath) return null;
  if (!path.isAbsolute(profilePath) || path.dirname(path.resolve(profilePath)) !== path.resolve(runtimeDirectory)
      || !path.relative(path.resolve(repoRoot), path.resolve(profilePath)).startsWith('..' + path.sep)) fail('CUSTOMER_CATALOG_PRIVATE_PROFILE_REQUIRED');
  const stat = fs.lstatSync(profilePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || fs.realpathSync.native(profilePath) !== path.resolve(profilePath)) fail('CUSTOMER_CATALOG_PRIVATE_PROFILE_REQUIRED');
  let profile;
  try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch { fail('CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED'); }
  if (profile?.version !== 1 || profile?.pilot?.enabled !== true || profile?.pilot?.approved !== true
      || profile.pilot.environment !== 'ISOLATED_TEST_COPY'
      || profile.pilot.database !== 'MELISA_ERP_CRM_SHARED_TEST_20261009_01') fail('CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED');
  return profile;
}

/** A private reviewed profile enables only the new customer API. Existing shared
 * preparation send, translation and write guards remain in force.
 * Staff JWTs stay in RAM and expire through the existing verifier. After restart
 * the operator reconnects through CRM before a customer can continue.
 */
export function createCustomerCatalogTestRuntime({ profile, runtimeDirectory, endpoints,
  verifyToken, readConversation, getErpAuthorization, allowedTestPeer, linkOrigin, transport = fetch } = {}) {
  if (!profile) return createCustomerCatalogHandler({ service: createCustomerCatalogService() });
  if (!linkOrigin) fail('CUSTOMER_CATALOG_PHONE_ORIGIN_REQUIRED');
  if (!allowedTestPeer || profile.peer !== allowedTestPeer || String(profile.pilot?.conversationId) !== '55') fail('CUSTOMER_CATALOG_PEER_MISMATCH');
  const staffAuthorizations = new Map();
  const verifyActor = scope => {
    const authorization = staffAuthorizations.get(String(scope.actorId));
    if (!authorization) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
    return verifyToken(authorization.slice(7));
  };
  const adapter = createCustomerCatalogTestAdapter({ profile, endpoints, transport, getErpAuthorization,
    getCrmAuthorization: scope => staffAuthorizations.get(String(scope.actorId)),
    verifyActor, readConversation,
  });
  const service = createCustomerCatalogService({ config: profile.pilot,
    storeFile: path.join(runtimeDirectory, 'customer-catalog-sessions.json'), ...adapter });
  return createCustomerCatalogHandler({ service, linkOrigin, authorizeStaff: async request => {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer [^\s]+$/.test(authorization)) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
    const user = await verifyToken(authorization.slice(7));
    if (String(user?.id) !== String(profile.pilot.actorId) || !['patron', 'mudur'].includes(user.role)
        || !user.permissions?.includes('crm.manage') || !user.permissions.includes('crm.send')) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
    staffAuthorizations.set(String(user.id), authorization);
    return user;
  } });
}

export async function respondCustomerCatalog(req, res, handler) {
  const pathname = new URL(req.url, 'http://' + req.headers.host).pathname;
  const staff = pathname.startsWith('/api/live/crm/customer-catalog/');
  const customer = pathname.startsWith('/api/customer-catalog/');
  if (!staff && !customer) return false;
  res.setHeader('cache-control', 'no-store'); res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-content-type-options', 'nosniff');
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 65536) { res.writeHead(413); res.end(JSON.stringify({ success: false, error: { code: 'CUSTOMER_CATALOG_REQUEST_TOO_LARGE' } })); return true; }
    }
    const target = new URL(req.url, 'http://' + req.headers.host);
    target.pathname = target.pathname.slice(staff ? '/api/live'.length : '/api'.length);
    const response = await handler(new Request(target, { method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (req.method === 'HEAD') res.end(); else res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'CUSTOMER_CATALOG_SOURCE_UNAVAILABLE' } }));
  }
  return true;
}
