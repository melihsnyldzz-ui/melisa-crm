import { Router } from 'express';
import { putConversationContactPhone } from '../controllers/contactController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const contactRoutes = Router();

contactRoutes.put(
  '/crm/conversations/:conversationId/contact-phone',
  requireCrmAuth,
  requireCrmPermission('crm.manage'),
  putConversationContactPhone,
);
