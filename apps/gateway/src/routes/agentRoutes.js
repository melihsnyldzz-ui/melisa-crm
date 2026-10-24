import { Router } from 'express';
import { getAgents, getUserInventory } from '../controllers/agentController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const agentRoutes = Router();

agentRoutes.get('/crm/agents', requireCrmAuth, requireCrmPermission('crm.agents'), getAgents);
agentRoutes.get('/crm/users', requireCrmAuth, requireCrmPermission('crm.manage'), getUserInventory);
