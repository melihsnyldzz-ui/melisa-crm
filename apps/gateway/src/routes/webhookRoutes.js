import { Router } from 'express';
import { postEvolutionWebhook } from '../controllers/webhookController.js';
import { requireWebhookSecret } from '../middleware/webhookSecurity.js';
import { env } from '../config/env.js';

export const webhookRoutes = Router();

webhookRoutes.post('/webhooks/evolution', (req, res, next) => env.whatsapp.provider === 'waapi' ? res.sendStatus(410) : next(), requireWebhookSecret, postEvolutionWebhook);
