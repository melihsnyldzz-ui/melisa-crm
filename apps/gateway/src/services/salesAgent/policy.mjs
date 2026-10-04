/** Trusted server-side rules and ERP/Vega snapshots only. Never pass request.body here. */
export function salesError(code, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode });
}

function integer(value, min = 0, max = 1_000_000_000) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validatePolicy(input = {}) {
  const allowed = ['version', 'minimumOrder', 'telegramUrl'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !allowed.includes(key))) throw salesError('AI_POLICY_INVALID');
  const version = input.version ?? 'unconfigured-v1';
  if (typeof version !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(version)) throw salesError('AI_POLICY_INVALID');
  const minimum = input.minimumOrder ?? null;
  if (minimum !== null && (!minimum || Array.isArray(minimum)
      || Object.keys(minimum).sort().join(',') !== 'amountMinor,currency'
      || !integer(minimum.amountMinor, 1) || !['TRY', 'USD', 'EUR'].includes(minimum.currency))) {
    throw salesError('AI_POLICY_INVALID');
  }
  const telegramUrl = input.telegramUrl ?? null;
  if (telegramUrl !== null && (typeof telegramUrl !== 'string'
      || !/^https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(telegramUrl))) throw salesError('AI_POLICY_INVALID');
  return Object.freeze({
    version,
    minimumOrder: minimum === null ? null : Object.freeze({ ...minimum }),
    telegramUrl,
    wholesaleOnly: true,
    breakSeries: false,
    discountAllowed: false,
    inventShippingCostOrDate: false,
    autoSend: false,
    writeErp: false,
  });
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
  if (!policy.minimumOrder) throw salesError('AI_MINIMUM_ORDER_UNCONFIGURED');
  if (policy.minimumOrder.currency !== currency) throw salesError('AI_FX_REQUIRES_HUMAN');
  if (totalMinor < policy.minimumOrder.amountMinor) {
    const error = salesError('AI_MINIMUM_ORDER_NOT_MET');
    error.shortfallMinor = policy.minimumOrder.amountMinor - totalMinor;
    error.currency = currency;
    throw error;
  }
  return { lines: result, totalMinor, currency, shippingIncluded: false, taxCalculated: false,
    stockReserved: false, orderCreated: false, revalidateBeforeOrder: true };
}
