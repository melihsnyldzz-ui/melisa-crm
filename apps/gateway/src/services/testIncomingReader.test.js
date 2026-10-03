import test from 'node:test';import assert from 'node:assert/strict';
import {startTestIncomingReader} from './testIncomingReader.js';
import {WAAPI_INSTANCE,WAAPI_RECIPIENT} from '../providers/waapiProvider.js';
test('TEST receiver imports only recent incoming messages from the verified peer, once, without sends',async()=>{
 const now=Date.now(),ts=Math.floor(now/1000),peer=WAAPI_RECIPIENT+'@c.us';let tick;const imports=[],requests=[];
 const row=(id,remote=peer,time=ts,fromMe=false)=>({message:{id:{_serialized:(fromMe?'true':'false')+'_'+remote+'_'+id,fromMe,remote},from:remote,to:remote,body:'test',timestamp:time}});
 const response={status:'success',data:{status:'success',instanceId:WAAPI_INSTANCE,data:[row('one'),row('one'),row('other','12345678900@c.us'),row('old',peer,ts-90000),row('future',peer,ts+600),row('sent',peer,ts,true)]}};
 const provider={request:async(path,body)=>{requests.push({path,body});return response;}};
 const stop=startTestIncomingReader({provider,bridge:{sync:async(event,id)=>{imports.push({event,id});return{confirmed:true};}},now:()=>now,setIntervalFn:fn=>{tick=fn;return 1;},clearIntervalFn:()=>{}});
 await new Promise(resolve=>setImmediate(resolve));await tick();stop();
 assert.equal(imports.length,1);assert.equal(imports[0].id,55);assert.equal(imports[0].event.direction,'incoming');assert(requests.every(x=>x.path==='action/fetch-messages'&&x.body.fromMe===false&&x.body.chatId===peer));
});
