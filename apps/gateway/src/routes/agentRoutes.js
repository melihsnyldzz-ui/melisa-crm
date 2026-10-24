import { Router } from 'express';
import { getAgents, getUserInventory, postManagedUser, patchManagedUser } from '../controllers/agentController.js';
import { requireCrmAuth, requireCrmPermission } from '../middleware/auth.js';

export const agentRoutes = Router();

agentRoutes.get('/crm/agents', requireCrmAuth, requireCrmPermission('crm.agents'), getAgents);
agentRoutes.get('/crm/users', requireCrmAuth, requireCrmPermission('crm.manage'), getUserInventory);
agentRoutes.post('/crm/users', requireCrmAuth, requireCrmPermission('crm.manage'), postManagedUser);
agentRoutes.patch('/crm/users/:userId', requireCrmAuth, requireCrmPermission('crm.manage'), patchManagedUser);
