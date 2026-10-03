import { createCatalogRouter } from '../services/catalogRouter.mjs';
import { verifyCrmAccessToken } from '../services/crmAuthService.js';
import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { agentRoutes } from './agentRoutes.js';
import { conversationRoutes } from './conversationRoutes.js';
import { healthRoutes } from './healthRoutes.js';
import { inboxRoutes } from './inboxRoutes.js';
import { webhookRoutes } from './webhookRoutes.js';
import { requireCrmAuth } from '../middleware/auth.js';

export const routes = Router();

routes.use(healthRoutes);
routes.use(authRoutes);
routes.use('/crm', requireCrmAuth);
// Explicitly approved active CRM roles with crm.view; no ERP login or new credential.
const catalogBinding = createCatalogRouter({
  Router,
  verifyCrmContext: token => verifyCrmAccessToken(token, { includeContext: true }),
  transport: (url, options) => fetch(url, options),
  activationApproved: true,
  uiOrigin: process.env.CRM_UI_ORIGIN || 'https://melisa-crm-ozel-tasarim-testi.melihsnyldzz.chatgpt.site',
  logoutOrigin: 'http://127.0.0.1:4212',
});
routes.use(catalogBinding.router);
// Clear only catalog RAM revocation/read leases on existing shutdown; provider lifecycle unchanged.
process.once('SIGINT', catalogBinding.clearAll);
process.once('SIGTERM', catalogBinding.clearAll);

routes.use(inboxRoutes);
routes.use(agentRoutes);
routes.use(conversationRoutes);
routes.use(webhookRoutes);
