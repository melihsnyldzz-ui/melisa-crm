import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { safeRequestPath } from '../utils/safeRequestPath.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || 'WHATSAPP_CRM_INTERNAL_ERROR';
  // A locally rejected manual send has not reached the provider. Its exact
  // rolling quota must not freeze independent catalogue/conversation reads.
  if (statusCode === 429 && code === 'WHATSAPP_CRM_WAAPI_RATE_LIMIT'
    && err.meta?.transportAttempted === false && req.method === 'POST'
    && /^\/crm\/conversations\/[1-9][0-9]*\/messages$/.test(req.path)
    && Number.isFinite(err.meta.retryAfterMs) && err.meta.retryAfterMs > 0) {
    res.setHeader('X-CRM-RateLimit-Scope', 'crm-send');
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(err.meta.retryAfterMs / 1000))));
  }
  const message = statusCode === 500 && env.nodeEnv === 'production'
    ? 'Unexpected WhatsApp CRM server error'
    : err.message || 'Unexpected WhatsApp CRM server error';

  logger.error('WhatsApp CRM error normalized', {
    requestId: req.requestId,
    method: req.method,
    path: safeRequestPath(req),
    statusCode,
    code,
    providerStatus: err.meta?.providerStatus || err.meta?.status,
    providerCode: err.meta?.providerCode,
    deliveryState: err.meta?.deliveryState,
  });

  const meta = {
    requestId: req.requestId,
  };

  if (err.meta?.deliveryState) meta.deliveryState = err.meta.deliveryState;
  if (err.meta?.clientRequestId) meta.clientRequestId = err.meta.clientRequestId;
  if (err.meta?.providerStatus) meta.providerStatus = err.meta.providerStatus;

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
    meta,
  });
}
