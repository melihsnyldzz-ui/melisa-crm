import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { safeRequestPath } from '../utils/safeRequestPath.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || 'WHATSAPP_CRM_INTERNAL_ERROR';
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
