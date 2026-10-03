import { Router } from 'express';
import { getChatwootPersonnelMappingController } from '../controllers/integrationController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const integrationRoutes = Router();

integrationRoutes.get(
  '/crm/integrations/chatwoot/personnel-map',
  requireCrmAuth,
  requireCrmPermission('crm.manage'),
  getChatwootPersonnelMappingController,
);
