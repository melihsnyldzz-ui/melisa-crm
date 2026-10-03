import { env } from '../config/env.js';
import { chatwootApiRequest } from './chatwootApiService.js';

function assignmentError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export async function assignChatwootConversation({ conversationId, assignee }) {
  const numericConversationId = Number(conversationId);
  if (!Number.isInteger(numericConversationId) || numericConversationId < 1) {
    throw assignmentError('WHATSAPP_CRM_CHATWOOT_CONVERSATION_INVALID', 'Chatwoot konusma kimligi gecersiz.', 400);
  }

  const chatwootAgentId = env.chatwoot.agentPersonnelMap.get(Number(assignee?.id));
  if (!chatwootAgentId) {
    throw assignmentError(
      'WHATSAPP_CRM_CHATWOOT_ASSIGNEE_NOT_MAPPED',
      'Secilen ERP personeli Chatwoot temsilcisiyle eslesmemis.',
    );
  }

  await chatwootApiRequest(`/conversations/${numericConversationId}/assignments`, {
    method: 'POST',
    body: { assignee_id: Number(chatwootAgentId) },
  });

  return {
    conversationId: numericConversationId,
    assignedUserId: Number(assignee.id),
    assignedUser: {
      id: Number(assignee.id),
      username: assignee.username || '',
      displayName: assignee.displayName || assignee.username || `Personel ${assignee.id}`,
      employeeId: assignee.employeeId || null,
    },
    chatwootAgentId: Number(chatwootAgentId),
    source: 'chatwoot',
  };
}

export async function assignChatwootConversationToAgent({ conversationId, agent, actor }) {
  const numericConversationId = Number(conversationId);
  const numericAgentId = Number(agent?.id);
  if (!Number.isInteger(numericConversationId) || numericConversationId < 1) {
    throw assignmentError('WHATSAPP_CRM_CHATWOOT_CONVERSATION_INVALID', 'Chatwoot konusma kimligi gecersiz.', 400);
  }
  if (!Number.isInteger(numericAgentId) || numericAgentId < 1) {
    throw assignmentError('WHATSAPP_CRM_CHATWOOT_ASSIGNEE_INVALID', 'Chatwoot temsilcisi gecersiz.', 400);
  }

  await chatwootApiRequest(`/conversations/${numericConversationId}/assignments`, {
    method: 'POST',
    body: { assignee_id: numericAgentId },
  });

  return {
    conversationId: numericConversationId,
    chatwootAgentId: numericAgentId,
    assignedAgent: {
      id: numericAgentId,
      name: agent.name || `Temsilci ${numericAgentId}`,
    },
    actor: actor ? {
      id: actor.id,
      username: actor.username,
      role: actor.role,
    } : null,
    source: 'chatwoot',
  };
}
