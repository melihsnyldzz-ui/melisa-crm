import { env } from '../config/env.js';
import { assignChatwootConversationToAgent } from '../services/chatwootConversationService.js';
import { getChatwootConversationDetail, getChatwootConversationAccess, assertChatwootAssignedInboxCurrent, listChatwootAgents } from '../services/chatwootInboxService.js';
import { verifyCrmAccessToken, assertCrmPermission } from '../services/crmAuthService.js';
import { sendCrmTextMessage, readCrmOutboundStatus } from '../services/sendService.js';
import { ok } from '../utils/response.js';

// The short TEST rehearsal may expire during a provider read. Normal sessions
// retain their established path; no permanent user or role is changed here.
export function createTestPersonnelRequestGuard(req, {
  verify = verifyCrmAccessToken, readAccess = getChatwootConversationAccess, readAssignments = assertChatwootAssignedInboxCurrent,
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
  return async ({permission = 'crm.view', conversationId, conversationIds} = {}) => {
    const user = current(permission);
    if (conversationIds !== undefined) await readAssignments({conversationIds,user});
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

export function createOutboundStatusRequestGuard(req, verify = verifyCrmAccessToken) {
  const header = req.get('authorization') || '';
  const identity = user => JSON.stringify([user?.id,user?.username,user?.role,user?.chatwootAgentId,user?.testPersonnel === true]);
  const original = identity(req.user);
  return () => {
    if (!/^Bearer [^\s]+$/.test(header)) throw Object.assign(Error('Oturum doğrulanamadı.'),{statusCode:401,code:'AUTH_TOKEN_INVALID'});
    const user = verify(header.slice(7));
    if (user?.active !== true || identity(user) !== original) throw Object.assign(Error('Oturum değişti.'),{statusCode:401,code:'AUTH_TOKEN_INVALID'});
    assertCrmPermission(user,'crm.send');
    return user;
  };
}
export function createOutboundStatusController({
  readConversation = getChatwootConversationDetail, readAccess = getChatwootConversationAccess,
  readStatus = readCrmOutboundStatus, makeGuard = createOutboundStatusRequestGuard,
} = {}) {
  return async (req, res, next) => {
    try {
      const conversationId = req.params.conversationId;
      const guard = makeGuard(req);
      await guard?.({permission:'crm.send',conversationId});
      const conversation = await readConversation({conversationId,user:req.user});
      const result = await readStatus({conversationId:String(conversation.id),phone:conversation.phone,
        remoteJid:conversation.remoteJid,actorId:req.user.id,text:req.body?.text,
        media:req.body?.media,clientRequestId:req.body?.clientRequestId});
      await readAccess({conversationId,user:req.user});
      await guard?.({permission:'crm.send',conversationId});
      return ok(res,result,{source:'outbound-journal',readOnly:true});
    } catch(error) { return next(error); }
  };
}
export const postConversationMessageStatus = createOutboundStatusController();
