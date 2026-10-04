/** Trusted server-side rules and ERP/Vega snapshots only. Never pass request.body here. */
export function salesError(code, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode });
}

function integer(value, min = 0, max = 1_000_000_000) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

const MINIMUM_MODES = ['unconfigured', 'none', 'amount'];

function minimumRule(input) {
  const minimum = input.minimumOrder ?? null;
  const mode = input.minimumOrderMode ?? (minimum === null ? 'unconfigured' : 'amount');
  if (!MINIMUM_MODES.includes(mode) || (mode === 'amount') !== (minimum !== null)
      || (minimum !== null && (!minimum || typeof minimum !== 'object' || Array.isArray(minimum)
        || Object.keys(minimum).sort().join(',') !== 'amountMinor,currency'
        || !integer(minimum.amountMinor, 1) || !['TRY', 'USD', 'EUR'].includes(minimum.currency)))) {
    throw salesError('AI_POLICY_INVALID');
  }
  return { minimumOrderMode: mode, minimumOrder: minimum === null ? null
    : Object.freeze({ amountMinor: minimum.amountMinor, currency: minimum.currency }) };
}

function policyText(value = '', limit = 2000) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw salesError('AI_POLICY_INVALID');
  }
  return value.trim();
}

export function validatePolicy(input = {}) {
  const allowed = ['version', 'minimumOrderMode', 'minimumOrder', 'telegramUrl', 'countryRules', 'shippingTerms', 'salesNotes'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !allowed.includes(key))) throw salesError('AI_POLICY_INVALID');
  const version = input.version ?? 'unconfigured-v1';
  if (typeof version !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(version)) throw salesError('AI_POLICY_INVALID');
  const minimum = minimumRule(input);
  const telegramUrl = input.telegramUrl ?? null;
  if (telegramUrl !== null && (typeof telegramUrl !== 'string'
      || !/^https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(telegramUrl))) throw salesError('AI_POLICY_INVALID');
  const countries = input.countryRules ?? [];
  if (!Array.isArray(countries) || countries.length > 12) throw salesError('AI_POLICY_INVALID');
  const seen = new Set();
  const countryRules = countries.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)
        || Object.keys(rule).some(key => !['country', 'minimumOrderMode', 'minimumOrder', 'notes'].includes(key))) {
      throw salesError('AI_POLICY_INVALID');
    }
    const country = policyText(rule.country, 80);
    const identity = country.toLocaleLowerCase('tr-TR');
    if (!country || seen.has(identity)) throw salesError('AI_POLICY_INVALID');
    seen.add(identity);
    return Object.freeze({ country, ...minimumRule(rule), notes: policyText(rule.notes, 1000) });
  });
  return Object.freeze({
    version,
    ...minimum,
    telegramUrl,
    countryRules: Object.freeze(countryRules),
    shippingTerms: policyText(input.shippingTerms),
    salesNotes: policyText(input.salesNotes),
    wholesaleOnly: true,
    breakSeries: false,
    discountAllowed: false,
    inventShippingCostOrDate: false,
    autoSend: false,
    writeErp: false,
  });
}

/** Editable server-owned fields only; hard execution limits are never editable. */
export function editablePolicy(input = {}) {
  const policy = validatePolicy(input);
  return structuredClone(Object.fromEntries(['version', 'minimumOrderMode', 'minimumOrder', 'telegramUrl',
    'countryRules', 'shippingTerms', 'salesNotes'].map(key => [key, policy[key]])));
}

export function policyFacts(policy) {
  return { ...editablePolicy(policyToInput(policy)), countrySelection: 'unverified', shippingConfirmation: 'staff',
    requiresStaffConfirmation: policy.minimumOrderMode === 'unconfigured' || policy.countryRules.length > 0 || !policy.shippingTerms,
    discountAllowed: false, breakSeries: false, autoSend: false, writeErp: false };
}

function policyToInput(policy) {
  return Object.fromEntries(['version', 'minimumOrderMode', 'minimumOrder', 'telegramUrl',
    'countryRules', 'shippingTerms', 'salesNotes'].map(key => [key, policy[key]]));
}

/** Numeric minimums stay in the reviewed policy card, never in the model request. */
export function modelPolicy(policy) {
  const note = value => value.replace(/\p{Nd}+(?:[.,]\p{Nd}+)*/gu, '[value in reviewed policy card]');
  return { version: policy.version, minimumOrder: null, minimumOrderMode: policy.minimumOrderMode,
    minimumAvailable: policy.minimumOrderMode !== 'unconfigured', minimumCurrency: policy.minimumOrder?.currency ?? null,
    telegramUrl: policy.telegramUrl, countrySelection: 'unverified',
    countryRules: policy.countryRules.map(({ country, minimumOrderMode, minimumOrder, notes }) => ({ country,
      minimumOrderMode, minimumAvailable: minimumOrderMode !== 'unconfigured', minimumCurrency: minimumOrder?.currency ?? null,
      notes: note(notes) })), shippingTerms: note(policy.shippingTerms), shippingConfirmation: 'staff',
    salesNotes: note(policy.salesNotes), wholesaleOnly: true, breakSeries: false, discountAllowed: false,
    inventShippingCostOrDate: false, autoSend: false, writeErp: false };
}

/** All money is in hundredths (TRY/USD/EUR). Quantity and price basis are pieces. */
export function trustedProducts(input, now = Date.now()) {
  if (!Array.isArray(input) || input.length > 30 || !Number.isSafeInteger(now)) throw salesError('AI_CATALOG_INVALID');
  const seen = new Set();
  return input.map(product => {
    if (!product || typeof product !== 'object'
        || typeof product.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(product.id)
        || seen.has(product.id) || typeof product.name !== 'string' || !product.name.trim() || product.name.length > 200
        || !integer(product.unitPriceMinor, 1) || !['TRY', 'USD', 'EUR'].includes(product.currency)
        || product.priceBasis !== 'piece' || !integer(product.seriesSize, 1, 1000)
        || !integer(product.stockQty) || !Number.isSafeInteger(product.observedAt)
        || product.observedAt > now || now - product.observedAt > 300_000
        || !['erp', 'vega'].includes(product.source?.system)
        || typeof product.source.company !== 'string' || !product.source.company || product.source.company.length > 80
        || typeof product.source.period !== 'string' || !product.source.period || product.source.period.length > 80) {
      throw salesError('AI_CATALOG_UNVERIFIED');
    }
    seen.add(product.id);
    return Object.freeze({ id: product.id, name: product.name.trim(), unitPriceMinor: product.unitPriceMinor,
      currency: product.currency, priceBasis: 'piece', seriesSize: product.seriesSize,
      stockQty: product.stockQty, observedAt: product.observedAt,
      source: Object.freeze({ system: product.source.system, company: product.source.company, period: product.source.period }) });
  });
}

export function validateProposal(value) {
  const keys = ['action', 'reply', 'summaryTr', 'productIds', 'lines', 'handoffReason'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== keys.sort().join(',')
      || !['reply', 'recommend', 'quote', 'handoff'].includes(value.action)
      || typeof value.reply !== 'string' || !value.reply.trim() || value.reply.length > 4000
      || typeof value.summaryTr !== 'string' || value.summaryTr.length > 1500
      || typeof value.handoffReason !== 'string' || value.handoffReason.length > 500
      || !Array.isArray(value.productIds) || value.productIds.length > 10
      || value.productIds.some(id => typeof id !== 'string' || id.length > 100)
      || new Set(value.productIds).size !== value.productIds.length
      || !Array.isArray(value.lines) || value.lines.length > 10
      || value.lines.some(line => !line || typeof line !== 'object' || Array.isArray(line)
        || Object.keys(line).sort().join(',') !== 'productId,quantity'
        || typeof line.productId !== 'string' || line.productId.length > 100 || !integer(line.quantity, 1, 100_000))) {
    throw salesError('AI_PROPOSAL_INVALID', 502);
  }
  if ((value.action === 'quote' && !value.lines.length)
      || (value.action !== 'quote' && value.lines.length)
      || (value.action === 'recommend' && !value.productIds.length)
      || (value.action === 'handoff' && !value.handoffReason.trim())) throw salesError('AI_PROPOSAL_INVALID', 502);
  return structuredClone(value);
}

export function buildQuote(lines, products, policy) {
  if (!lines.length) throw salesError('AI_QUOTE_EMPTY');
  const catalog = new Map(products.map(product => [product.id, product]));
  const seen = new Set();
  const result = lines.map(line => {
    const product = catalog.get(line.productId);
    if (!product || seen.has(line.productId)) throw salesError('AI_PRODUCT_UNKNOWN_OR_DUPLICATE');
    seen.add(line.productId);
    if (!integer(line.quantity, 1, 100_000) || line.quantity % product.seriesSize !== 0) throw salesError('AI_SERIES_REQUIRED');
    if (line.quantity > product.stockQty) throw salesError('AI_STOCK_INSUFFICIENT');
    const totalMinor = product.unitPriceMinor * line.quantity;
    if (!Number.isSafeInteger(totalMinor)) throw salesError('AI_QUOTE_OVERFLOW');
    return { productId: product.id, quantity: line.quantity, unitPriceMinor: product.unitPriceMinor,
      totalMinor, currency: product.currency, priceBasis: product.priceBasis,
      observedAt: product.observedAt, source: product.source };
  });
  const currencies = new Set(result.map(line => line.currency));
  if (currencies.size !== 1) throw salesError('AI_MIXED_CURRENCY_REQUIRES_HUMAN');
  const currency = result[0].currency;
  const totalMinor = result.reduce((sum, line) => sum + line.totalMinor, 0);
  if (!Number.isSafeInteger(totalMinor)) throw salesError('AI_QUOTE_OVERFLOW');
  if (policy.countryRules.length) throw salesError('AI_COUNTRY_REQUIRES_HUMAN');
  if (policy.minimumOrderMode === 'unconfigured') throw salesError('AI_MINIMUM_ORDER_UNCONFIGURED');
  if (policy.minimumOrderMode === 'amount' && policy.minimumOrder.currency !== currency) throw salesError('AI_FX_REQUIRES_HUMAN');
  if (policy.minimumOrderMode === 'amount' && totalMinor < policy.minimumOrder.amountMinor) {
    const error = salesError('AI_MINIMUM_ORDER_NOT_MET');
    error.shortfallMinor = policy.minimumOrder.amountMinor - totalMinor;
    error.currency = currency;
    throw error;
  }
  return { lines: result, totalMinor, currency, shippingIncluded: false, taxCalculated: false,
    stockReserved: false, orderCreated: false, revalidateBeforeOrder: true };
}
