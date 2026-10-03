import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestContext } from './middleware/requestContext.js';
import { apiRateLimit, crmCors, securityHeaders } from './middleware/security.js';
import { routes } from './routes/index.js';
import { createWaapiWebhookRoutes } from './routes/waapiWebhookRoutes.js';

export function createApp() {
  const app = express();

  // cloudflared is the only reverse proxy hop in the public deployment.
  // Trusting exactly one hop keeps rate limiting keyed to the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(crmCors());
  app.use(requestContext);
  app.use(apiRateLimit());
  app.use(createWaapiWebhookRoutes());
  app.use(express.json({ limit: env.requestBodyLimit }));

  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
