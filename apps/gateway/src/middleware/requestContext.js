import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { safeRequestPath } from '../utils/safeRequestPath.js';

export function requestContext(req, res, next) {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    logger.info('WhatsApp CRM request completed', {
      requestId,
      method: req.method,
      path: safeRequestPath(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
