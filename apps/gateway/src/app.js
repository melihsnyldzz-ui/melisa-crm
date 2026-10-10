import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestContext } from './middleware/requestContext.js';
import { apiRateLimit, crmCors, securityHeaders } from './middleware/security.js';
import { routes } from './routes/index.js';
import { createWaapiWebhookRoutes } from './routes/waapiWebhookRoutes.js';
import { createMessageUploadParser } from './middleware/messageUploadParser.js';
import {SHARED_STABLE_ORIGIN,resolveStableTransport} from '../../../deploy/stable-transport.mjs';
import {resolveTestEndpoints} from '../../../deploy/test-endpoints.mjs';
import {verifyCrmAccessToken} from './services/crmAuthService.js';
import {catalogAccess} from './services/crmCatalogAccess.mjs';

function authenticatedStableCatalogSignOut(req){
  if(req.method!=='POST'||req.originalUrl!=='/crm/catalog/auth/sign-out'||req.headers.origin!==SHARED_STABLE_ORIGIN
    ||req.socket.localAddress!=='127.0.0.1'||req.socket.remoteAddress!=='127.0.0.1'
    ||['forwarded','x-forwarded-host','x-forwarded-for','x-forwarded-proto','x-real-ip'].some(key=>Object.hasOwn(req.headers,key)))return false;
  try{
    if(!resolveStableTransport(process.env,resolveTestEndpoints(process.env)))return false;
    const authorization=req.get('authorization')||'';if(!/^Bearer [^\s]+$/.test(authorization))return false;
    return catalogAccess.base(verifyCrmAccessToken(authorization.slice(7)));
  }catch{return false;}
}

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
      &&!(req.method==='POST'&&req.path==='/auth/login')&&!authenticatedStableCatalogSignOut(req)){
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
