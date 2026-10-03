import { Router } from 'express';
import { getCrmMessageMediaController } from '../controllers/mediaController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const mediaRoutes = Router();

mediaRoutes.get(
  '/crm/messages/:messageId/media',
  requireCrmAuth,
  requireCrmPermission('crm.view'),
  getCrmMessageMediaController,
);
