import { readFile, stat } from 'node:fs/promises';
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

const readCatalog = createCrmCatalogReader({ activationApproved: true,
  verifyCrmContext: token => verifyCrmAccessToken(token, { includeContext: true }),
  transport: (url, options) => fetch(url, options),
});

async function loadServerPolicy() {
  const path = process.env.CRM_AI_SALES_RULES_FILE;
  if (!path) return {}; // No unapproved global MOQ or invented Telegram link.
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > 16_384) throw new Error('invalid policy file');
    const text = await readFile(path, 'utf8');
    if (Buffer.byteLength(text) > 16_384) throw new Error('policy too large');
    return JSON.parse(text);
  } catch { throw salesError('AI_POLICY_FILE_INVALID', 503); }
}

export async function postConversationSalesDraft(req, res, next) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  req.once('aborted', close); res.once('close', close);
  try {
    if (process.env.CRM_AI_SALES_MODE !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
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
    const catalogAdapter = createSalesCatalogAdapter({ readCatalog, authorization, signal: controller.signal,
      assertAccess: getCurrentUser });
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
