import { readFile, stat } from 'node:fs/promises';
import { env } from '../config/env.js';
import { getChatwootConversationDetail } from '../services/chatwootInboxService.js';
import { createSalesPreview } from '../services/salesAgent/preview.mjs';
import { createSalesGenerator } from '../services/salesAgent/responses.mjs';
import { salesError } from '../services/salesAgent/policy.mjs';
import { ok } from '../utils/response.js';

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
  try {
    if (process.env.CRM_AI_SALES_MODE !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
    const preview = createSalesPreview({
      getMode: () => process.env.CRM_AI_SALES_MODE,
      loadPolicy: loadServerPolicy,
      readConversation: getChatwootConversationDetail,
      generate: createSalesGenerator({ apiKey: env.translation.apiKey, model: env.translation.model,
        timeoutMs: Math.min(env.translation.timeoutMs || 20_000, 60_000) }),
    });
    const result = await preview({ conversationId: req.params.conversationId, user: req.user });
    return ok(res, result, { source: 'ai-sales-copilot', readOnly: true, autoSend: false, erpWrite: false });
  } catch (error) { return next(error); }
}
