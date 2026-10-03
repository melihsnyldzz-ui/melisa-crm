import { env } from '../config/env.js';
import { assignChatwootConversationToAgent } from '../services/chatwootConversationService.js';
import { getChatwootConversationDetail, listChatwootAgents } from '../services/chatwootInboxService.js';
import { sendCrmTextMessage } from '../services/sendService.js';
import { ok } from '../utils/response.js';

export async function patchConversationAssignment(req, res, next) {
  try {
    const value = Object.hasOwn(req.body || {}, 'agentId') ? req.body.agentId : req.body?.chatwootAgentId;
    const requestedAgentId = value === null ? null : Number(value);
    const agents = requestedAgentId === null ? [] : await listChatwootAgents();
    const agent = requestedAgentId === null ? null : agents.find((item) => Number(item.id) === requestedAgentId);
    if (requestedAgentId !== null && !agent) {
      const error = new Error('Atanacak Chatwoot temsilcisi bulunamadi.');
      error.code = 'WHATSAPP_CRM_CHATWOOT_ASSIGNEE_INVALID';
      error.statusCode = 400;
      throw error;
    }
    const result = await assignChatwootConversationToAgent({
      conversationId: req.params.conversationId,
      agent,
      actor: req.user,
    });
    return ok(res, result, { source: 'chatwoot-assignment', persistent: true });
  } catch (error) {
    return next(error);
  }
}

export async function getConversationDetail(req, res, next) {
  try {
    const result = await getChatwootConversationDetail({
      conversationId: req.params.conversationId,
      user: req.user,
    });
    return ok(res, result, { source: 'chatwoot-conversation', readOnly: true });
  } catch (error) {
    return next(error);
  }
}

export async function postConversationMessage(req, res, next) {
  try {
    const conversation = await getChatwootConversationDetail({
      conversationId: req.params.conversationId,
      user: req.user,
    });
    const result = await sendCrmTextMessage({
      conversationId: String(conversation.id),
      phone: conversation.phone,
      remoteJid: conversation.remoteJid,
      contactName: conversation.contactName,
      instanceKey: env.whatsapp.provider === 'evolution'
        ? env.evolution.instance
        : conversation.instanceKey,
      text: req.body?.text,
      media: req.body?.media,
      clientRequestId: req.body?.clientRequestId,
      actorId: req.user.id,
    });
    return res.status(201).json({
      success: true,
      data: result,
      meta: { source: 'whatsapp-crm-send', externalSideEffect: 'whatsapp-message-sent' },
    });
  } catch (error) {
    return next(error);
  }
}
