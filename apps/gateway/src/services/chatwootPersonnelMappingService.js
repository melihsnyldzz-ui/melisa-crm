import { chatwootApiRequest } from './chatwootApiService.js';
import { listConfiguredCrmUsers } from './crmAuthService.js';

function normalized(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function automaticAgentForPersonnel(personnel, agents, claimedAgentIds) {
  const personnelKeys = new Set([
    normalized(personnel.username),
    normalized(personnel.displayName),
  ].filter(Boolean));

  const candidates = agents.filter((agent) => {
    if (claimedAgentIds.has(Number(agent.id))) return false;
    const emailLocalPart = String(agent.email || '').split('@')[0];
    return [agent.name, agent.available_name, emailLocalPart]
      .map(normalized)
      .some((key) => key && personnelKeys.has(key));
  });

  return candidates.length === 1 ? candidates[0] : null;
}

export async function getChatwootPersonnelMapping() {
  const personnel = listConfiguredCrmUsers().filter((user) => user.role === 'personel');
  const agentResponse = await chatwootApiRequest('/agents');
  const agents = Array.isArray(agentResponse) ? agentResponse : (agentResponse?.payload || []);
  const claimedAgentIds = new Set();

  const mappings = personnel.map((person) => {
    const explicitAgentId = person.chatwootAgentId;
    const explicitAgent = explicitAgentId
      ? agents.find((agent) => Number(agent.id) === Number(explicitAgentId))
      : null;
    const automaticAgent = explicitAgent
      ? null
      : automaticAgentForPersonnel(person, agents, claimedAgentIds);
    const agent = explicitAgent || automaticAgent;
    if (agent) claimedAgentIds.add(Number(agent.id));

    return {
      crmUserId: person.id,
      username: person.username,
      displayName: person.displayName,
      chatwootAgentId: agent ? Number(agent.id) : null,
      chatwootAgentName: agent?.available_name || agent?.name || '',
      mappingState: explicitAgent ? 'explicit' : automaticAgent ? 'automatic' : 'unmapped',
    };
  });

  return {
    mappings,
    summary: {
      personnel: personnel.length,
      agents: agents.length,
      mapped: mappings.filter((item) => item.chatwootAgentId).length,
      unmapped: mappings.filter((item) => !item.chatwootAgentId).length,
    },
    readOnly: true,
  };
}
