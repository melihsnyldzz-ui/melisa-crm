import { verifyCrmAccessToken } from '../services/crmAuthService.js';
import { catalogAccess } from '../services/crmCatalogAccess.mjs';
import { createReadBudgetMiddleware, budgetKey, PROPOSED_READ_BUDGET } from './catalogReadBudget.mjs';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { fail } from '../utils/response.js';

export function securityHeaders() {
  return helmet({
    crossOriginResourcePolicy: false,
  });
}

export function crmCors() {
  const existingCors = cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.nodeEnv !== 'production' || env.cors.origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed'));
    },
    credentials: true,
  });
  // Approved exact Sites Origin, only the two catalog auth POSTs. Existing CORS config stays unchanged.
  const catalogOrigin = "https://melisa-crm-ozel-tasarim-testi.melihsnyldzz.chatgpt.site";
  const catalogAuthCors = cors({ origin: catalogOrigin, credentials: true });
  return (req, res, next) => {
    const catalogAuth = req.method === 'POST'
      && ['/crm/catalog/auth/sign-in', '/crm/catalog/auth/sign-out'].includes(req.path)
      && req.headers.origin === catalogOrigin;
    return (catalogAuth ? catalogAuthCors : existingCors)(req, res, next);
  };
}

export function apiRateLimit() {
  const globalLimiter = rateLimit({
    windowMs: env.rateLimit.windowMs, max: env.rateLimit.max,
    standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => fail(res, 429, 'WHATSAPP_CRM_RATE_LIMITED', 'Too many requests'),
  });
  const readLimiter = (max) => rateLimit({
    windowMs: PROPOSED_READ_BUDGET.windowMs, max,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: budgetKey,
    handler: (req, res) => fail(res, 429, 'WHATSAPP_CRM_RATE_LIMITED', 'Too many requests'),
  });
  return createReadBudgetMiddleware({
    verifyToken: verifyCrmAccessToken,
    canRead: (user, authorization) => catalogAccess.canRead(user, authorization),
    globalLimiter,
    catalogLimiter: readLimiter(PROPOSED_READ_BUDGET.catalogMax),
    verificationLimiter: readLimiter(PROPOSED_READ_BUDGET.verificationMax),
  });
}

export const crmLoginRateLimit = rateLimit({
  windowMs: env.auth.loginRateLimitWindowMs,
  max: env.auth.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const username = String(req.body?.username || '').trim().toLocaleLowerCase('tr-TR').slice(0, 100);
    return `crm-login:${ipKeyGenerator(req.ip)}:${username}`;
  },
  handler: (req, res) => fail(
    res,
    429,
    'WHATSAPP_CRM_LOGIN_RATE_LIMITED',
    'Cok fazla hatali giris denemesi yapildi. Bir sure sonra tekrar deneyin.',
  ),
});

export const crmTranslationRateLimit = rateLimit({
  windowMs: env.translation.rateLimitWindowMs,
  max: env.translation.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `crm-translation:${req.user?.id || ipKeyGenerator(req.ip)}`,
  handler: (req, res) => fail(
    res,
    429,
    'WHATSAPP_CRM_TRANSLATION_RATE_LIMITED',
    'Cok fazla ceviri istegi yapildi. Bir sure sonra tekrar deneyin.',
  ),
});
