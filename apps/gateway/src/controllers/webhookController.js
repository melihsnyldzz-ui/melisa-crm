import { getWhatsAppProvider } from '../providers/index.js';
import { persistWebhookEvent } from '../repositories/crmRepository.js';
import { markEventOnce } from '../services/idempotencyStore.js';
import { handleAutoReply } from '../services/autoReplyService.js';
import { created, ok } from '../utils/response.js';

export async function postEvolutionWebhook(req, res, next) {
  try {
    const provider = getWhatsAppProvider();
    const normalizedEvent = provider.normalizeWebhook(req.body, req.headers);
    const idempotency = await markEventOnce(normalizedEvent.eventId);

    if (!idempotency.firstSeen) {
      return ok(res, {
        accepted: true,
        duplicate: true,
        eventId: normalizedEvent.eventId,
      }, {
        source: 'whatsapp-crm-webhook',
        idempotent: true,
      });
    }

    const persistence = await persistWebhookEvent(normalizedEvent);

    if (persistence.duplicate) {
      return ok(res, {
        accepted: true,
        duplicate: true,
        eventId: normalizedEvent.eventId,
      }, {
        source: 'whatsapp-crm-webhook',
        idempotent: true,
        persistence: 'postgres-duplicate',
      });
    }

    setImmediate(() => {
      handleAutoReply(normalizedEvent, { conversationId: persistence.conversationId })
        .catch((error) => console.error('[whatsapp-auto-reply] failed', {
          code: error.code || 'WHATSAPP_AUTO_REPLY_FAILED',
          message: error.message,
          eventId: normalizedEvent.eventId,
        }));
    });

    return created(res, {
      accepted: true,
      duplicate: false,
      event: normalizedEvent,
      persistence,
    }, {
      source: 'whatsapp-crm-webhook',
      idempotent: true,
      persistence: 'postgres',
    });
  } catch (error) {
    return next(error);
  }
}
