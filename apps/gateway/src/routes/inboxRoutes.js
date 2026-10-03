import { Router } from 'express';
import { getInboxController } from '../controllers/inboxController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const inboxRoutes = Router();

inboxRoutes.get('/crm/inbox', requireCrmAuth, requireCrmPermission('crm.view'), getInboxController);
