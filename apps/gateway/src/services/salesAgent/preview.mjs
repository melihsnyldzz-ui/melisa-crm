import { prepareSalesDraft } from './agent.mjs';
import { salesError, validatePolicy } from './policy.mjs';

/** Authenticated caller scope is forwarded on BOTH reads; request-body facts/rules are ignored. */
export function createSalesPreview({ getMode, loadPolicy, readConversation, generate }) {
  return async ({ conversationId, user }) => {
    if (!user) throw salesError('AI_AUTH_REQUIRED', 401);
    if (getMode() !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
    const rawPolicy = await loadPolicy();
    const policyFingerprint = JSON.stringify(validatePolicy(rawPolicy));
    const conversation = await readConversation({ conversationId, user });
    if (String(conversation?.id) !== String(conversationId)) throw salesError('AI_CONVERSATION_MISMATCH', 409);
    return prepareSalesDraft({ conversation, policy: rawPolicy, products: [] }, {
      // V1 endpoint intentionally has NO catalog adapter; catalog input from a browser is unsafe.
      generate,
      readCurrentConversation: async id => {
        if (getMode() !== 'copilot') throw salesError('AI_SALES_DISABLED', 503);
        if (JSON.stringify(validatePolicy(await loadPolicy())) !== policyFingerprint) throw salesError('AI_POLICY_CHANGED', 409);
        return readConversation({ conversationId: id, user });
      },
    });
  };
}
