import { lstat, realpath, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTestEndpoints, sharedTestHealthSafe } from './test-endpoints.mjs';
import { getErpAuthorization } from './test-erp-catalog.mjs';
import { validateNativeSource } from '../apps/frontend/src/lib/nativeOrder.js';

const fail = () => { throw Object.assign(Error('CUSTOMER_CATALOG_PROFILE_REJECTED'), { code: 'CUSTOMER_CATALOG_PROFILE_REJECTED' }); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const hash = value => /^[a-f0-9]{64}$/.test(value || '');
const safeText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/u.test(value);
const bearer = value => typeof value === 'string' && /^Bearer [^\s]+$/.test(value);

/** Explicit owner-only preparation: existing loopback auth and selected reads only.
 * Credentials stay in RAM; no provider, SQL, catalog scan or native draft POST. */
export async function prepareCustomerCatalogTestProfile({ productIds, customerId, expectedPeer, nativeSourceCommit,
  nativePackageId, customerSearch = '', operatorReason = null, environment, transport = fetch, authorizeErp = getErpAuthorization } = {}) {
  if (!environment || environment.CRM_TEST_PORT_BASE !== '62600' || environment.CRM_ISOLATED_PREPARATION !== 'true'
      || environment.CRM_TEST_ERP_ORIGIN !== 'http://127.0.0.1:4174' || environment.CRM_TEST_EXPECTED_DATABASE !== 'MELISA_ERP_CRM_SHARED_TEST_20261009_01'
      || expectedPeer !== '905387217733' || environment.WAAPI_TEST_RECIPIENT !== expectedPeer
      || !Array.isArray(productIds) || productIds.length !== 2 || !productIds.every(positive) || new Set(productIds).size !== 2
      || !positive(customerId) || !/^[a-f0-9]{40}$/.test(nativeSourceCommit || '') || !safeText(nativePackageId, 200)
      || typeof customerSearch !== 'string' || customerSearch.length > 120 || typeof transport !== 'function' || typeof authorizeErp !== 'function') fail();
  const endpoints = resolveTestEndpoints(environment);
  const call = async (origin, pathname, options = {}) => {
    try {
      const response = await transport(new URL(pathname, origin), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000), ...options });
      const raw = await response.text(); if (Buffer.byteLength(raw) > 65536) fail();
      const payload = JSON.parse(raw); if (!response.ok || payload?.success === false) fail();
      return payload;
    } catch { fail(); }
  };
  const data = async (...args) => { const payload = await call(...args); return payload.data ?? payload; };
  const session = await data(endpoints.uiOrigin, '/api/test-admin/session', { method: 'POST', headers: { origin: endpoints.uiOrigin } });
  const authorization = 'Bearer ' + session.accessToken; if (!bearer(authorization)) fail();
  const headers = { authorization, 'x-crm-conversation-id': '55' };
  const actor = await data(endpoints.gatewayOrigin, '/auth/me', { headers });
  if (!safeText(actor.id, 100) || !['patron', 'mudur'].includes(actor.role) || !actor.permissions?.includes('crm.manage') || !actor.permissions.includes('crm.send')) fail();
  const conversationResult = await data(endpoints.gatewayOrigin, '/crm/conversations/55', { headers });
  const conversation = conversationResult.conversation ?? conversationResult;
  if (String(conversation.id) !== '55' || String(conversation.phone || '').replace(/\D/g, '') !== expectedPeer) fail();
  let erpAuthorization;
  try { erpAuthorization = await authorizeErp({ accountName: 'seller', environment, testEndpoints: endpoints, fetchFn: transport }); } catch { fail(); }
  if (!bearer(erpAuthorization)) fail();
  const erpResult = await data(endpoints.erpOrigin, '/api/auth/me', { headers: { authorization: erpAuthorization } });
  const erpActor = erpResult.user ?? erpResult;
  if (!positive(Number(erpActor.id)) || !erpActor.permissions?.includes('sales.create')) fail();
  const health = await data(endpoints.nativeOrigin, '/test-health');
  if (!health.ok || !sharedTestHealthSafe(health) || health.database !== endpoints.database || health.port !== 62604
      || health.purpose !== 'crm-order-draft-only' || health.sourceCommit !== nativeSourceCommit || health.packageId !== nativePackageId
      || ['stockEffect', 'ledgerEffect', 'reservationEffect'].some(key => health[key] !== false) || health.collectionEffect === true) fail();
  const prices = [], products = []; let sourceEnvironment;
  for (const [index, id] of productIds.entries()) {
    const productId = 'erp-' + id, payload = await call(endpoints.gatewayOrigin, '/crm/catalog/products/' + productId, { headers });
    const row = payload.data, meta = payload.meta, pieces = index === 0 ? 6 : 4;
    if (payload.success !== true || meta?.source !== 'melisa-erp-catalog' || meta.catalogVersion !== 'melisa-catalog.v1'
        || !['CANONICAL_TEST', 'ISOLATED_TEST_COPY'].includes(meta.environment) || meta.sourceDatabaseVerified !== true
        || meta.stockFreshness !== 'native-test' || meta.freshLive !== false || meta.cached !== false
        || !Number.isFinite(Date.parse(meta.fetchedAt)) || Math.abs(Date.now() - Date.parse(meta.fetchedAt)) > 300000
        || sourceEnvironment && sourceEnvironment !== meta.environment || row?.id !== productId || row.erpProductId !== id
        || row.status !== 'active' || row.hold?.blocked !== false || !hash(row.revision) || !safeText(row.stockCode, 120)
        || row.unit?.verified !== true || row.unit.factorExact8 !== '1.00000000' || !Number.isSafeInteger(row.stockQuantity) || row.stockQuantity < pieces
        || row.photoStatus !== 'guarded-path' || row.photo?.validationStatus !== 'CONFIRMED' || row.photoPath !== `/crm/catalog/products/${productId}/photo`) fail();
    if (!Array.isArray(row.salePrices)) fail();
    const candidates = row.salePrices.filter(price => price.tier === 1 && price.isMainUnit === true && price.currency === 'TRY');
    if (candidates?.length !== 1) fail(); const price = candidates[0];
    if (!positive(Number(price.id)) || !positive(Number(price.unitSourceId)) || !safeText(price.sourceKey, 200)
        || !/^(?:0|[1-9]\d{0,11})\.\d{8}$/.test(price.priceExact || '') || Number(price.priceExact) <= 0) fail();
    sourceEnvironment = meta.environment;
    prices.push({ productId, priceId: Number(price.id), unitSourceId: Number(price.unitSourceId), currency: 'TRY', priceSourceKey: price.sourceKey });
    products.push({ id: productId, recommended: true, maxSeries: 3,
      priceSelection: { priceId: Number(price.id), unitSourceId: Number(price.unitSourceId), sourceKey: price.sourceKey },
      series: { verified: true, isTestExample: true, evidence: 'Owner authorized synthetic TEST overlay 2026-10-10',
        stockCompositionVerified: false, totalPieces: pieces, testAvailableSeries: 3,
        composition: [{ label: '3 ay', quantity: index === 0 ? 2 : 1 }, { label: '9 ay', quantity: index === 0 ? 2 : 1 }, { label: '12 ay', quantity: 2 }] } });
  }
  const mapping = await data(`http://127.0.0.1:${endpoints.orders}`, '/crm/erp/v2/customers?' + new URLSearchParams({ conversationId: '55', phone: expectedPeer, search: customerSearch }),
    { headers: { authorization, 'x-erp-token': erpAuthorization.slice(7) } });
  try { validateNativeSource(mapping.currentSource); } catch { fail(); }
  if (!Array.isArray(mapping.entries)) fail();
  const selected = mapping.entries.filter(entry => entry.id === customerId);
  if (selected?.length !== 1 || selected[0].blocked !== false || selected[0].currency !== 'TRY' || !hash(selected[0].revision) || !safeText(selected[0].code, 120)) fail();
  const customer = selected[0], exact = mapping.status === 'matched' && customer.exactPhoneMatch === true;
  if (!exact && (!safeText(operatorReason, 250) || operatorReason.trim().length < 8 || !/\bTEST\b/i.test(operatorReason))) fail();
  return { version: 1, nativeSourceCommit, nativePackageId, erpActorId: String(erpActor.id), peer: expectedPeer, customerCode: customer.code,
    customerMatch: { basis: exact ? 'exact-phone' : 'operator-confirmed', phone: expectedPeer, revision: customer.revision, reason: exact ? null : operatorReason.trim() },
    expectedSource: mapping.currentSource, prices, pilot: { enabled: true, approved: true, environment: 'ISOLATED_TEST_COPY', database: endpoints.database,
      conversationId: '55', customerId, actorId: actor.id, customerLabel: 'Owner TEST', currency: 'TRY', sourceEnvironment,
      sourceLabel: 'İzole ERP TEST · örnek 6/4 seri; gerçek beden dağılımı doğrulanmadı', testSeriesOverlay: true, products } };
}

export async function writeCustomerCatalogTestProfile({ profile, profilePath, repoRoot, runtimeDirectory } = {}) {
  if (![profilePath, repoRoot, runtimeDirectory].every(value => typeof value === 'string' && path.isAbsolute(value))
      || path.dirname(path.resolve(profilePath)) !== path.resolve(runtimeDirectory)
      || !path.relative(path.resolve(repoRoot), path.resolve(profilePath)).startsWith('..' + path.sep)
      || profile?.version !== 1 || profile.pilot?.environment !== 'ISOLATED_TEST_COPY' || profile.pilot.database !== 'MELISA_ERP_CRM_SHARED_TEST_20261009_01') fail();
  const directory = await lstat(runtimeDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink() || await realpath(runtimeDirectory) !== path.resolve(runtimeDirectory)) fail();
  const json = JSON.stringify(profile); if (Buffer.byteLength(json) > 65536) fail();
  await writeFile(profilePath, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

// One short operator command; the private input contains explicit pins and paths.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const inputPath = process.argv[2]; if (process.argv.length !== 3 || !path.isAbsolute(inputPath || '')) fail();
    const stat = await lstat(inputPath); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || await realpath(inputPath) !== path.resolve(inputPath)) fail();
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    if (path.dirname(path.resolve(inputPath)) !== path.resolve(input.runtimeDirectory)
        || !path.relative(path.resolve(input.repoRoot), path.resolve(inputPath)).startsWith('..' + path.sep)) fail();
    const profile = await prepareCustomerCatalogTestProfile(input);
    await writeCustomerCatalogTestProfile({ ...input, profile });
    process.stdout.write('CUSTOMER_CATALOG_TEST_PROFILE_READY\n');
  } catch { process.stderr.write('CUSTOMER_CATALOG_PROFILE_REJECTED\n'); process.exitCode = 1; }
}
