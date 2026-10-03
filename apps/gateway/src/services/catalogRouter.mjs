import {createCatalogBridge,CATALOG_RESPONSE_GUARD} from './catalogBridge.mjs';
import {catalogAccess} from './crmCatalogAccess.mjs';
export function createCatalogRouter({Router,verifyCrmContext,transport,activationApproved=false,uiOrigin,access=catalogAccess}={}) {
  if(typeof Router!=='function'||typeof verifyCrmContext!=='function')throw Error('REVIEWED_GATEWAY_HOOKS_REQUIRED');
  const router=Router();
  const fail=(status,code)=>Response.json({success:false,error:{code,message:code}},{status,headers:{'cache-control':'no-store'}});
  const context=request=>{
    const header=request.headers.get('authorization')||'';
    if(!/^Bearer [^\s]+$/.test(header))throw Object.assign(Error('CURRENT_CRM_SESSION_REQUIRED'),{status:401});
    return verifyCrmContext(header.slice(7));
  };
  const bridge=createCatalogBridge({deploymentApproved:activationApproved,transport,
    authorizeCrm:async request=>{
      const current=context(request),header=request.headers.get('authorization');
      return {...current.user,catalogReadApproved:access.base(current.user),catalogReadRevoked:access.isRevoked(current.user,header)};
    },
    resolveCrmReadSession:async(_actor,request)=>access.lease(context(request),request,verifyCrmContext),
  });
  const auth=async request=>{
    if(!activationApproved)return fail(503,'BRIDGE_NOT_DEPLOYED');
    if(request.headers.get('origin')!==uiOrigin)return fail(403,'CATALOG_ORIGIN_REQUIRED');
    if(new URL(request.url).search)return fail(400,'INVALID_QUERY');
    const current=context(request);
    if(!access.base(current.user))return fail(403,'CRM_CATALOG_SCOPE_REQUIRED');
    // Removed ERP sign-in never forwards credentials or creates a second session.
    if(new URL(request.url).pathname.endsWith('/sign-in'))return fail(410,'ERP_SIGN_IN_NOT_REQUIRED');
    const raw=await request.text();if(Buffer.byteLength(raw)>1024)return fail(400,'INVALID_AUTH_BODY');
    let body;try{body=JSON.parse(raw)}catch{return fail(400,'INVALID_AUTH_BODY')}
    if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)return fail(400,'INVALID_AUTH_BODY');
    access.revoke(current,request);
    return Response.json({success:true,data:{connected:false},meta:{source:'crm-catalog-auth'}},{headers:{'cache-control':'no-store'}});
  };
  const handler=fn=>async(req,res)=>{
    const controller=new AbortController(),close=()=>{if(!res.writableEnded)controller.abort()};req.once('aborted',close);res.once('close',close);
    try {
      const headers={authorization:req.get('authorization')||'',origin:req.get('origin')||''};
      const request=new Request('http://127.0.0.1:4200'+req.originalUrl,{method:req.method,headers,signal:controller.signal,...(req.method==='POST'?{body:JSON.stringify(req.body)}:{})});
      const response=await fn(request),body=Buffer.from(await response.arrayBuffer());
      if(controller.signal.aborted)return;response[CATALOG_RESPONSE_GUARD]?.();
      for(const[key,value]of response.headers)res.setHeader(key,value);res.status(response.status).send(body);
    } catch(error) {
      if(controller.signal.aborted)return;
      const allowed=new Set(['CATALOG_SESSION_REVOKED','CURRENT_CRM_SESSION_REQUIRED','AUTH_TOKEN_EXPIRED','AUTH_TOKEN_INVALID','CATALOG_SESSION_LIMIT']);
      const code=allowed.has(error?.message)?error.message:'CATALOG_UNAVAILABLE';
      res.setHeader('cache-control','no-store');res.status(code==='CATALOG_SESSION_LIMIT'?503:allowed.has(code)?401:502).json({success:false,error:{code,message:code}});
    } finally {req.removeListener('aborted',close);res.removeListener('close',close)}
  };
  for(const path of ['/crm/catalog/products','/crm/catalog/products/:id','/crm/catalog/products/:id/photo'])router.get(path,handler(bridge));
  router.post('/crm/catalog/auth/sign-in',handler(auth));router.post('/crm/catalog/auth/sign-out',handler(auth));
  return {router,clearAll:()=>access.clearAll()};
}
