import { Router } from 'express';
import {
  patchConversationAssignment,
  getConversationDetail,
  postConversationMessage,
} from '../controllers/conversationController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';
import { crmTranslationRateLimit } from '../middleware/security.js';
import { postConversationTranslation } from '../controllers/translationController.js';
import { getSalesRules, putSalesRules, postConversationSalesDraft } from '../controllers/salesAgentController.js';

export const conversationRoutes = Router();

conversationRoutes.get('/crm/sales-rules', requireCrmAuth, requireCrmPermission('crm.view'), getSalesRules);
conversationRoutes.put('/crm/sales-rules', requireCrmAuth, requireCrmPermission('crm.manage'), putSalesRules);

conversationRoutes.get(
  '/crm/conversations/:conversationId',
  requireCrmAuth,
  requireCrmPermission('crm.view'),
  getConversationDetail,
);

conversationRoutes.post(
  '/crm/conversations/:conversationId/messages',
  requireCrmAuth,
  requireCrmPermission('crm.send'),
  postConversationMessage,
);

conversationRoutes.post(
  '/crm/conversations/:conversationId/assign',
  requireCrmAuth,
  requireCrmPermission('crm.assign'),
  patchConversationAssignment,
);

conversationRoutes.post(
  '/crm/conversations/:conversationId/translate',
  requireCrmAuth,
  requireCrmPermission('crm.view'),
  crmTranslationRateLimit,
  postConversationTranslation,
);

// Suggestion-only endpoint. Shares the existing per-user AI rate limit; never sends.
conversationRoutes.post(
  '/crm/conversations/:conversationId/sales-draft',
  requireCrmAuth,
  requireCrmPermission('crm.send'),
  crmTranslationRateLimit,
  postConversationSalesDraft,
);
