import { Router } from 'express';
import { postCrmSendMessage } from '../controllers/sendController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const sendRoutes = Router();

sendRoutes.post('/crm/messages/send', requireCrmAuth, requireCrmPermission('crm.manage'), postCrmSendMessage);
