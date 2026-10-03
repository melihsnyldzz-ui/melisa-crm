import { Router } from 'express';
import { getAgents } from '../controllers/agentController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const agentRoutes = Router();

agentRoutes.get('/crm/agents', requireCrmAuth, requireCrmPermission('crm.agents'), getAgents);
