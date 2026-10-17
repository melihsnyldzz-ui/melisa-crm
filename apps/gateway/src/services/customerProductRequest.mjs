import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const DATABASE = 'MELISA_ERP_CRM_SHARED_TEST_20261009_02';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PRODUCT = /^(?:vega|erp)-[1-9][0-9]*$/;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 9999;
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && String(Number(value)) === String(value);
const label = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = (code, statusCode = 400) => { throw Object.assign(new Error(code), { code, statusCode }); };
const BINDING_KEYS = ['backend', 'provider', 'accountId', 'inboxId', 'chatwootConversationId', 'chatwootContactId', 'assigneeId', 'customerFingerprint'];

function bindingValue(value) {
  if (!exactKeys(value, BINDING_KEYS) || value.backend !== 'chatwoot' || value.provider !== 'chatwoot'
    || !BINDING_KEYS.filter(key => !['backend', 'provider', 'customerFingerprint'].includes(key)).every(key => positive(value[key]))
    || !HASH.test(value.customerFingerprint || '')) fail('CUSTOMER_REQUEST_BINDING_UNAVAILABLE', 503);
  return Object.fromEntries(BINDING_KEYS.map(key => [key, ['backend', 'provider', 'customerFingerprint'].includes(key) ? value[key] : String(value[key])]));
}
function sameBinding(left, right) { return BINDING_KEYS.every(key => left[key] === right[key]); }
function issuerValue(actor, now) {
  if (!actor || !label(actor.id, 100) || !UUID.test(actor.normalSessionId || '') || !HASH.test(actor.fingerprint || '')
    || !Number.isSafeInteger(actor.expiresAt) || actor.expiresAt <= now) fail('CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED', 401);
  return { id: actor.id, normalSessionId: actor.normalSessionId, fingerprint: actor.fingerprint, expiresAt: actor.expiresAt };
}
function staff(actor, manage = false) {
  if (!actor?.active || actor.testAdmin || actor.testPersonnel || !['patron', 'mudur', 'personel'].includes(actor.role)
    || !Array.isArray(actor.permissions) || !actor.permissions.includes('crm.view')
    || manage && (!['patron', 'mudur'].includes(actor.role) || !actor.permissions.includes('crm.manage'))) fail('CUSTOMER_REQUEST_FORBIDDEN', 403);
}
function reviewedConfig(raw) {
  if (!raw?.enabled) return null;
  if (raw.enabled !== true || raw.isolatedPreparation !== true || raw.database !== DATABASE || raw.live === true
    || !label(raw.catalogScope, 120) || !Number.isSafeInteger(raw.sessionTtlMs ?? 3600000)
    || (raw.sessionTtlMs ?? 3600000) < 60000 || (raw.sessionTtlMs ?? 3600000) > 3600000
    || raw.allowedProductIds !== undefined && (!Array.isArray(raw.allowedProductIds) || !raw.allowedProductIds.length
      || raw.allowedProductIds.length > 10000 || raw.allowedProductIds.some(id => !PRODUCT.test(id) || !Number.isSafeInteger(Number(id.split('-')[1])))
      || new Set(raw.allowedProductIds).size !== raw.allowedProductIds.length)) fail('CUSTOMER_REQUEST_CONFIG_INVALID', 503);
  const config = { isolatedPreparation: true, database: DATABASE, catalogScope: raw.catalogScope,
    sessionTtlMs: raw.sessionTtlMs ?? 3600000, allowedProductIds: raw.allowedProductIds ? [...raw.allowedProductIds].sort() : null };
  return { ...config, revision: digest(JSON.stringify(config)) };
}
function productCard(row, config) {
  if (!row || !PRODUCT.test(row.id || '') || !Number.isSafeInteger(Number(row.id.split('-')[1]))
    || config.allowedProductIds && !config.allowedProductIds.includes(row.id)
    || row.active !== true || !label(row.stockCode) || !label(row.productName, 250)
    || row.photoStatus !== 'guarded-path' || row.photoPath !== `/crm/catalog/products/${row.id}/photo`
    || row.category !== undefined && row.category !== null && !label(row.category)
    || row.age !== undefined && row.age !== null && !label(row.age)) fail('CUSTOMER_REQUEST_PRODUCT_UNAVAILABLE', 503);
  // This is an interest request, not a stock, price or delivery promise.
  return { id: row.id, stockCode: row.stockCode, productName: row.productName, category: row.category ?? null,
    age: row.age ?? null, photoPath: `/api/live/customer-product-requests/products/${row.id}/photo` };
}
function productEnvelope(payload, config, id) {
  if (payload?.success !== true || payload.meta?.sourceDatabaseVerified !== true || payload.meta?.cached !== false
    || payload.data?.id !== id) fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE', 503);
  return productCard(payload.data, config);
}
function itemInput(input) {
  if (!exactKeys(input, ['revision', 'items']) || !Number.isSafeInteger(input.revision) || input.revision < 0
    || !Array.isArray(input.items) || input.items.length > MAX_ITEMS
    || input.items.some(item => !exactKeys(item, ['productId', 'quantity']) || !PRODUCT.test(item.productId || '')
      || !Number.isSafeInteger(Number(item.productId.split('-')[1])) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY)
    || new Set(input.items.map(item => item.productId)).size !== input.items.length) fail('CUSTOMER_REQUEST_DRAFT_INVALID');
  return input.items.map(item => ({ productId: item.productId, quantity: item.quantity }));
}
function publicRequest(request) {
  const items = request?.items.map(item => ({ id: item.id, productId: item.productId, quantity: item.quantity, stockCode: item.stockCode,
    productName: item.productName, category: item.category ?? null, age: item.age ?? null, photoPath: item.photoPath }));
  return request ? { id: request.id, status: 'interest', submittedAt: request.submittedAt, items,
    modelCount: request.items.length, quantityTotal: request.items.reduce((sum, item) => sum + item.quantity, 0) } : null;
}

/** TEST-only customer capabilities; persistent interest records have no commercial/provider side effects. */
export function createCustomerProductRequestService({ config: rawConfig, storeFile, resolveBinding, validateBinding,
  readCatalogPage, readProduct, readPhoto, now = Date.now, capability = () => randomBytes(32).toString('base64url') } = {}) {
  const config = reviewedConfig(rawConfig);
  if (config && (!path.isAbsolute(storeFile || '') || ![resolveBinding, validateBinding, readCatalogPage, readProduct, readPhoto].every(fn => typeof fn === 'function'))) fail('CUSTOMER_REQUEST_CONFIG_INVALID', 503);
  const enabled = () => {
    if (!config || reviewedConfig(rawConfig)?.revision !== config.revision) fail('CUSTOMER_REQUEST_DISABLED', 503);
  };
  const assertPaths = async () => {
    let directory = path.dirname(storeFile);
    while (true) {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
      const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
    }
  };
  const read = async () => {
    try { await assertPaths(); } catch { fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503); }
    let data;
    try {
      const info = await lstat(storeFile);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024) fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
      data = JSON.parse(await readFile(storeFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, sessions: [], requests: [] };
      fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
    }
    if (data?.version !== 1 || !Array.isArray(data.sessions) || data.sessions.length > 512 || !Array.isArray(data.requests) || data.requests.length > 512
      || data.sessions.some(session => !UUID.test(session?.id || '') || !HASH.test(session.tokenHash || '') || !HASH.test(session.configRevision || '')
        || !Number.isSafeInteger(session.expiresAt) || typeof session.revoked !== 'boolean' || !Number.isSafeInteger(session.revision) || session.revision < 0
        || !Array.isArray(session.items) || session.items.length > MAX_ITEMS || session.items.some(item => !PRODUCT.test(item?.productId || '') || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY))
      || new Set(data.sessions.map(session => session.id)).size !== data.sessions.length
      || new Set(data.sessions.map(session => session.tokenHash)).size !== data.sessions.length
      || data.requests.some(request => !UUID.test(request?.id || '') || !UUID.test(request.sessionId || '') || !UUID.test(request.operationId || '')
        || !Number.isSafeInteger(request.revision) || !Number.isSafeInteger(request.submittedAt) || request.status !== 'interest' || !Array.isArray(request.items) || !request.items.length || request.items.length > MAX_ITEMS)
      || new Set(data.requests.map(request => request.id)).size !== data.requests.length
      || new Set(data.requests.map(request => request.sessionId)).size !== data.requests.length
      || new Set(data.requests.map(request => request.operationId)).size !== data.requests.length) fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
    try {
      for (const session of data.sessions) {
        bindingValue(session.binding); issuerValue(session.issuer, 0);
        if (new Set(session.items.map(item => item.productId)).size !== session.items.length) throw Error('Invalid items');
        const request = data.requests.find(value => value.sessionId === session.id);
        if (session.submittedRequestId ? request?.id !== session.submittedRequestId || request.revision !== session.revision
          || request.selectionDigest !== digest(JSON.stringify(session.items)) || !sameBinding(bindingValue(request.binding), session.binding)
          || request.items.length !== session.items.length || request.items.some((item, index) => item.productId !== session.items[index]?.productId || item.quantity !== session.items[index]?.quantity) : Boolean(request)) throw Error('Invalid submission');
      }
      for (const request of data.requests) {
        if (!data.sessions.some(session => session.id === request.sessionId) || new Set(request.items.map(item => item.productId)).size !== request.items.length
          || request.items.some(item => !PRODUCT.test(item?.productId || '') || item.id !== item.productId || !label(item.stockCode) || !label(item.productName, 250)
            || item.photoPath !== `/api/live/customer-product-requests/products/${item.productId}/photo` || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY)) throw Error('Invalid request');
      }
    } catch { fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503); }
    return data;
  };
  const transaction = async work => {
    enabled(); let lock, temporary;
    try {
      await mkdir(path.dirname(storeFile), { recursive: true, mode: 0o700 }); await assertPaths();
      lock = await open(`${storeFile}.lock`, 'wx', 0o600);
      const data = await read(), result = await work(data);
      const text = JSON.stringify(data); if (Buffer.byteLength(text) > 16 * 1024 * 1024) fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
      temporary = `${storeFile}.${randomUUID()}.tmp`;
      const fd = await open(temporary, 'wx', 0o600);
      try { await fd.writeFile(text); await fd.sync(); } finally { await fd.close(); }
      await assertPaths(); await rename(temporary, storeFile); temporary = null;
      return result;
    } catch (error) {
      if (error.statusCode) throw error;
      fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      if (lock) { await lock.close(); await unlink(`${storeFile}.lock`).catch(() => {}); }
    }
  };
  const sessionValid = session => {
    enabled();
    if (!session || session.revoked || session.expiresAt <= now() || session.issuer.expiresAt <= now()
      || session.configRevision !== config.revision) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
  };
  const checked = async (session, action) => {
    sessionValid(session);
    if (await validateBinding(clone(session.binding), clone(session.issuer)) !== true) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
    const value = await action(); sessionValid(session);
    if (await validateBinding(clone(session.binding), clone(session.issuer)) !== true) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
    return value;
  };
  const lookup = (data, token) => {
    if (!TOKEN.test(token || '')) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
    const session = data.sessions.find(value => value.tokenHash === digest(token)); sessionValid(session); return session;
  };
  const customer = async (token, action, mutate = false) => {
    enabled();
    if (mutate) return transaction(data => { const session = lookup(data, token); return checked(session, () => action(session, data)); });
    const data = await read(), session = lookup(data, token), result = await checked(session, () => action(session, data));
    const fresh = lookup(await read(), token);
    if (!sameBinding(fresh.binding, session.binding) || await validateBinding(clone(fresh.binding), clone(fresh.issuer)) !== true) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
    return result;
  };
  const selected = async session => {
    const rows = [];
    for (const item of session.items) rows.push({ ...productEnvelope(await readProduct(item.productId, clone(session.binding), clone(session.issuer)), config, item.productId), ...item });
    return rows;
  };
  const sessionDTO = async (session, data) => {
    const request = data.requests.find(value => value.id === session.submittedRequestId);
    return { sessionId: session.id, expiresAt: session.expiresAt,
      draft: { revision: session.revision, items: request ? publicRequest(request).items : await selected(session) }, request: publicRequest(request) };
  };
  const freshStaffBinding = async (actor, conversationId) => {
    staff(actor);
    if (!positive(conversationId)) fail('CUSTOMER_REQUEST_CONVERSATION_INVALID');
    const value = bindingValue(await resolveBinding(actor, String(conversationId)));
    if (value.chatwootConversationId !== String(conversationId)) fail('CUSTOMER_REQUEST_BINDING_UNAVAILABLE', 503);
    return value;
  };
  return {
    isEnabled: () => { try { enabled(); return true; } catch { return false; } },
    async issue(actor, input) {
      enabled(); staff(actor, true);
      if (!exactKeys(input, ['conversationId'])) fail('CUSTOMER_REQUEST_SESSION_INPUT_INVALID');
      const issuer = issuerValue(actor, now()), binding = await freshStaffBinding(actor, input.conversationId);
      return transaction(async data => {
        if (data.sessions.length >= 512) fail('CUSTOMER_REQUEST_SESSION_LIMIT', 503);
        if (await validateBinding(binding, issuer) !== true) fail('CUSTOMER_REQUEST_SESSION_INVALID', 401);
        const token = capability(); if (!TOKEN.test(token) || data.sessions.some(session => session.tokenHash === digest(token))) fail('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE', 503);
        const session = { id: randomUUID(), tokenHash: digest(token), configRevision: config.revision, binding, issuer,
          expiresAt: Math.min(now() + config.sessionTtlMs, issuer.expiresAt), revoked: false, revision: 0, items: [], submittedRequestId: null };
        data.sessions.push(session);
        return { sessionId: session.id, capability: token, expiresAt: session.expiresAt };
      });
    },
    session: token => customer(token, sessionDTO),
    async products(token, query = {}) {
      if (!plain(query) || Object.keys(query).some(key => !['search', 'category', 'age', 'page', 'limit'].includes(key))) fail('CUSTOMER_REQUEST_QUERY_INVALID');
      const normalized = { search: '', category: null, age: null, page: 1, limit: 24, hasImage: true };
      for (const key of ['search', 'category', 'age']) if (query[key] !== undefined && query[key] !== '') {
        if (!label(query[key])) fail('CUSTOMER_REQUEST_QUERY_INVALID'); normalized[key] = query[key].trim();
      }
      for (const key of ['page', 'limit']) if (query[key] !== undefined) {
        if (!positive(query[key]) || key === 'limit' && Number(query[key]) > 50) fail('CUSTOMER_REQUEST_QUERY_INVALID'); normalized[key] = Number(query[key]);
      }
      return customer(token, async session => {
        const payload = await readCatalogPage(clone(normalized), clone(session.binding), clone(session.issuer));
        const meta = payload?.meta;
        if (payload?.success !== true || meta?.sourceDatabaseVerified !== true || meta.cached !== false || !Array.isArray(payload.data)
          || meta.page !== normalized.page || meta.limit !== normalized.limit || !Number.isSafeInteger(meta.total) || meta.total < 0
          || meta.totalPages !== Math.max(1, Math.ceil(meta.total / normalized.limit)) || typeof meta.hasNextPage !== 'boolean'
          || meta.hasNextPage !== (normalized.page < meta.totalPages)
          || payload.data.length !== Math.min(normalized.limit, Math.max(0, meta.total - (normalized.page - 1) * normalized.limit))) fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE', 503);
        const options = rows => {
          if (!Array.isArray(rows) || rows.length > 500 || rows.some(row => !label(row?.value) || row.count !== null && (!Number.isSafeInteger(row.count) || row.count < 1))
            || new Set(rows.map(row => row.value)).size !== rows.length) fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE', 503);
          return rows.map(row => ({ value: row.value, count: row.count }));
        };
        const products = payload.data.map(row => productCard(row, config));
        if (new Set(products.map(row => row.id)).size !== products.length) fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE', 503);
        return { data: products, meta: { page: meta.page, limit: meta.limit, total: meta.total, totalPages: meta.totalPages,
          hasNextPage: meta.hasNextPage, categories: options(meta.facets?.categories || []), ages: options(meta.facets?.ages || []) } };
      });
    },
    async photo(token, id) {
      if (!PRODUCT.test(id || '')) fail('CUSTOMER_REQUEST_PRODUCT_INVALID');
      return customer(token, async session => {
        productEnvelope(await readProduct(id, clone(session.binding), clone(session.issuer)), config, id);
        const photo = await readPhoto(id, clone(session.binding), clone(session.issuer));
        const bytes = photo?.bytes, mime = photo?.mime;
        if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > 3 * 1024 * 1024) fail('CUSTOMER_REQUEST_PHOTO_UNAVAILABLE', 503);
        const signature = mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
            : mime === 'image/webp' && Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
        if (!signature) fail('CUSTOMER_REQUEST_PHOTO_UNAVAILABLE', 503);
        return { bytes, mime };
      });
    },
    async saveDraft(token, input) {
      const items = itemInput(input);
      return customer(token, async (session, data) => {
        if (session.submittedRequestId) fail('CUSTOMER_REQUEST_ALREADY_SUBMITTED', 409);
        if (session.revision !== input.revision) fail('CUSTOMER_REQUEST_REVISION_CONFLICT', 409);
        const proposed = { ...session, items }; const cards = await selected(proposed);
        session.items = items; session.revision++;
        return { sessionId: session.id, expiresAt: session.expiresAt, draft: { revision: session.revision, items: cards }, request: null };
      }, true);
    },
    async submit(token, input) {
      if (!exactKeys(input, ['revision', 'operationId']) || !Number.isSafeInteger(input.revision) || input.revision < 0 || !UUID.test(input.operationId || '')) fail('CUSTOMER_REQUEST_SUBMIT_INVALID');
      const operationId = input.operationId.toLowerCase();
      return customer(token, async (session, data) => {
        if (session.revision !== input.revision) fail('CUSTOMER_REQUEST_REVISION_CONFLICT', 409);
        const previous = data.requests.find(request => request.id === session.submittedRequestId);
        if (previous) return sessionDTO(session, data);
        if (data.requests.some(request => request.operationId === operationId)) fail('CUSTOMER_REQUEST_OPERATION_CONFLICT', 409);
        if (!session.items.length) fail('CUSTOMER_REQUEST_EMPTY', 409);
        const items = await selected(session);
        const request = { id: randomUUID(), sessionId: session.id, binding: clone(session.binding), issuerId: session.issuer.id,
          operationId, revision: session.revision, selectionDigest: digest(JSON.stringify(session.items)), submittedAt: now(), status: 'interest', items };
        data.requests.push(request); session.submittedRequestId = request.id;
        return sessionDTO(session, data);
      }, true);
    },
    async staffList(actor, conversationId) {
      enabled(); const current = await freshStaffBinding(actor, conversationId), data = await read();
      const rows = data.requests.filter(request => request.binding.chatwootConversationId === current.chatwootConversationId);
      if (rows.some(request => !sameBinding(bindingValue(request.binding), current))) fail('CUSTOMER_REQUEST_FORBIDDEN', 403);
      const result = rows.map(request => ({ ...publicRequest(request), conversationId: current.chatwootConversationId }));
      if (!sameBinding(current, await freshStaffBinding(actor, conversationId))) fail('CUSTOMER_REQUEST_FORBIDDEN', 403);
      return result;
    },
    async staffGet(actor, requestId) {
      enabled(); staff(actor);
      if (!UUID.test(requestId || '')) fail('CUSTOMER_REQUEST_NOT_FOUND', 404);
      const data = await read(), request = data.requests.find(value => value.id === requestId);
      if (!request) fail('CUSTOMER_REQUEST_NOT_FOUND', 404);
      const binding = await freshStaffBinding(actor, request.binding.chatwootConversationId);
      if (!sameBinding(binding, bindingValue(request.binding))) fail('CUSTOMER_REQUEST_FORBIDDEN', 403);
      const result = { ...publicRequest(request), conversationId: binding.chatwootConversationId };
      if (!sameBinding(binding, await freshStaffBinding(actor, binding.chatwootConversationId))) fail('CUSTOMER_REQUEST_FORBIDDEN', 403);
      return result;
    },
    async revoke(actor, sessionId) {
      enabled(); staff(actor, true);
      if (!UUID.test(sessionId || '')) fail('CUSTOMER_REQUEST_SESSION_INPUT_INVALID');
      return transaction(async data => {
        const session = data.sessions.find(value => value.id === sessionId);
        if (!session) fail('CUSTOMER_REQUEST_NOT_FOUND', 404);
        const current = await freshStaffBinding(actor, session.binding.chatwootConversationId);
        if (!sameBinding(current, session.binding)) fail('CUSTOMER_REQUEST_FORBIDDEN', 403);
        session.revoked = true; return { revoked: true };
      });
    },
  };
}
