import { getChatwootConversationDetail } from '../services/chatwootInboxService.js';
import { translateConversationText } from '../services/translationService.js';
import { ok } from '../utils/response.js';

export async function postConversationTranslation(req, res, next) {
  try {
    const conversation = await getChatwootConversationDetail({
      conversationId: req.params.conversationId,
      user: req.user,
    });
    const result = await translateConversationText({
      conversation,
      mode: req.body?.mode,
      text: req.body?.text,
      targetLanguage: req.body?.targetLanguage,
    });
    return ok(res, result, {
      source: 'openai-translation',
      readOnly: true,
      autoSend: false,
    });
  } catch (error) {
    return next(error);
  }
}

