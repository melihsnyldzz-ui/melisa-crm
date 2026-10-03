import crypto from 'node:crypto';
import { env } from '../config/env.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireWebhookSecret(req, res, next) {
  if (!env.whatsapp.webhookSecret) {
    const error = new Error('Webhook secret is not configured');
    error.code = 'WHATSAPP_CRM_WEBHOOK_SECRET_MISSING';
    error.statusCode = 503;
    return next(error);
  }

  const allowedSecrets = [
    env.whatsapp.webhookSecret,
    env.evolution.apiKey,
  ].filter(Boolean);
  const providedSecrets = [
    req.get('x-melisa-webhook-secret'),
    req.get('x-evolution-webhook-secret'),
    req.get('apikey'),
    req.body?.apikey,
  ].filter(Boolean);

  const accepted = providedSecrets.some((provided) => (
    allowedSecrets.some((secret) => safeEqual(provided, secret))
  ));

  if (!accepted) {
    const error = new Error('Webhook secret is invalid');
    error.code = 'WHATSAPP_CRM_WEBHOOK_FORBIDDEN';
    error.statusCode = 403;
    return next(error);
  }

  return next();
}
