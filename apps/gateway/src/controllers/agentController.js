import { listChatwootAgents } from '../services/chatwootInboxService.js';
import { listConfiguredCrmUsers, publicCrmUser } from '../services/crmAuthService.js';
import { ok } from '../utils/response.js';
import {getCrmUserInventory} from '../services/crmUserInventory.js';

export function getUserInventory(req,res,next) {
  try {
    res.set('Cache-Control','no-store');
    return ok(res,getCrmUserInventory(req.user),{source:'configured-crm-users',readOnly:true});
  } catch (error) { return next(error); }
}

export async function getAgents(req, res, next) {
  try {
    const agents = await listChatwootAgents();
    const crmUsers = listConfiguredCrmUsers().map(publicCrmUser);
    return ok(res, {
      agents: agents.map((agent) => ({
        ...agent,
        crmUser: crmUsers.find((user) => Number(user.chatwootAgentId) === Number(agent.id)) || null,
      })),
    }, { source: 'chatwoot-agents', readOnly: true });
  } catch (error) {
    return next(error);
  }
}
