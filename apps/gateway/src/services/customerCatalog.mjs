import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';

const VERSION = 1;
const SCALE = 100_000_000n;
const MAX_EXACT = BigInt(Number.MAX_SAFE_INTEGER);
const PRODUCT_ID = /^erp-[1-9]\d*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const copy = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && String(Number(value)) === String(value);
const text = (value, limit = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/u.test(value);
function fail(code, statusCode = 400) { throw Object.assign(new Error(code), { code, statusCode }); }
function exact(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)\.\d{8}$/.test(value)) fail('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 503);
  const amount = BigInt(value.replace('.', ''));
  if (amount > MAX_EXACT) fail('CUSTOMER_CATALOG_AMOUNT_LIMIT', 409);
  return amount;
}
function money(amount) {
  if (amount < 0n || amount > MAX_EXACT) fail('CUSTOMER_CATALOG_AMOUNT_LIMIT', 409);
  return `${amount / SCALE}.${String(amount % SCALE).padStart(8, '0')}`;
}
function cleanSeries(value, allowTestOverlay) {
  if (value === null || value === undefined || value.verified !== true) return null;
  if (!text(value.evidence, 250) || !Number.isSafeInteger(value.totalPieces) || value.totalPieces < 1 || value.totalPieces > 100
    || !Array.isArray(value.composition) || value.composition.length < 1 || value.composition.length > 30
    || !value.composition.every(entry => text(entry?.label, 80) && Number.isSafeInteger(entry.quantity) && entry.quantity > 0)
    || value.composition.reduce((sum, entry) => sum + entry.quantity, 0) !== value.totalPieces
    || new Set(value.composition.map(entry => entry.label)).size !== value.composition.length) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  // Total pieces alone cannot certify complete size/color series in the TEST source.
  const isTestExample = allowTestOverlay === true && value.isTestExample === true;
  if (value.isTestExample === true && !isTestExample) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  if (isTestExample && (!Number.isSafeInteger(value.testAvailableSeries) || value.testAvailableSeries < 0 || value.testAvailableSeries > 100)) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  const stockVerified = !isTestExample && value.stockCompositionVerified === true && text(value.stockEvidence, 250)
    && Number.isSafeInteger(value.availableSeries) && value.availableSeries >= 0 && value.availableSeries <= 100;
  return { verified: true, evidence: value.evidence, totalPieces: value.totalPieces,
    composition: value.composition.map(entry => ({ label: entry.label, quantity: entry.quantity })),
    label: value.composition.map(entry => `${entry.label}: ${entry.quantity}`).join(' · '),
    isTestExample, stockVerified, availableSeries: isTestExample ? value.testAvailableSeries : stockVerified ? value.availableSeries : null };
}
function reviewedConfig(raw) {
  if (!raw || raw.enabled !== true) return null;
  if (raw.approved !== true || raw.environment !== 'ISOLATED_TEST_COPY' || !text(raw.database, 120)
    || !positiveId(raw.conversationId) || !positiveId(raw.customerId) || !text(raw.actorId, 100)
    || !text(raw.customerLabel, 120) || !['TRY', 'EUR', 'USD'].includes(raw.currency)
    || !Array.isArray(raw.products) || raw.products.length < 1 || raw.products.length > 30
    || !Number.isSafeInteger(raw.sessionTtlMs ?? 86400000) || (raw.sessionTtlMs ?? 86400000) < 60000 || (raw.sessionTtlMs ?? 86400000) > 86400000) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  const products = raw.products.map(entry => {
    if (!PRODUCT_ID.test(entry?.id || '') || !Number.isSafeInteger(Number(entry.id.slice(4)))
      || !Number.isSafeInteger(entry.maxSeries ?? 20) || (entry.maxSeries ?? 20) < 1 || (entry.maxSeries ?? 20) > 100
      || ['age', 'type', 'color'].some(key => entry[key] != null && !text(entry[key], 80))) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
    const selection = entry.priceSelection ?? null;
    if (selection && (!positiveId(selection.priceId) || !positiveId(selection.unitSourceId) || !text(selection.sourceKey, 200))) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
    return { id: entry.id, recommended: entry.recommended === true, maxSeries: entry.maxSeries ?? 20, priceSelection: selection ? copy(selection) : null,
      age: entry.age ?? null, type: entry.type ?? null, color: entry.color ?? null, series: cleanSeries(entry.series, raw.testSeriesOverlay === true) };
  });
  if (new Set(products.map(entry => entry.id)).size !== products.length) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  const config = { environment: raw.environment, database: raw.database, conversationId: String(raw.conversationId),
    customerId: Number(raw.customerId), actorId: raw.actorId, customerLabel: raw.customerLabel, currency: raw.currency,
    sessionTtlMs: raw.sessionTtlMs ?? 86400000, products, sourceEnvironment: raw.sourceEnvironment ?? 'CANONICAL_TEST',
    testSeriesOverlay: raw.testSeriesOverlay === true, sourceLabel: text(raw.sourceLabel, 150) ? raw.sourceLabel : 'İzole ERP TEST kataloğu' };
  if (!['CANONICAL_TEST', 'ISOLATED_TEST_COPY'].includes(config.sourceEnvironment)) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  return { ...config, revision: digest(JSON.stringify(config)) };
}
function publicScope(session) {
  return { sessionId: session.id, conversationId: session.conversationId, customerId: session.customerId,
    customerLabel: session.customerLabel, actorId: session.actorId };
}
function emptyCart(currency, revision = 0) {
  return { revision, items: [], modelCount: 0, seriesCount: 0, pieceCount: 0, productTotal: 0, productTotalExact: '0.00000000', currency,
    valid: true, validationErrors: [] };
}
function envelopeRow(payload, entry, config, now) {
  const row = payload?.data, meta = payload?.meta, readAt = Date.parse(meta?.fetchedAt);
  if (payload?.success !== true || meta?.source !== 'melisa-erp-catalog' || meta.catalogVersion !== 'melisa-catalog.v1'
    || meta.environment !== config.sourceEnvironment || meta.sourceDatabaseVerified !== true || meta.stockFreshness !== 'native-test'
    || meta.freshLive !== false || meta.cached !== false || !Number.isFinite(readAt) || readAt > now || now - readAt > 300000
    || row?.id !== entry.id || row.erpProductId !== Number(entry.id.slice(4)) || !text(row.stockCode)
    || !/^[a-f0-9]{64}$/.test(row.revision || '') || row.status !== 'active' || row.hold?.blocked !== false
    || row.unit?.verified !== true || row.unit.factorExact8 !== '1.00000000' || !Array.isArray(row.salePrices)) fail('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 503);
  const prices = row.salePrices.filter(value => value?.tier === 1 && value.isMainUnit === true && value.currency === config.currency && value.priceExact !== null
    && (!entry.priceSelection || Number(value.id) === Number(entry.priceSelection.priceId) && Number(value.unitSourceId) === Number(entry.priceSelection.unitSourceId) && value.sourceKey === entry.priceSelection.sourceKey));
  const sourcePrice = prices.length === 1 ? exact(prices[0].priceExact) : null;
  // Existing native v2 ERP rounds unit price to four places before multiplication.
  const price = sourcePrice === null ? null : ((sourcePrice + 5000n) / 10000n) * 10000n;
  if (prices.length === 1 && (!positiveId(prices[0].id) || !positiveId(prices[0].unitSourceId) || !text(prices[0].sourceKey, 200))) fail('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 503);
  if (price !== null && price <= 0n) fail('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 503);
  const stock = Number.isSafeInteger(row.stockQuantity) && row.stockQuantity >= 0 ? row.stockQuantity : null;
  const verified = entry.series !== null;
  const stockSeriesCheck = verified && (entry.series.stockVerified || entry.series.isTestExample);
  const maxSeries = stockSeriesCheck && stock !== null
    ? Math.min(Math.floor(stock / entry.series.totalPieces), entry.series.availableSeries, entry.maxSeries) : null;
  const blockReason = !verified ? 'SERIES_UNVERIFIED' : !stockSeriesCheck ? 'SERIES_STOCK_UNVERIFIED'
    : stock === null ? 'STOCK_UNVERIFIED' : price === null ? 'PRICE_UNAVAILABLE' : maxSeries === 0 ? 'STOCK_UNAVAILABLE' : null;
  const photo = row.photoStatus === 'guarded-path' && row.photo?.validationStatus === 'CONFIRMED'
    && row.photoPath === `/crm/catalog/products/${row.id}/photo`;
  const publicSeries = verified ? { verified: true, isTestExample: entry.series.isTestExample, totalPieces: entry.series.totalPieces,
    composition: copy(entry.series.composition), label: entry.series.label } : { verified: false, totalPieces: null, composition: [], label: 'Seri içeriği doğrulanmayı bekliyor' };
  return { public: { id: row.id, stockCode: row.stockCode,
    productName: text(row.productName, 250) ? row.productName : (text(row.safeCode, 250) ? row.safeCode : row.stockCode),
    photoPath: photo ? `/api/customer-catalog/products/${row.id}/photo` : null,
    unitPrice: price === null ? null : Number(money(price)), unitPriceExact: price === null ? null : money(price),
    currency: config.currency, series: publicSeries, seriesTotal: verified && price !== null ? Number(money(price * BigInt(entry.series.totalPieces))) : null,
    seriesTotalExact: verified && price !== null ? money(price * BigInt(entry.series.totalPieces)) : null,
    maxSeries, recommended: entry.recommended, age: entry.age, type: entry.type, color: entry.color,
    availability: stock === null || maxSeries === null ? 'unknown' : maxSeries > 0 ? 'available' : 'unavailable',
    selectable: blockReason === null, blockReason, testOnly: true, testStockOnly: true, sourceLabel: config.sourceLabel },
    exactPrice: price, sourcePriceExact: sourcePrice === null ? null : money(sourcePrice), revision: row.revision,
    priceSourceKey: prices[0]?.sourceKey ?? null, priceId: prices[0]?.id ?? null, unitSourceId: prices[0]?.unitSourceId ?? null };
}
function buildCart(items, cards, currency, revision, { allowStockErrors = false } = {}) {
  const cart = emptyCart(currency, revision);
  for (const item of items) {
    const card = cards.find(value => value.public.id === item.productId);
    if (!card) fail('CUSTOMER_CATALOG_CART_INVALID');
    if (!card.public.series.verified) fail('CUSTOMER_CATALOG_SERIES_UNVERIFIED', 409);
    if (card.exactPrice === null) fail('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 503);
    const stockUnknown = card.public.blockReason === 'STOCK_UNVERIFIED';
    const stockExceeded = card.public.blockReason === 'STOCK_UNAVAILABLE'
      || card.public.maxSeries !== null && item.seriesCount > card.public.maxSeries;
    if (!card.public.selectable && !stockUnknown && !stockExceeded) fail('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 409);
    if (stockUnknown || stockExceeded) {
      if (!allowStockErrors) fail(stockExceeded ? 'CUSTOMER_CATALOG_STOCK_LIMIT' : 'CUSTOMER_CATALOG_SOURCE_UNAVAILABLE', 409);
      cart.valid = false;
      cart.validationErrors.push({ productId: item.productId, code: stockExceeded ? 'STOCK_LIMIT' : 'STOCK_UNVERIFIED',
        requestedSeries: item.seriesCount, maxSeries: card.public.maxSeries });
    }
    const pieceCount = item.seriesCount * card.public.series.totalPieces;
    const total = card.exactPrice * BigInt(pieceCount);
    cart.items.push({ ...card.public, productId: item.productId, seriesCount: item.seriesCount, pieceCount,
      lineTotal: Number(money(total)), lineTotalExact: money(total) });
    cart.seriesCount += item.seriesCount; cart.pieceCount += pieceCount;
    cart.productTotalExact = money(exact(cart.productTotalExact) + total);
  }
  if (cart.seriesCount > 100 || cart.pieceCount > 9999) fail('CUSTOMER_CATALOG_SERIES_LIMIT', 409);
  cart.modelCount = cart.items.length; cart.productTotal = Number(cart.productTotalExact);
  return cart;
}
function cartInput(input, config) {
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !['revision', 'items'].includes(key))
    || !Number.isSafeInteger(input.revision) || input.revision < 0 || !Array.isArray(input.items) || input.items.length > config.products.length
    || input.items.some(item => !item || Array.isArray(item) || Object.keys(item).length !== 2
      || !Object.hasOwn(item, 'productId') || !Object.hasOwn(item, 'seriesCount') || !config.products.some(entry => entry.id === item.productId)
      || !Number.isSafeInteger(item.seriesCount) || item.seriesCount < 1 || item.seriesCount > 100)
    || new Set(input.items.map(item => item.productId)).size !== input.items.length) fail('CUSTOMER_CATALOG_CART_INVALID');
  return input.items.map(item => ({ productId: item.productId, seriesCount: item.seriesCount }));
}
function pricedFingerprint(items, cards) {
  return digest(JSON.stringify(items.map(item => {
    const card = cards.find(value => value.public.id === item.productId);
    if (!card) fail('CUSTOMER_CATALOG_CART_INVALID');
    return [item.productId, item.seriesCount, card.sourcePriceExact, card.public.currency, card.revision, card.priceId, card.unitSourceId,
      card.priceSourceKey, card.public.maxSeries, card.public.selectable, card.public.blockReason];
  })));
}
function verifyReadback(value, pending, scope) {
  if (!value || value.requestId !== pending.requestId || !positiveId(value.id) || value.status !== 'draft'
    || Number(value.customerId) !== scope.customerId || String(value.conversationId) !== scope.conversationId
    || value.stockEffect !== false || value.ledgerEffect !== false || value.reservationEffect !== false || value.collectionEffect !== false
    || value.currency !== pending.summary.currency || value.productTotalExact !== pending.summary.productTotalExact
    || !Array.isArray(value.items) || value.items.length !== pending.items.length) fail('CUSTOMER_CATALOG_DRAFT_READBACK_MISMATCH', 503);
  for (const line of pending.items) {
    const matches = value.items.filter(item => item.productId === line.productId);
    const roundedPrice = money(((exact(line.expectedPriceExact) + 5000n) / 10000n) * 10000n);
    if (matches.length !== 1 || matches[0].quantity !== line.quantity || matches[0].unitPriceExact !== roundedPrice
      || matches[0].currency !== line.expectedCurrency) fail('CUSTOMER_CATALOG_DRAFT_READBACK_MISMATCH', 503);
  }
  return { status: 'test-draft', requestId: pending.requestId, id: Number(value.id), testOnly: true,
    verifiedReadback: true, summary: copy(pending.summary) };
}

/** One reviewed personal TEST pilot; ERP remains the product/order source. No provider calls or SQL. */
export function createCustomerCatalogService({ config: rawConfig, storeFile, readProduct, readPhoto, verifyScope, createDraft, readDraft, now = Date.now } = {}) {
  const config = reviewedConfig(rawConfig);
  if (config && (!path.isAbsolute(storeFile || '') || ![readProduct, verifyScope].every(value => typeof value === 'function'))) fail('CUSTOMER_CATALOG_CONFIG_INVALID', 503);
  let state, queue = Promise.resolve();
  const enabled = () => { if (!config) fail('CUSTOMER_CATALOG_PILOT_DISABLED', 503); };
  async function load() {
    enabled(); if (state) return;
    try {
      const info = await lstat(storeFile);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) fail('CUSTOMER_CATALOG_STORE_UNAVAILABLE', 503);
      state = JSON.parse(await readFile(storeFile, 'utf8'));
      if (state?.version !== VERSION || !Array.isArray(state.sessions) || state.sessions.length > 128
        || state.sessions.some(session => !UUID.test(session.id || '') || !/^[a-f0-9]{64}$/.test(session.tokenHash || '')
          || !Number.isFinite(session.expiresAt) || !Number.isSafeInteger(session.revision) || !Array.isArray(session.items)
          || !/^[a-f0-9]{64}$/.test(session.configRevision || ''))) fail('CUSTOMER_CATALOG_STORE_UNAVAILABLE', 503);
    } catch (error) {
      state = undefined;
      if (error.code === 'ENOENT') state = { version: VERSION, sessions: [] };
      else fail('CUSTOMER_CATALOG_STORE_UNAVAILABLE', 503);
    }
  }
  async function persist() {
    const directory = path.dirname(storeFile);
    const temporary = path.join(directory, `.customer-catalog-${randomUUID()}.tmp`);
    try {
      await mkdir(directory, { recursive: true });
      if ((await lstat(directory)).isSymbolicLink()) fail('CUSTOMER_CATALOG_STORE_UNAVAILABLE', 503);
      await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, storeFile);
    } catch { await unlink(temporary).catch(() => {}); state = undefined; fail('CUSTOMER_CATALOG_STORE_UNAVAILABLE', 503); }
  }
  function serial(work) { const job = queue.then(work); queue = job.catch(() => {}); return job; }
  function assertSession(session) {
    if (!session || session.revoked || session.expiresAt <= now() || session.configRevision !== config.revision
      || session.conversationId !== config.conversationId || session.customerId !== config.customerId || session.actorId !== config.actorId) fail('CUSTOMER_CATALOG_SESSION_INVALID', 401);
  }
  async function checked(session, action) {
    assertSession(session);
    if (await verifyScope(publicScope(session)) !== true) fail('CUSTOMER_CATALOG_SCOPE_UNAVAILABLE', 503);
    const result = await action();
    assertSession(session);
    if (await verifyScope(publicScope(session)) !== true) fail('CUSTOMER_CATALOG_SCOPE_UNAVAILABLE', 503);
    return result;
  }
  async function customer(token, action) {
    return serial(async () => {
      await load();
      if (!TOKEN.test(token || '')) fail('CUSTOMER_CATALOG_SESSION_INVALID', 401);
      const session = state.sessions.find(entry => entry.tokenHash === digest(token));
      return checked(session, () => action(session));
    });
  }
  async function cards(session) {
    const result = [];
    for (const entry of config.products) {
      const payload = await readProduct(entry.id, publicScope(session));
      result.push(envelopeRow(payload, entry, config, now()));
    }
    return result;
  }
  const facets = products => Object.fromEntries([['ages', 'age'], ['types', 'type'], ['colors', 'color']]
    .map(([name, key]) => [name, [...new Set(products.map(entry => entry[key]).filter(Boolean))].sort()]));
  async function currentOrder(session) {
    if (!session.pending) return null;
    if (typeof readDraft !== 'function') fail('CUSTOMER_CATALOG_DRAFT_UNAVAILABLE', 503);
    const value = await readDraft(session.pending.requestId, publicScope(session));
    if (value === null) return null;
    return verifyReadback(value, session.pending, publicScope(session));
  }
  async function refreshedCart(session, current) {
    if (session.pending) return copy(session.pending.summary);
    // Reading a now-too-large selection must keep it available for correction.
    // Only the order writer requires a currently valid cart; quantities are never clamped.
    let cart = buildCart(session.items, current, config.currency, session.revision, { allowStockErrors: true });
    const fingerprint = pricedFingerprint(session.items, current);
    if (session.items.length && session.pricedFingerprint !== fingerprint) {
      session.revision++; session.pricedFingerprint = fingerprint;
      cart = { ...cart, revision: session.revision }; await persist();
    }
    return cart;
  }
  async function releaseUntransportedIntent(session) {
    session.pending = null;
    // A new source snapshot must be shown and confirmed before another intent.
    session.pricedFingerprint = null;
    await persist();
  }
  return {
    enabled: Boolean(config),
    staffSessions: (actor, conversationId) => serial(async () => {
      await load();
      if (actor?.id !== config.actorId || !actor.permissions?.includes('crm.send') || String(conversationId) !== config.conversationId) fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
      const sessions = [];
      for (const session of state.sessions) {
        if (session.revoked || session.expiresAt <= now() || session.configRevision !== config.revision) continue;
        await checked(session, async () => sessions.push({ sessionId: session.id, expiresAt: new Date(session.expiresAt).toISOString(),
          revision: session.revision, itemCount: session.items.length, orderPending: Boolean(session.pending) }));
      }
      return { sessions, conversationId: config.conversationId, testOnly: true };
    }),
    staffSalesContext: (actor, id) => serial(async () => {
      await load();
      if (actor?.id !== config.actorId || !actor.permissions?.includes('crm.send')) fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
      const session = state.sessions.find(entry => entry.id === id);
      if (!session) fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
      return checked(session, async () => {
        const current = await cards(session);
        // AI reads never reprice, persist, create an order or reuse a historical order selection.
        if (session.pending) fail('CUSTOMER_CATALOG_ORDER_LOCKED', 409);
        if (session.items.length && session.pricedFingerprint !== pricedFingerprint(session.items, current)) fail('CUSTOMER_CATALOG_PRICE_CHANGED', 409);
        const cart = buildCart(session.items, current, config.currency, session.revision);
        const sourceFingerprint = digest(JSON.stringify(current.map(card => [card.public, card.revision, card.sourcePriceExact, card.priceId, card.unitSourceId, card.priceSourceKey])));
        const snapshot = { ...publicScope(session), revision: session.revision, configRevision: config.revision,
          expiresAt: new Date(session.expiresAt).toISOString(), sourceFingerprint, products: current.map(card => copy(card.public)), cart,
          source: 'melisa-personal-test-catalog', sourceEnvironment: config.sourceEnvironment, sourceDatabaseVerified: true,
          readOnly: true, testOnly: true, orderPending: false };
        return { ...snapshot, fingerprint: digest(JSON.stringify(snapshot)), fetchedAt: new Date(now()).toISOString() };
      });
    }),
    issue: (actor, input) => serial(async () => {
      await load();
      if (actor?.id !== config.actorId || !actor.permissions?.includes('crm.send')
        || !input || Object.keys(input).length !== 1 || String(input.conversationId) !== config.conversationId) fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
      const session = { id: randomUUID(), tokenHash: '', configRevision: config.revision, actorId: config.actorId,
        conversationId: config.conversationId, customerId: config.customerId, customerLabel: config.customerLabel,
        expiresAt: now() + config.sessionTtlMs, revoked: false, revision: 0, items: [], pricedFingerprint: null, pending: null };
      if (await verifyScope(publicScope(session)) !== true) fail('CUSTOMER_CATALOG_SCOPE_UNAVAILABLE', 503);
      // Mint only after current source cards are verified; unconfigured series remain visibly unselectable.
      await cards(session);
      if (await verifyScope(publicScope(session)) !== true) fail('CUSTOMER_CATALOG_SCOPE_UNAVAILABLE', 503);
      state.sessions = state.sessions.filter(entry => entry.expiresAt > now());
      if (state.sessions.length >= 128) fail('CUSTOMER_CATALOG_SESSION_LIMIT', 429);
      const token = randomBytes(32).toString('base64url'); session.tokenHash = digest(token);
      state.sessions.push(session); await persist();
      return { sessionId: session.id, url: `/katalog#${token}`, expiresAt: new Date(session.expiresAt).toISOString(), testOnly: true };
    }),
    staffRead: (actor, id) => serial(async () => {
      await load(); if (actor?.id !== config.actorId || !actor.permissions?.includes('crm.send')) fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
      const session = state.sessions.find(entry => entry.id === id); if (!session) fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
      return checked(session, async () => ({ sessionId: session.id, conversationId: session.conversationId,
        expiresAt: new Date(session.expiresAt).toISOString(), cart: await refreshedCart(session, await cards(session)),
        order: await currentOrder(session), orderPending: Boolean(session.pending), testOnly: true }));
    }),
    revoke: (actor, id) => serial(async () => {
      await load(); if (actor?.id !== config.actorId || !actor.permissions?.includes('crm.send')) fail('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED', 403);
      const session = state.sessions.find(entry => entry.id === id); if (!session) fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
      session.revoked = true; await persist(); return { revoked: true };
    }),
    session: token => customer(token, async session => {
      const current = await cards(session), products = current.map(entry => entry.public), order = await currentOrder(session);
      return { sessionId: session.id, expiresAt: new Date(session.expiresAt).toISOString(), customerLabel: session.customerLabel,
        testOnly: true, products, facets: facets(products), cart: await refreshedCart(session, current),
        order, orderPending: Boolean(session.pending) && order === null };
    }),
    products: (token, query = {}) => customer(token, async session => {
      if (Object.keys(query).some(key => !['scope', 'search', 'age', 'type', 'color', 'maxPrice'].includes(key))
        || Object.values(query).some(value => typeof value !== 'string' || value.length > 120)
        || query.scope && !['all', 'recommended'].includes(query.scope)
        || query.maxPrice && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(query.maxPrice)) fail('CUSTOMER_CATALOG_FILTER_INVALID');
      const all = (await cards(session)).map(entry => entry.public), search = (query.search || '').trim().toLocaleLowerCase('tr-TR');
      return { products: all.filter(entry => (query.scope !== 'recommended' || entry.recommended)
        && (!search || `${entry.stockCode} ${entry.productName}`.toLocaleLowerCase('tr-TR').includes(search))
        && ['age', 'type', 'color'].every(key => !query[key] || entry[key] === query[key])
        && (!query.maxPrice || entry.unitPrice !== null && entry.unitPrice <= Number(query.maxPrice))), facets: facets(all) };
    }),
    photo: (token, id) => customer(token, async session => {
      const card = (await cards(session)).find(entry => entry.public.id === id);
      if (!card?.public.photoPath || typeof readPhoto !== 'function') fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
      const response = await readPhoto(id, publicScope(session));
      const mime = response?.headers?.get('content-type')?.split(';')[0];
      if (!(response instanceof Response) || !response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) fail('CUSTOMER_CATALOG_PHOTO_UNAVAILABLE', 503);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const signature = mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === 'image/png' ? [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
          : new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
      if (bytes.length > 3 * 1024 * 1024 || !signature) fail('CUSTOMER_CATALOG_PHOTO_UNAVAILABLE', 503);
      return new Response(bytes, { headers: { 'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    }),
    updateCart: (token, input) => customer(token, async session => {
      const items = cartInput(input, config);
      if (input.revision !== session.revision) fail('CUSTOMER_CATALOG_REVISION_CONFLICT', 409);
      if (session.pending) fail('CUSTOMER_CATALOG_ORDER_LOCKED', 409);
      const current = await cards(session), cart = buildCart(items, current, config.currency, session.revision + 1, { allowStockErrors: true });
      if (!cart.valid) {
        const previous = new Map(session.items.map(item => [item.productId, item.seriesCount]));
        // An invalid selection can only move toward a smaller cart until it fits.
        // New unavailable lines, increases, or unchanged invalid retries never become writes.
        if (items.some(item => item.seriesCount > (previous.get(item.productId) ?? 0))
          || !session.items.some(item => (items.find(next => next.productId === item.productId)?.seriesCount ?? 0) < item.seriesCount)) {
          fail('CUSTOMER_CATALOG_STOCK_LIMIT', 409);
        }
      }
      session.items = items; session.pricedFingerprint = pricedFingerprint(items, current); session.revision++; await persist(); return cart;
    }),
    order: token => customer(token, currentOrder),
    submitOrder: (token, input) => customer(token, async session => {
      if (!input || Object.keys(input).length !== 1 || !Number.isSafeInteger(input.revision) || input.revision !== session.revision) fail('CUSTOMER_CATALOG_REVISION_CONFLICT', 409);
      if (![createDraft, readDraft].every(value => typeof value === 'function')) fail('CUSTOMER_CATALOG_DRAFT_UNAVAILABLE', 503);
      if (!session.pending) {
        const current = await cards(session), summary = buildCart(session.items, current, config.currency, session.revision);
        if (!summary.items.length) fail('CUSTOMER_CATALOG_CART_EMPTY');
        if (session.pricedFingerprint !== pricedFingerprint(session.items, current)) fail('CUSTOMER_CATALOG_PRICE_CHANGED', 409);
        session.pending = { requestId: randomUUID(), transportStarted: false, summary, items: session.items.map(item => {
          const card = current.find(entry => entry.public.id === item.productId);
          return { productId: item.productId, stockCode: card.public.stockCode, quantity: item.seriesCount * card.public.series.totalPieces,
            priceId: card.priceId, unitSourceId: card.unitSourceId, expectedPriceExact: card.sourcePriceExact, expectedCurrency: card.public.currency,
            expectedRevision: card.revision, expectedPriceSourceKey: card.priceSourceKey };
        }) };
        await persist(); // Unknown transport outcome always reuses this exact UUID/body.
      }
      // Old journals without this phase are conservatively treated as attempted.
      const priorTransport = session.pending.transportStarted !== false;
      const existing = await currentOrder(session);
      if (existing) return existing;
      // A verified missing receipt permits retry of the same body, never a new
      // quote. Recheck current piece capacity and exact selected source before
      // repeating transport; a persisted historical receipt remains readable.
      try {
        const retryCards = await cards(session);
        buildCart(session.items, retryCards, config.currency, session.revision);
        if (session.pricedFingerprint !== pricedFingerprint(session.items, retryCards)) fail('CUSTOMER_CATALOG_PRICE_CHANGED', 409);
        for (const line of session.pending.items) {
          const card = retryCards.find(value => value.public.id === line.productId);
          if (!card || card.sourcePriceExact !== line.expectedPriceExact || card.public.currency !== line.expectedCurrency
            || card.revision !== line.expectedRevision || Number(card.priceId) !== Number(line.priceId)
            || Number(card.unitSourceId) !== Number(line.unitSourceId) || card.priceSourceKey !== line.expectedPriceSourceKey
            || card.public.stockCode !== line.stockCode
            || session.pending.summary.items.find(value => value.productId === line.productId)?.pieceCount !== line.quantity) {
            fail('CUSTOMER_CATALOG_PRICE_CHANGED', 409);
          }
        }
        assertSession(session);
        if (await verifyScope(publicScope(session)) !== true) fail('CUSTOMER_CATALOG_SCOPE_UNAVAILABLE', 503);
      } catch (error) {
        if (!priorTransport) await releaseUntransportedIntent(session);
        throw error;
      }
      session.pending.transportStarted = true;
      await persist(); // A crash after this point must retain the unknown-outcome lock.
      const intent = copy(session.pending);
      delete intent.transportStarted;
      try { await createDraft({ scope: publicScope(session), ...intent }); }
      catch (error) {
        // Only explicit adapter proof on the first transport can release a lock.
        // A later safe rejection cannot disprove an earlier unknown transport.
        if (!priorTransport && error.beforeTransport === true) await releaseUntransportedIntent(session);
        throw error;
      }
      const order = await currentOrder(session);
      if (!order) fail('CUSTOMER_CATALOG_ORDER_PENDING', 503);
      return order;
    }),
  };
}
