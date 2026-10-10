// Explicit, one-shot owner TEST preview. No send, order write, polling or bot.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import dotenv from '../apps/gateway/node_modules/dotenv/lib/main.js';
import {createPersonalCatalogAdapter} from '../apps/gateway/src/services/salesAgent/personalCatalog.mjs';
import {createSalesPreview} from '../apps/gateway/src/services/salesAgent/preview.mjs';
import {createSalesGenerator} from '../apps/gateway/src/services/salesAgent/responses.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
export function ownerModelContext(value) {
 if(typeof value==='string')return value.replace(/https?:\/\/[^\s]+/gi,'[bağlantı]').replace(/\b\+?\d[\d ()-]{8,}\d\b/g,'[iletişim]');
 if(Array.isArray(value))return value.map(ownerModelContext);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,ownerModelContext(item)]));
 return value;
}
export function freshOwnerReply(conversation, correction) {
 const sent=new Set(conversation.messages.filter(m=>['out','outgoing'].includes(m.direction)&&typeof m.text==='string').map(m=>hash(m.text)));
 return conversation.messages.filter(m=>['in','incoming'].includes(m.direction)&&!m.private&&!m.isPrivate&&m.type!=='note'
  &&typeof m.text==='string'&&m.text.trim()&&!sent.has(hash(m.text))
  &&Date.parse(m.received_at??m.createdAt??m.timestamp??'')>Date.parse(correction.attemptedAt)).at(-1)??null;
}

export async function previewOwnerCatalog({runtimeDirectory, startupConfigPath, transport=fetch}={}) {
 if(!path.isAbsolute(runtimeDirectory||'')||!path.isAbsolute(startupConfigPath||''))fail('OWNER_COPILOT_PRIVATE_PATH_REQUIRED');
 const read=name=>JSON.parse(fs.readFileSync(path.join(runtimeDirectory,name),'utf8'));
 const profile=read('customer-profile.json'),original=read('owner-pilot-evidence.json'),correction=read('owner-catalog-correction.json');
 if(profile.pilot?.environment!=='ISOLATED_TEST_COPY'||profile.pilot.database!=='MELISA_ERP_CRM_SHARED_TEST_20261009_01'
  ||String(profile.pilot.conversationId)!=='55'||!profile.peer?.endsWith('7733')||correction.state!=='CONFIRMED'
  ||original.ownerSessionId!==correction.ownerSessionId)fail('OWNER_COPILOT_SCOPE_REQUIRED');
 const ui='http://127.0.0.1:62400',gateway='http://127.0.0.1:62401',edge='http://100.87.188.3:62600';
 async function call(origin,route,options={}){
  const r=await transport(origin+route,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),...options});
  const p=await r.json();if(!r.ok||p.success===false)fail('OWNER_COPILOT_SOURCE_UNAVAILABLE');return p.data??p;
 }
 async function bootstrap(port){const origin='http://127.0.0.1:'+port;return call(origin,'/api/test-admin/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});}
 const auth=await bootstrap(62400),staff=await bootstrap(62600);
 const headers={origin:ui,authorization:'Bearer '+auth.accessToken};
 const actor=await call(gateway,'/auth/me',{headers});
 if(String(actor.id)!==String(profile.pilot.actorId)||!actor.permissions?.includes('crm.send')||!['patron','mudur'].includes(actor.role))fail('OWNER_COPILOT_ACTOR_REQUIRED');
 async function conversation(){const data=await call(gateway,'/crm/conversations/55',{headers});const c=data.conversation??data;
  if(String(c.id)!=='55'||String(c.phone).replace(/\D/g,'')!==profile.peer)fail('OWNER_COPILOT_OWNER_MISMATCH');return c;}
 const initial=await conversation();
 const reply=freshOwnerReply(initial,correction);if(!reply)fail('OWNER_REPLY_REQUIRED');
 if(fs.existsSync(path.join(runtimeDirectory,'owner-personal-ai-preview.json')))fail('OWNER_COPILOT_PREVIEW_ALREADY_EXISTS');
 // Credentials come only from the already approved CRM runtime reference, in RAM.
 const startup=JSON.parse(fs.readFileSync(startupConfigPath,'utf8'));
 if(!path.isAbsolute(startup.BaselineEnv||'')||path.resolve(startup.RuntimeDir||'').toLowerCase()!==path.resolve(path.dirname(startupConfigPath)).toLowerCase())fail('OWNER_COPILOT_RUNTIME_REQUIRED');
 const existing=dotenv.parse(fs.readFileSync(startup.BaselineEnv));
 if(!existing.OPENAI_API_KEY||!existing.WHATSAPP_CRM_TRANSLATION_MODEL)fail('OWNER_COPILOT_EXISTING_AI_REQUIRED');
 const health=await call(gateway,'/health',{headers});if(health.provider!=='waapi'||health.authMode!=='crm-local'||!health.providerConnected)fail('OWNER_COPILOT_RUNTIME_REQUIRED');
 const adapter=createPersonalCatalogAdapter({sessionId:original.ownerSessionId,conversationId:'55',actorId:String(actor.id),assertAccess:()=>{},
  readSnapshot:req=>transport(req.url,{headers:{origin:edge,authorization:'Bearer '+staff.accessToken},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)})});
 const generator=createSalesGenerator({apiKey:existing.OPENAI_API_KEY,model:existing.WHATSAPP_CRM_TRANSLATION_MODEL,timeoutMs:30000},transport);
 const preview=createSalesPreview({getMode:()=> 'copilot',getAllowedConversationId:()=> '55',getAllowedTestPeer:()=>profile.peer,
  normalizePhone:value=>String(value||'').replace(/\D/g,''),getCurrentUser:()=>actor,
  readConversation:conversation,loadPolicy:()=>call(gateway,'/crm/sales-rules',{headers}),catalogAdapter:adapter,
  generate:request=>generator({...request,context:ownerModelContext(request.context)})});
 const result=await preview({conversationId:'55',user:actor,staffContext:{customerLanguage:'tr',currentComposer:'Melisa Bebe TEST. Sadece müşterinin mevcut kişisel katalog ve sepetindeki modelleri kullan. 6/4 parçalık seri dağılımları deneme örnekleridir. Teknik sepet müşteri seçimi değildir. Sipariş, stok, ödeme, kargo veya indirim sözü verme.'}});
 await adapter.recheck();
 const record={version:1,state:'REVIEW_REQUIRED',createdAt:new Date().toISOString(),conversationId:'55',ownerSessionId:original.ownerSessionId,
  replyId:String(reply.id),replySha256:hash(reply.text),result,autoSend:false,nativeWrite:false};
 fs.writeFileSync(path.join(runtimeDirectory,'owner-personal-ai-preview.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
 return {state:record.state,productIds:result.productIds,personalCatalogBound:!!result.personalCatalog,autoSend:false,nativeWrite:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==4)fail('OWNER_COPILOT_EXPLICIT_ARGUMENTS_REQUIRED');console.log(JSON.stringify(await previewOwnerCatalog({runtimeDirectory:process.argv[2],startupConfigPath:process.argv[3]})));}
 catch(e){console.error(/^[A-Z][A-Z0-9_]+$/.test(e.code||'')?e.code:'OWNER_COPILOT_FAILED');process.exitCode=1;}
}
