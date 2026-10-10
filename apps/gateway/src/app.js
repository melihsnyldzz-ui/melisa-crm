import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestContext } from './middleware/requestContext.js';
import { apiRateLimit, crmCors, securityHeaders } from './middleware/security.js';
import { routes } from './routes/index.js';
import { createWaapiWebhookRoutes } from './routes/waapiWebhookRoutes.js';
import { createMessageUploadParser } from './middleware/messageUploadParser.js';

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
  // Shared preparation reads existing CRM data; all upstream writes are closed.
  // Native ERP drafts use the separate isolated order proxy, never this gateway.
  app.use((req,res,next)=>{
    if(process.env.CRM_ISOLATED_PREPARATION==='true'&&!['GET','HEAD','OPTIONS'].includes(req.method)
      &&!(req.method==='POST'&&req.path==='/auth/login')){
      return res.status(403).json({success:false,error:{code:'CRM_PREPARATION_READ_ONLY',message:'Ortak hazırlık ortamında mevcut CRM kayıtları değiştirilemez.'}});
    }
    next();
  });
  app.use(createWaapiWebhookRoutes());
  app.use(createMessageUploadParser());
  app.use(express.json({ limit: env.requestBodyLimit }));

  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
