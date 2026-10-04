import {WaapiProvider,WAAPI_INSTANCE,WAAPI_RECIPIENT} from '../providers/waapiProvider.js';
import {normalizeWaapiEvent} from './waapiWebhookService.js';
import {waapiChatwootBridge} from './waapiChatwootBridge.js';
import {env} from '../config/env.js';
import {resolveWaapiInboundIdentity} from './waapiInboundIdentityService.js';
export function startTestIncomingReader({provider=new WaapiProvider(),bridge=waapiChatwootBridge,normalize=normalizeWaapiEvent,resolveIdentity=resolveWaapiInboundIdentity,config=env.waapi,now=Date.now,setIntervalFn=setInterval,clearIntervalFn=clearInterval}={}){
 let busy=false;const completed=new Set();const since=Math.floor(now()/1000)-86400;
 const tick=async()=>{if(busy)return;busy=true;try{
  const response=await provider.request('action/fetch-messages',{chatId:WAAPI_RECIPIENT+'@c.us',limit:100,fromMe:false,includeMedia:true});
  if(response?.status!=='success'||response.data?.status!=='success'||String(response.data.instanceId)!==WAAPI_INSTANCE||!Array.isArray(response.data.data))throw Error('WAAPI_INCOMING_READ_INVALID');
  for(const row of response.data.data){const message=row.message,timestamp=Number(message?.timestamp??message?._data?.t);if(message?.id?.fromMe!==false||!Number.isSafeInteger(timestamp)||timestamp<since||timestamp>Math.floor(now()/1000)+300||completed.has(message.id?._serialized))continue;
   let event=normalize({instanceId:WAAPI_INSTANCE,event:'message',data:{message,media:typeof row.media==='object'?row.media:undefined}},{...config,incomingTestOnly:true});
   if(event.event==='ignored')continue;
   event=await resolveIdentity(event,{provider,config:{...config,incomingTestOnly:true}});
   if(event.direction!=='incoming'||event.phone!==WAAPI_RECIPIENT)throw Error('TEST_INCOMING_SCOPE_INVALID');
   if(event.mediaPending){console.warn('TEST inbound: medya içeriği bekleniyor.');continue;}
   const result=await bridge.sync(event,55);if(result.confirmed){completed.add(event.providerMessageId);console.log('TEST inbound: mesaj CRM kaydına alındı.');}
  }
 }catch(error){console.warn('TEST inbound:',/^[A-Z0-9_]+$/.test(error.code||error.message)?error.code||error.message:'READ_FAILED');}finally{busy=false;}};
 const timer=setIntervalFn(tick,45000);timer.unref?.();void tick();return()=>clearIntervalFn(timer);
}
