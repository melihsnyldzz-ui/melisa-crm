import { listChatwootAgents } from '../services/chatwootInboxService.js';
import { listConfiguredCrmUsers, publicCrmUser } from '../services/crmAuthService.js';
import { ok } from '../utils/response.js';

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
