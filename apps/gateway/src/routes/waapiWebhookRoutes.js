import crypto from 'node:crypto';
import express, { Router } from 'express';
import { env } from '../config/env.js';
import { acceptWaapiWebhook } from '../services/waapiWebhookService.js';

export function createWaapiWebhookRoutes({ config = env.waapi, accept = acceptWaapiWebhook } = {}) {
  const router = Router();
  router.post('/webhooks/waapi/:secret', (req, res, next) => {
    const expected = Buffer.from(config.webhookSecret || ''); const actual = Buffer.from(req.params.secret || '');
    if (expected.length < 43 || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.sendStatus(401);
    return next();
  }, express.json({ limit: '15mb', strict: true }), async (req, res, next) => {
    try { return res.status(202).json(await accept(req.body)); } catch (e) { return next(e); }
  });
  return router;
}
