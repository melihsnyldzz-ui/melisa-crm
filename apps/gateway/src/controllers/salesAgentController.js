import { env } from '../config/env.js';
import { getChatwootConversationDetail } from '../services/chatwootInboxService.js';
import { createSalesPreview } from '../services/salesAgent/preview.mjs';
import { createSalesGenerator } from '../services/salesAgent/responses.mjs';
import { salesError } from '../services/salesAgent/policy.mjs';
import { assertConversationAccess, assertCrmPermission, verifyCrmAccessToken } from '../services/crmAuthService.js';
import { resolvePhoneIdentity } from '../utils/phoneIdentity.js';
import { ok } from '../utils/response.js';
import { createCrmCatalogReader } from '../services/catalogRouter.mjs';
import { catalogAccess } from '../services/crmCatalogAccess.mjs';
import { createSalesCatalogAdapter } from '../services/salesAgent/catalogAdapter.mjs';
import { salesPolicyStore } from '../services/salesAgent/policyStore.mjs';
import {staffSalesContext} from '../services/salesAgent/staffContext.mjs';
import { assertPaidAiAllowed } from '../services/paidAiPolicy.mjs';
import { createPersonalCatalogAdapter, PERSONAL_CATALOG_ORIGIN, personalSessionId } from '../services/salesAgent/personalCatalog.mjs';

const readCatalog = createCrmCatalogReader({ activationApproved: true,
  verifyCrmContext: token => verifyCrmAccessToken(token, { includeContext: true }),
  transport: (url, options) => fetch(url, options),
});

async function loadServerPolicy() {
  return salesPolicyStore.read();
}

function policyAccess(req, ownerOnly = false) {
  const authorization = req.get('authorization') || '';
  return () => {
    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) throw salesError('AI_AUTH_REQUIRED', 401);
    const user = verifyCrmAccessToken(token);
    assertCrmPermission(user, ownerOnly ? 'crm.manage' : 'crm.view');
    if (ownerOnly && user.role !== 'patron') throw salesError('AI_POLICY_OWNER_REQUIRED', 403);
    return user;
  };
}

function safePolicyError(error) {
  const code = typeof error?.code === 'string' && /^(AI_|AUTH_|WHATSAPP_CRM_)[A-Z0-9_]+$/.test(error.code)
    ? error.code : 'AI_POLICY_UNAVAILABLE';
  const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
    ? error.statusCode : 503;
  return Object.assign(new Error(statusCode === 403 ? 'Satış kurallarını yalnız patron düzenleyebilir.'
    : statusCode === 409 ? 'Satış kuralları değişti. Güncel kuralları yeniden açın.'
      : 'Satış kuralları şu anda kullanılamıyor.'), { code, statusCode });
}

export async function getSalesRules(req, res, next) {
  try {
    const assertAccess = policyAccess(req);
    const result = await salesPolicyStore.read({ assertAccess });
    const user = assertAccess();
    return ok(res, { ...result, writable: user.role === 'patron' && result.configured && Boolean(process.env.CRM_AI_SALES_RULES_FILE) });
  } catch (error) { return next(safePolicyError(error)); }
}

export async function putSalesRules(req, res, next) {
  try {
    const assertOwner = policyAccess(req, true);
    assertOwner();
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).sort().join(',') !== 'policy,revision') throw salesError('AI_POLICY_INVALID');
    const assertAccess = assertOwner;
    const result = await salesPolicyStore.write({ ...req.body, assertAccess });
    assertAccess();
    return ok(res, { ...result, writable: true });
  } catch (error) { return next(safePolicyError(error)); }
}

export async function postConversationSalesDraft(req, res, next) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  req.once('aborted', close); res.once('close', close);
  try {
    if (process.env.CRM_AI_SALES_MODE !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
    assertPaidAiAllowed(req.body?.aiIntent);
    const authorization = req.get('authorization') || '';
    const getCurrentUser = () => {
      const [type, token] = authorization.split(' ');
      if (type !== 'Bearer' || !token) throw salesError('AI_AUTH_REQUIRED', 401);
      const currentUser = verifyCrmAccessToken(token);
      assertCrmPermission(currentUser, 'crm.send');
      if (!catalogAccess.canRead(currentUser, authorization)) throw salesError('AI_CATALOG_ACCESS_REVOKED', 401);
      if (controller.signal.aborted) throw salesError('AI_SALES_CANCELLED', 499);
      return currentUser;
    };
    const configuredOrigin = process.env.CRM_AI_CUSTOMER_CATALOG_ORIGIN;
    const sessionId = req.body?.customerCatalogSessionId;
    const personalRequired = Boolean(configuredOrigin) && String(req.params.conversationId) === '55';
    if (configuredOrigin && configuredOrigin !== PERSONAL_CATALOG_ORIGIN || sessionId !== undefined && !personalRequired) throw salesError('AI_PERSONAL_CATALOG_UNAVAILABLE', 503);
    if (personalRequired && !personalSessionId(sessionId)) throw salesError('AI_PERSONAL_CATALOG_SESSION_REQUIRED', 400);
    const currentUser = getCurrentUser();
    const catalogAdapter = personalRequired ? createPersonalCatalogAdapter({ sessionId, conversationId: req.params.conversationId,
      actorId: String(currentUser.id), assertAccess: () => {
        getCurrentUser();
        if (process.env.CRM_AI_CUSTOMER_CATALOG_ORIGIN !== configuredOrigin) throw salesError('AI_PERSONAL_CATALOG_CHANGED', 409);
      }, signal: controller.signal,
      readSnapshot: request => fetch(request.url, { method: 'GET', headers: { authorization },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), redirect: 'error', cache: 'no-store' }),
    }) : createSalesCatalogAdapter({ readCatalog, authorization, signal: controller.signal, assertAccess: getCurrentUser });
    const preview = createSalesPreview({
      getMode: () => process.env.CRM_AI_SALES_MODE,
      getAllowedConversationId: () => process.env.CRM_AI_SALES_CONVERSATION_ID,
      getAllowedTestPeer: () => process.env.CRM_AI_SALES_TEST_PEER,
      normalizePhone: value => typeof value === 'string' && /^[+0-9 ()-]+$/.test(value)
        ? resolvePhoneIdentity(value).normalizedPhone : '',
      assertConversationAccess,
      getCurrentUser,
      catalogAdapter,
      loadPolicy: loadServerPolicy,
      readConversation: getChatwootConversationDetail,
      generate: request => createSalesGenerator({ apiKey: env.translation.apiKey, model: env.translation.model,
        timeoutMs: Math.min(env.translation.timeoutMs || 20_000, 60_000), signal: controller.signal })(request),
    });
    const result = await preview({ conversationId: req.params.conversationId, user: req.user,
      staffContext:staffSalesContext(req.body||{}),
      ...(Object.hasOwn(req.body || {}, 'catalogSearch') ? { catalogSearch: req.body.catalogSearch } : {}) });
    getCurrentUser();
    if (controller.signal.aborted) return;
    return ok(res, result, { source: 'ai-sales-copilot', readOnly: true, autoSend: false, erpWrite: false });
  } catch (error) {
    // No raw upstream message/body/metadata reaches the shared HTTP error handler.
    const conversationCodes = new Set(['WHATSAPP_CRM_CONVERSATION_FORBIDDEN',
      'WHATSAPP_CRM_CONVERSATION_NOT_FOUND', 'WHATSAPP_CRM_CONVERSATION_INVALID',
      'WHATSAPP_CRM_PERMISSION_DENIED', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_EXPIRED']);
    const known = typeof error?.code === 'string'
      && (/^AI_[A-Z0-9_]+$/.test(error.code) || conversationCodes.has(error.code));
    const statusCode = known && Number.isInteger(error.statusCode)
      && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 502;
    const safe = Object.assign(new Error(statusCode === 403 ? 'Bu konuşma için satış önerisi kullanılamıyor.'
      : statusCode === 409 ? 'Konuşma veya satış ayarları değişti. Yeni öneri oluşturun.'
        : 'Satış önerisi şu anda oluşturulamıyor. Bir süre sonra yeniden deneyin.'),
    { code: known ? error.code : 'AI_SALES_UNAVAILABLE', statusCode });
    return next(safe);
  } finally { req.removeListener('aborted', close); res.removeListener('close', close); }
}
