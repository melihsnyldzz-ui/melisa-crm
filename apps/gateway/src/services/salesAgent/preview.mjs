import { prepareSalesDraft } from './agent.mjs';
import { salesError, validatePolicy } from './policy.mjs';

/** Authenticated caller scope is forwarded on BOTH reads; request-body facts/rules are ignored. */
export function assertSalesConversationScope(conversationId, configuredId) {
  if (configuredId === undefined || configuredId === null || configuredId === '') return;
  if (typeof configuredId !== 'string' || !/^[1-9]\d*$/.test(configuredId)
      || !Number.isSafeInteger(Number(configuredId))) throw salesError('AI_SALES_SCOPE_INVALID', 503);
  if (String(conversationId) !== configuredId) throw salesError('AI_SALES_CONVERSATION_FORBIDDEN', 403);
}

export function createSalesPreview({ getMode, loadPolicy, readConversation, generate,
  getAllowedConversationId = () => undefined, getAllowedTestPeer = () => undefined,
  normalizePhone, getCurrentUser, assertConversationAccess }) {
  return async ({ conversationId, user }) => {
    if (!user) throw salesError('AI_AUTH_REQUIRED', 401);
    if (getMode() !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
    const allowedConversationId = getAllowedConversationId();
    const allowedTestPeer = getAllowedTestPeer();
    assertSalesConversationScope(conversationId, allowedConversationId);
    if (allowedTestPeer !== undefined && allowedTestPeer !== null && allowedTestPeer !== ''
        && (typeof allowedTestPeer !== 'string' || !/^[1-9]\d{6,14}$/.test(allowedTestPeer)
          || typeof normalizePhone !== 'function' || normalizePhone(allowedTestPeer) !== allowedTestPeer)) {
      throw salesError('AI_SALES_SCOPE_INVALID', 503);
    }
    const checkSettings = () => {
      if (getMode() !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
      if (getAllowedConversationId() !== allowedConversationId || getAllowedTestPeer() !== allowedTestPeer) {
        throw salesError('AI_SALES_SCOPE_CHANGED', 409);
      }
      assertSalesConversationScope(conversationId, allowedConversationId);
      const currentUser = getCurrentUser ? getCurrentUser() : user;
      if (!currentUser || String(currentUser.id ?? '') !== String(user.id ?? '')) throw salesError('AI_AUTH_REQUIRED', 401);
      return currentUser;
    };
    const checkPeer = current => {
      if (allowedTestPeer && normalizePhone(current?.phone) !== allowedTestPeer) {
        throw salesError('AI_SALES_CONVERSATION_FORBIDDEN', 403);
      }
    };
    const checkReadAccess = current => {
      const currentUser = checkSettings();
      if (assertConversationAccess) assertConversationAccess(currentUser, current);
      checkPeer(current);
    };
    checkSettings();
    const rawPolicy = await loadPolicy();
    checkSettings();
    const policyFingerprint = JSON.stringify(validatePolicy(rawPolicy));
    const checkPolicy = async () => {
      if (JSON.stringify(validatePolicy(await loadPolicy())) !== policyFingerprint) throw salesError('AI_POLICY_CHANGED', 409);
      checkSettings();
    };
    const conversation = await readConversation({ conversationId, user: checkSettings() });
    checkSettings();
    if (String(conversation?.id) !== String(conversationId)) throw salesError('AI_CONVERSATION_MISMATCH', 409);
    checkReadAccess(conversation);
    await checkPolicy();
    checkReadAccess(conversation);
    let latestConversation = conversation;
    const result = await prepareSalesDraft({ conversation, policy: rawPolicy, products: [] }, {
      // V1 endpoint intentionally has NO catalog adapter; catalog input from a browser is unsafe.
      generate: request => { checkReadAccess(conversation); return generate(request); },
      readCurrentConversation: async id => {
        await checkPolicy();
        const current = await readConversation({ conversationId: id, user: checkSettings() });
        checkSettings();
        checkReadAccess(current);
        await checkPolicy();
        checkReadAccess(current);
        latestConversation = current;
        return current;
      },
    });
    await checkPolicy();
    checkReadAccess(latestConversation);
    return result;
  };
}
