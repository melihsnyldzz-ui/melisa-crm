import { env } from '../config/env.js';
import { assignChatwootConversationToAgent } from '../services/chatwootConversationService.js';
import { getChatwootConversationDetail, getChatwootConversationAccess, listChatwootAgents } from '../services/chatwootInboxService.js';
import { verifyCrmAccessToken, assertCrmPermission } from '../services/crmAuthService.js';
import { sendCrmTextMessage } from '../services/sendService.js';
import { ok } from '../utils/response.js';

// The short TEST rehearsal may expire during a provider read. Normal sessions
// retain their established path; no permanent user or role is changed here.
export function createTestPersonnelRequestGuard(req, {
  verify = verifyCrmAccessToken, readAccess = getChatwootConversationAccess,
} = {}) {
  if (req.user?.testPersonnel !== true) return null;
  const header = req.get('authorization') || '';
  const identity = user => JSON.stringify([user?.id, user?.username, user?.role, user?.chatwootAgentId]);
  const originalIdentity = identity(req.user);
  const current = permission => {
    if (!/^Bearer [^\s]+$/.test(header)) throw Object.assign(new Error('TEST personel oturumu doğrulanamadı.'), {code:'AUTH_TOKEN_INVALID',statusCode:401});
    const user = verify(header.slice(7));
    if (user?.testPersonnel !== true || user?.active !== true || identity(user) !== originalIdentity)
      throw Object.assign(new Error('TEST personel oturumu değişti.'), {code:'AUTH_TOKEN_INVALID',statusCode:401});
    assertCrmPermission(user, permission);
    return user;
  };
  return async ({permission = 'crm.view', conversationId} = {}) => {
    const user = current(permission);
    if (conversationId !== undefined) await readAccess({conversationId,user});
    return current(permission);
  };
}

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
    const guard = createTestPersonnelRequestGuard(req);
    const result = await getChatwootConversationDetail({
      conversationId: req.params.conversationId,
      user: req.user,
    });
    await guard?.({conversationId:req.params.conversationId});
    return ok(res, result, { source: 'chatwoot-conversation', readOnly: true });
  } catch (error) {
    return next(error);
  }
}

export async function postConversationMessage(req, res, next) {
  try {
    const guard = createTestPersonnelRequestGuard(req);
    const conversation = await getChatwootConversationDetail({
      conversationId: req.params.conversationId,
      user: req.user,
    });
    const beforeProviderSend = guard ? () => guard({permission:'crm.send',conversationId:req.params.conversationId}) : undefined;
    await beforeProviderSend?.();
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
    }, beforeProviderSend ? {beforeProviderSend} : {});
    await beforeProviderSend?.();
    return res.status(201).json({
      success: true,
      data: result,
      meta: { source: 'whatsapp-crm-send', externalSideEffect: 'whatsapp-message-sent' },
    });
  } catch (error) {
    return next(error);
  }
}
