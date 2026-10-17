// Local, opt-in synthetic application runner. Never deploy this development file.
import '../../tests/offline-test-guard.mjs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {actors,conversations,products,customers,hash,currentSource,database,catalogMeta,productPhoto} from './fixtures.mjs';
import {createSyntheticNative} from './native.mjs';
import {offlineViteClient} from './viteClient.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ok=data=>Response.json({success:true,data});
const fail=(code,statusCode=400)=>{throw Object.assign(Error(code),{code,statusCode});};
const bearer=req=>req.headers.authorization||'';

export async function startSyntheticApp({synthetic=false,port=0,storeFile=path.join(root,'work/cloud-test/native-orders.json'),infoFile=path.join(root,'work/cloud-test/server.json'),withFrontend=true}={}){
 if(synthetic!==true||port!==0)throw Error('EXPLICIT_SYNTHETIC_EPHEMERAL_LOOPBACK_REQUIRED');
 const work=path.join(root,'work');if(!path.resolve(storeFile).startsWith(work+path.sep)||!path.resolve(infoFile).startsWith(work+path.sep))throw Error('SYNTHETIC_WORK_JOURNAL_REQUIRED');
 // Do not load any local deployment environment, credential or provider config.
 for(const key of Object.keys(process.env))if(/^(CRM_|ERP_|VITE_|PG|SQL|DATABASE_|WAAPI_|WHATSAPP_|CHATWOOT_|EVOLUTION_|OPENAI_|REDIS_)/.test(key))delete process.env[key];
 const [{default:express},{createTestOrderHandler},{createCustomerProductRequestService},{createCustomerProductRequestRouter}]=await Promise.all([
  import('../../apps/gateway/node_modules/express/index.js'),import('../../deploy/test-erp-orders.mjs'),import('../../apps/gateway/src/services/customerProductRequest.mjs'),import('../../apps/gateway/src/routes/customerProductRequestRoutes.mjs'),
 ]);
 const app=express(),sessions=new Map(),nativeSessions=new Map(),native=createSyntheticNative({storeFile});
 const actorFor=(authorization)=>{const actor=sessions.get(authorization);if(!actor||actor.expiresAt<=Date.now())fail('AUTH_TOKEN_INVALID',401);return actor;};
 const visible=(actor,id)=>{const conversation=conversations.find(c=>c.id===String(id));if(!conversation)fail('CONVERSATION_NOT_FOUND',404);if(actor.id==='stranger')fail('CONVERSATION_FORBIDDEN',403);return conversation;};
 const nativeActor=authorization=>{const id=nativeSessions.get(authorization);if(!id)fail('ERP_LOGIN_REQUIRED',401);return id;};
 // All calls made by the production order proxy are resolved in-process. The
 // imported socket/fetch guard independently rejects provider/SQL/LIVE access.
 const transport=async(input,options={})=>{
  const url=new URL(input);try{
   if(url.origin==='http://crm.synthetic.invalid'){
    const actor=actorFor(options.headers?.authorization);
    if(url.pathname==='/auth/me')return ok(actor);
    const match=url.pathname.match(/^\/crm\/conversations\/(\d+)$/);if(match)return ok(visible(actor,match[1]));
   }
   if(url.origin==='http://native.synthetic.invalid'){
    if(url.pathname==='/test-health')return ok({database,environment:'CANONICAL_TEST',purpose:'crm-order-draft-only',synthetic:true});
    if(url.pathname==='/api/auth/login'&&options.method==='POST'){
     const body=JSON.parse(options.body);if(!['erp-test','erp-other'].includes(body.username)||body.password!=='synthetic-only')fail('AUTH_INVALID_CREDENTIALS',401);
     const id=body.username==='erp-test'?'901':'902',token=randomBytes(24).toString('base64url');nativeSessions.set('Bearer '+token,id);return ok({accessToken:token,user:{id,displayName:'Sentetik ERP '+id,permissions:['sales.create','sales.view','product.view']}});
    }
    const id=nativeActor(options.headers?.Authorization);
    if(url.pathname==='/api/test/crm/orders/v2/customers'&&options.method==='GET')return ok(await native.customers(url.searchParams.get('phone'),url.searchParams.get('search')||''));
    if(url.pathname==='/api/test/crm/orders/v2/drafts'&&options.method==='POST')return ok(await native.create(JSON.parse(options.body),id));
    const match=url.pathname.match(/^\/api\/test\/crm\/orders\/v2\/drafts\/([a-f0-9-]{36})$/i);if(match&&options.method==='GET')return ok(await native.detail(match[1],id));
   }
   fail('SYNTHETIC_ROUTE_NOT_ALLOWED',404);
  }catch(error){return Response.json({success:false,error:{code:error.code||'SYNTHETIC_FAILURE'}},{status:error.statusCode||503});}
 };
 const orderHandler=createTestOrderHandler({fetchFn:transport,testEndpoints:{businessScope:true,isolated:false,database,gatewayOrigin:'http://crm.synthetic.invalid',nativeOrigin:'http://native.synthetic.invalid'}});
 app.use((req,res,next)=>{res.setHeader('x-melisa-synthetic','1');res.setHeader('cache-control','no-store');next();});
 app.get('/api/health',(_req,res)=>res.json({success:true,data:{mode:'synthetic-cloud-only',outbound:'blocked',databaseConnection:false,commercialEffects:false}}));
 app.get('/api/customer-product-request-state',(_req,res)=>res.json({success:true,data:{enabled:true}}));
 // Keep the raw request stream for the real order adapter's bounded body parser.
 app.use('/api/live/crm/erp',async(req,res)=>{req.url='/crm/erp'+req.url;await orderHandler(req,res);});
 app.use(express.json({limit:'16kb'}));
 app.get('/api/live/health',(_req,res)=>res.json({success:true,data:{providerConnected:false,sendReady:false,sendEnabled:false,translationEnabled:false,checkedAt:new Date().toISOString()}}));
 app.get('/api/live/auth/remembered',(_req,res)=>res.json({success:true,data:{enabled:false,user:null}}));
 app.post('/api/live/auth/login',(req,res,next)=>{try{
  const base=actors[req.body?.username];if(!base||req.body?.password!=='synthetic-only')fail('AUTH_INVALID_CREDENTIALS',401);
  const token=randomBytes(24).toString('base64url'),actor={...base,normalSessionId:randomUUID(),fingerprint:hash(token),expiresAt:Date.now()+3600000};sessions.set('Bearer '+token,actor);res.json({success:true,data:{accessToken:token,user:actor}});
 }catch(error){next(error);}});
 app.post('/api/live/auth/logout',(req,res)=>{sessions.delete(bearer(req));res.json({success:true,data:{loggedOut:true}});});
 app.get('/api/live/auth/me',(req,res,next)=>{try{res.json({success:true,data:actorFor(bearer(req))});}catch(error){next(error);}});
 app.get('/api/live/crm/inbox',(req,res,next)=>{try{const actor=actorFor(bearer(req)),rows=actor.id==='stranger'?[]:conversations;res.json({success:true,data:{conversations:rows,summary:{total:rows.length,complete:true,unread:0,unassigned:0,pendingHumanReply:rows.length}}});}catch(error){next(error);}});
 app.get('/api/live/crm/conversations/:id',(req,res,next)=>{try{res.json({success:true,data:visible(actorFor(bearer(req)),req.params.id)});}catch(error){next(error);}});
 app.get('/api/live/crm/agents',(req,res,next)=>{try{actorFor(bearer(req));res.json({success:true,data:{agents:[{id:2,name:'Sentetik Personel'}]}});}catch(error){next(error);}});
 app.get('/api/live/__synthetic/status',async(req,res,next)=>{try{const actor=actorFor(bearer(req));if(actor.id!=='manager')fail('FORBIDDEN',403);const journal=await native.read();res.json({success:true,data:{synthetic:true,stats:native.stats,draftCount:journal.drafts.length,requests:journal.drafts.map(r=>r.receipt.request.requestId)}});}catch(error){next(error);}});
 app.get('/api/live/crm/catalog/products/:id/photo',(req,res,next)=>{try{actorFor(bearer(req));if(!products.some(p=>p.id===req.params.id))fail('PRODUCT_NOT_FOUND',404);res.type('png').send(productPhoto(req.params.id));}catch(error){next(error);}});
 app.get('/api/live/crm/catalog/products/:id',(req,res,next)=>{try{actorFor(bearer(req));const product=products.find(p=>p.id===req.params.id);if(!product)fail('PRODUCT_NOT_FOUND',404);res.json({success:true,data:product,meta:catalogMeta()});}catch(error){next(error);}});
 app.get('/api/live/crm/catalog/products',(req,res,next)=>{try{actorFor(bearer(req));if(Object.keys(req.query).some(k=>!['page','limit','search','barcode','brand','category','hasImage'].includes(k))||!/^\d+$/.test(req.query.page||'1')||!/^\d+$/.test(req.query.limit||'50')||Number(req.query.page||1)<1||Number(req.query.limit||50)<1||Number(req.query.limit||50)>50)fail('INVALID_QUERY');
  const rows=products.filter(p=>(!req.query.search||(p.stockCode+' '+p.productName).toLocaleLowerCase('tr').includes(String(req.query.search).toLocaleLowerCase('tr')))&&(!req.query.brand||p.brand===req.query.brand)&&(!req.query.category||p.category===req.query.category)&&!req.query.barcode),meta=catalogMeta(req.query,rows.length);res.json({success:true,data:rows.slice((meta.page-1)*meta.limit,meta.page*meta.limit),meta});
 }catch(error){next(error);}});
 app.post('/api/live/crm/catalog/auth/sign-out',(req,res,next)=>{try{actorFor(bearer(req));res.json({success:true,data:{connected:false}});}catch(error){next(error);}});
 const server=http.createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 const requestService=createCustomerProductRequestService({config:{enabled:true,isolatedPreparation:true,database,catalogScope:'synthetic-cloud-browser'},storeFile:path.join(path.dirname(storeFile),'customer-requests.json'),resolveBinding:async(actor,id)=>{const c=visible(actor,id);return {backend:'chatwoot',provider:'chatwoot',accountId:'1',inboxId:'2',chatwootConversationId:c.id,chatwootContactId:c.contactId,assigneeId:'2',customerFingerprint:hash(c.phone)};},validateBinding:async(binding,issuer)=>[...sessions.values()].some(actor=>actor.id===issuer.id&&actor.normalSessionId===issuer.normalSessionId&&actor.fingerprint===issuer.fingerprint&&actor.expiresAt===issuer.expiresAt&&actor.expiresAt>Date.now())&&conversations.some(c=>c.id===binding.chatwootConversationId&&hash(c.phone)===binding.customerFingerprint),readProduct:async id=>({success:true,data:products.find(p=>p.id===id),meta:{sourceDatabaseVerified:true,cached:false}}),readCatalogPage:async query=>{const rows=products.filter(p=>(!query.search||(p.productName+' '+p.stockCode).toLocaleLowerCase('tr').includes(query.search.toLocaleLowerCase('tr')))&&(!query.category||p.category===query.category));return {success:true,data:rows.slice((query.page-1)*query.limit,query.page*query.limit),meta:{sourceDatabaseVerified:true,cached:false,page:query.page,limit:query.limit,total:rows.length,totalPages:Math.max(1,Math.ceil(rows.length/query.limit)),hasNextPage:query.page<Math.ceil(rows.length/query.limit),facets:{categories:[{value:'Takım',count:1},{value:'Battaniye',count:1}],ages:[]}}};},readPhoto:async id=>({bytes:productPhoto(id),mime:'image/png'})});
 app.use('/api/live',createCustomerProductRequestRouter({Router:express.Router,service:requestService,allowedOrigins:[origin],verifyStaff:async req=>actorFor(bearer(req))}));
 // No fallback route can message a provider, create a sale, or start paid AI.
 app.use('/api',(_req,res)=>res.status(404).json({success:false,error:{code:'SYNTHETIC_ROUTE_NOT_ALLOWED'}}));
 app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({success:false,error:{code:error.code||'SYNTHETIC_FAILURE',message:error.code||'Sentetik test işlemi tamamlanamadı.'}}));
 let vite;
 if(withFrontend){
  const [{createServer},{default:react}]=await Promise.all([import('../../apps/frontend/node_modules/vite/dist/node/index.js'),import('../../apps/frontend/node_modules/@vitejs/plugin-react/dist/index.js')]);
  const envDir=path.join(root,'work/cloud-test/empty-env');await mkdir(envDir,{recursive:true});
  const syntheticBanner={name:'melisa-synthetic-boundary',configureServer(dev){dev.middlewares.use('/@vite/client',(_req,res)=>{res.setHeader('content-type','text/javascript');res.end(offlineViteClient);});},transformIndexHtml:{order:'post',handler:html=>html.replace(/<script[^>]*src="\/@vite\/client"[^>]*><\/script>/g,'').replace(/<title>[^<]*<\/title>/,'<title>Melisa CRM · Sentetik Cloud TEST</title>').replace('<body>','<body><aside style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#502e74;color:white;padding:7px 12px;text-align:center;font:600 12px Arial;pointer-events:none" aria-label="Sentetik Cloud TEST">SENTETİK CLOUD TEST · Örnek müşteri/ürün · SQL/ERP/LIVE bağlantısı yok</aside>')}};
  vite=await createServer({root:path.join(root,'apps/frontend'),configFile:false,envDir,envPrefix:'SYNTHETIC_UNUSED_',plugins:[react(),syntheticBanner],server:{middlewareMode:true,hmr:false,ws:false,fs:{allow:[root]}},define:{'import.meta.env.VITE_CRM_TEST':'"1"','import.meta.env.VITE_CRM_ISOLATED_PREPARATION':'"1"'},appType:'spa'});app.use(vite.middlewares);
 }
 const info={mode:'synthetic-cloud-only',origin,storeFile,outbound:'blocked',fixtureCustomers:customers.map(c=>({id:c.id,name:c.name})),currentSource};await mkdir(path.dirname(infoFile),{recursive:true});await writeFile(infoFile,JSON.stringify(info,null,2));
 return {origin,info,native,async close(){await vite?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(!args.includes('--synthetic')||args.some((arg,index)=>!['--synthetic','--port','0'].includes(arg)||arg==='0'&&args[index-1]!=='--port'))throw Error('Usage: node scripts/cloud-test/server.mjs --synthetic [--port 0]');
 const running=await startSyntheticApp({synthetic:true});console.log(JSON.stringify(running.info));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void running.close().then(()=>process.exit(0)));
}
