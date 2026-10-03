import { env } from '../config/env.js';
import { chatwootApiRequest } from './chatwootApiService.js';

function assignmentError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export async function applyVerifiedChatwootAssignment(conversationId, agentId, request = chatwootApiRequest) {
  const id = Number(conversationId);
  if (!Number.isSafeInteger(id) || id < 1) throw assignmentError('WHATSAPP_CRM_CHATWOOT_CONVERSATION_INVALID', 'Chatwoot konusma kimligi gecersiz.', 400);
  if (agentId !== null && (!Number.isSafeInteger(agentId) || agentId < 1)) throw assignmentError('WHATSAPP_CRM_CHATWOOT_ASSIGNEE_INVALID', 'Chatwoot temsilcisi gecersiz.', 400);
  try {
    await request(`/conversations/${id}/assignments`, { method: 'POST', body: { assignee_id: agentId } });
    const result = await request(`/conversations/${id}`);
    if (Number(result?.id) !== id || !Object.hasOwn(result?.meta || {}, 'assignee')) throw new Error('proof absent');
    const assignee = result.meta.assignee;
    if (agentId === null ? assignee !== null : Number(assignee?.id) !== agentId) throw new Error('proof mismatch');
  } catch {
    const error = assignmentError('WHATSAPP_CRM_CHATWOOT_ASSIGNMENT_UNCONFIRMED', 'Atama sonucu dogrulanamadi; yeniden yazmadan mevcut durum kontrol edilmeli.', 502);
    error.meta = { transportAttempted: true, automaticRetry: false };
    throw error;
  }
  return { conversationId: id, chatwootAgentId: agentId, confirmed: true };
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

  await applyVerifiedChatwootAssignment(numericConversationId, Number(chatwootAgentId));

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
    confirmed: true,
  };
}

export async function assignChatwootConversationToAgent({ conversationId, agent, actor }) {
  const numericConversationId = Number(conversationId);
  const numericAgentId = agent === null ? null : Number(agent?.id);
  if (!Number.isInteger(numericConversationId) || numericConversationId < 1) {
    throw assignmentError('WHATSAPP_CRM_CHATWOOT_CONVERSATION_INVALID', 'Chatwoot konusma kimligi gecersiz.', 400);
  }
  if (numericAgentId !== null && (!Number.isSafeInteger(numericAgentId) || numericAgentId < 1)) {
    throw assignmentError('WHATSAPP_CRM_CHATWOOT_ASSIGNEE_INVALID', 'Chatwoot temsilcisi gecersiz.', 400);
  }

  await applyVerifiedChatwootAssignment(numericConversationId, numericAgentId);

  return {
    conversationId: numericConversationId,
    chatwootAgentId: numericAgentId,
    assignedAgent: numericAgentId === null ? null : {
      id: numericAgentId,
      name: agent.name || `Temsilci ${numericAgentId}`,
    },
    actor: actor ? {
      id: actor.id,
      username: actor.username,
      role: actor.role,
    } : null,
    source: 'chatwoot',
    confirmed: true,
  };
}
