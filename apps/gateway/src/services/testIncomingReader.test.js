import test from 'node:test';import assert from 'node:assert/strict';
import {startTestIncomingReader} from './testIncomingReader.js';
import {WAAPI_INSTANCE,WAAPI_RECIPIENT} from '../providers/waapiProvider.js';
import {WaapiProvider} from '../providers/waapiProvider.js';
import {WaapiJournal} from './waapiJournal.js';
import {validMediaBytes} from '../utils/validMediaFixtures.js';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const success = data => ({status:'success',data:{status:'success',instanceId:WAAPI_INSTANCE,data}});
const peerA = '19999999991@c.us', peerB = '19999999992@c.us';
const clock = () => ({value:Date.now()});
const messageRow = (id,peer,ts,extra={}) => ({message:{id:{_serialized:`false_${peer}_${id}`,fromMe:false,remote:peer},from:peer,body:'synthetic inbound',timestamp:ts,...extra}});
const chat = (peer,ts,extra={}) => ({id:{_serialized:peer},isGroup:false,unreadCount:0,timestamp:ts,lastMessage:{id:{_serialized:`true_${peer}_hint`,fromMe:true,remote:peer},timestamp:ts},...extra});
async function reader(t,request,{time=clock(),journal,provider,config={incomingTestOnly:false}}={}) {
 const accepted=[],calls=[];let tick;
 const transport=provider||{request:async(action,body)=>{calls.push({action,body,at:time.value});return request(action,body);}};
 const stop=startTestIncomingReader({provider:transport,config,journal:journal||{accept:async event=>{accepted.push(event);return{accepted:true};}},
  bridge:{sync:()=>{throw Error('general reader must use the durable journal, not fixed conversation55');}},
  now:()=>time.value,setIntervalFn:fn=>{tick=fn;return{unref(){}};},clearIntervalFn:()=>{}});
 t.after(stop);await new Promise(resolve=>setImmediate(resolve));
 return {accepted,calls,time,stop,tick:async(ms=45000)=>{time.value+=ms;await tick();}};
}
async function journalFixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'incoming-reader-'));t.after(()=>rm(root,{recursive:true,force:true}));return{root,journal:new WaapiJournal(root)};}

test('general passive reader discovers two unread-zero peers; outgoing discovery hints are never ingested',async t=>{
 const ts=Math.floor(Date.now()/1000);
 const r=await reader(t,(action,body)=>action==='action/get-chats'?success([chat(peerA,ts),chat(peerB,ts)]):success([messageRow('received',body.chatId,ts)]));
 for(let i=0;i<5;i++)await r.tick();
 assert.deepEqual(r.accepted.map(event=>event.phone),['19999999991','19999999992']);
 assert(r.accepted.every(event=>event.providerMessageId.endsWith('_received')));
 assert(r.calls.every(({action,body})=>['action/get-chats','action/fetch-messages'].includes(action)&&(action!=='action/fetch-messages'||body.fromMe===false&&body.includeMedia===true)));
});

test('general reader excludes groups/broadcast/newsletters/old chats and malformed message identity',async t=>{
 const ts=Math.floor(Date.now()/1000);
 const bad=messageRow('bad',peerA,ts);bad.message.from=peerB;
 const r=await reader(t,(action)=>action==='action/get-chats'?success([
  chat(peerA,ts),chat(peerB,ts-90000),chat('123456789@g.us',ts,{isGroup:true}),chat('status@broadcast',ts),chat('123456789@newsletter',ts),
 ]):success([messageRow('foreign',peerB,ts),bad,messageRow('old',peerA,ts-90000),messageRow('future',peerA,ts+600),messageRow('good',peerA,ts)]));
 await r.tick();assert.equal(r.accepted.length,1);assert(r.accepted[0].providerMessageId.endsWith('_good'));
 assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').length,1);
});

test('LID discovery and returned LIDs use authenticated canonical identity; foreign identity cannot cross peers',async t=>{
 const ts=Math.floor(Date.now()/1000),lidA='22252259123221@lid',lidB='33352259123221@lid',requests=[];
 const provider=new WaapiProvider({config:{},now:()=>Date.now()});
 provider.request=async(action,body)=>{
  requests.push({action,body});
  if(action==='action/get-chats')return success([chat(lidA,ts)]);
  if(action==='action/get-lid')return success({contacts:[{lid:body.contactIds[0],pn:body.contactIds[0]===lidA?peerA:peerB}],count:1});
  return success([messageRow('foreign',lidB,ts),messageRow('good',lidA,ts)]);
 };
 const r=await reader(t,null,{provider});await r.tick();
 assert.equal(r.accepted.length,1);assert.equal(r.accepted[0].phone,'19999999991');assert.equal(r.accepted[0].peerJid,lidA);
 assert.equal(requests.filter(call=>call.action==='action/get-lid').length,1);
});

test('message pagination preserves a burst larger than one page and gives another peer a fair turn',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock();
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,ts),chat(peerB,ts)]);
  if(body.chatId===peerB)return success([messageRow('other-peer',peerB,ts)]);
  return success(body.offset===0?Array.from({length:100},(_,i)=>messageRow('burst-'+i,peerA,ts)):Array.from({length:20},(_,i)=>messageRow('burst-'+(i+100),peerA,ts)));
 },{time});
 for(let i=0;i<7;i++)await r.tick();
 assert.equal(r.accepted.length,121);
 assert.equal(r.accepted[100].phone,'19999999992');
 assert(r.calls.some(call=>call.body.offset===100&&call.action==='action/fetch-messages'));
});

test('chat pagination discovers peers beyond the first hundred while retaining full message pages',async t=>{
 const ts=Math.floor(Date.now()/1000);
 const r=await reader(t,(action,body)=>action==='action/get-chats'?success(body.offset===0?
  Array.from({length:100},()=>chat('status@broadcast',ts)): [chat(peerB,ts)]):success([messageRow('page-two',peerB,ts)]));
 await r.tick();await r.tick();assert.equal(r.accepted.length,1);assert.equal(r.accepted[0].phone,'19999999992');
 assert(r.calls.some(call=>call.action==='action/get-chats'&&call.body.offset===100));
});

test('bounded queue retains a partially discovered page until all 330 recent peers get a turn',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock();
 const chats=Array.from({length:330},(_,i)=>chat(`${19999000000+i}@c.us`,ts));
 const r=await reader(t,(action,body)=>action==='action/get-chats'?success(chats.slice(body.offset,body.offset+body.limit)):
  success([messageRow('one-per-peer',body.chatId,ts)]),{time});
 for(let i=0;i<1600&&r.accepted.length<330;i++)await r.tick();
 assert.equal(r.accepted.length,330);assert.equal(new Set(r.accepted.map(event=>event.phone)).size,330);
 assert(r.calls.every(call=>call.body.limit===100));
});

test('a fresh peer bypasses a saturated 500-peer backfill while every older peer retains a turn',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),peers=Array.from({length:500},(_,i)=>`${19999000000+i}@c.us`);
 const freshPeer=peers[400],seen=new Set();let changed=false,replyAt,receivedAt;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats') {
   const chats=peers.map(peer=>chat(peer,changed&&peer===freshPeer?Math.floor(replyAt/1000):ts));
   chats.sort((a,b)=>b.timestamp-a.timestamp);
   return success(chats.slice(body.offset,body.offset+body.limit));
  }
  return success([messageRow(changed&&body.chatId===freshPeer?'fresh-reply':'backlog',body.chatId,
   changed&&body.chatId===freshPeer?Math.floor(replyAt/1000):ts)]);
 },{time,journal:{accept:async event=>{
  seen.add(event.phone);
  if(event.providerMessageId.endsWith('_fresh-reply'))receivedAt??=time.value;
  return{accepted:true};
 }}});
 for(let i=0;i<30;i++)await r.tick();
 assert(seen.size<100,'the startup backlog must still be active when the reply arrives');
 changed=true;replyAt=time.value;
 for(let i=0;i<8&&receivedAt===undefined;i++)await r.tick();
 assert(receivedAt!==undefined,'a fresh reply must not wait behind the complete backfill');
 assert(receivedAt-replyAt<=360000,`fresh reply waited ${receivedAt-replyAt}ms`);
 const olderCount=seen.size;
 for(let i=0;i<1600&&seen.size<500;i++)await r.tick();
 assert.equal(seen.size,500);assert(seen.size>olderCount);
 t.diagnostic(`synthetic 500-peer queue: fresh reply ${receivedAt-replyAt}ms; all 500 peers retained`);
 for(const call of r.calls)assert(r.calls.filter(other=>other.at>call.at-300000&&other.at<=call.at).length<=8);
 assert(r.calls.every(call=>['action/get-chats','action/fetch-messages'].includes(call.action)&&call.body.limit===100));
});

test('a changed paginated peer probes its newest page promptly and then resumes its unfinished old cursor',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000);let changed=false,freshAt;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,changed?ts+1:ts),chat(peerB,ts)]);
  if(body.chatId===peerB)return success([messageRow('oldest-slot',peerB,ts)]);
  if(body.offset===0&&changed){freshAt??=time.value;return success([messageRow('new-head-reply',peerA,ts+1)]);}
  changed=true;
  return success(Array.from({length:100},(_,i)=>messageRow('deep-'+(body.offset+i),peerA,ts)));
 },{time});
 const started=time.value;
 for(let i=0;i<8&&freshAt===undefined;i++)await r.tick();
 assert(freshAt!==undefined);assert(freshAt-started<=360000);
 for(let i=0;i<12;i++)await r.tick();
 assert(r.accepted.some(event=>event.providerMessageId.endsWith('_oldest-slot')));
 assert(r.calls.some(call=>call.action==='action/fetch-messages'&&call.body.offset>=300));
 assert(r.accepted.some(event=>event.providerMessageId.endsWith('_new-head-reply')));
 t.diagnostic(`synthetic deep pagination: changed head ${freshAt-started}ms; old cursor resumed`);
});

test('failed head refreshes do not prevent retained backfill peers from being read',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),chats=Array.from({length:330},(_,i)=>chat(`${19999000000+i}@c.us`,ts));let heads=0;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats'){
   if(body.offset===0&&++heads>1)throw Error('SYNTHETIC_HEAD_FAILURE');
   return success(chats.slice(body.offset,body.offset+body.limit));
  }
  return success([messageRow('retained-peer',body.chatId,ts)]);
 },{time});
 for(let i=0;i<40;i++)await r.tick();
 assert(heads>2);assert(r.accepted.length>10,'head failure must not monopolize every later tick');
 assert(r.calls.some(call=>call.action==='action/get-chats'&&call.body.offset===200));
});

test('changed-peer full rescans retain all 275 new messages before resuming a deep saved cursor',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),seen=new Set();let changed=false,starts=0;
 const original=Array.from({length:1000},(_,i)=>messageRow('original-'+i,peerA,ts));
 const burst=Array.from({length:275},(_,i)=>messageRow('fresh-burst-'+i,peerA,ts+1));
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,changed?ts+1:ts)]);
  if(body.offset===0)starts++;
  // Both shapes are valid: current messages may precede or follow the old rows.
  const rows=changed?[...burst,...original]:original;
  if(!changed&&body.offset===400)changed=true;
  return success(rows.slice(body.offset,body.offset+body.limit));
 },{time,journal:{accept:async event=>{seen.add(event.providerMessageId);return{accepted:true};}}});
 for(let i=0;i<140;i++)await r.tick();
 assert(changed);assert.equal(starts,2,'the changed hint must start one complete rescan');
 assert.equal([...seen].filter(id=>id.includes('_fresh-burst-')).length,275);
 assert.equal([...seen].filter(id=>id.includes('_original-')).length,1000);
 const offsets=r.calls.filter(call=>call.action==='action/fetch-messages').map(call=>call.body.offset);
 const rescanStart=offsets.indexOf(0,1);
 assert.deepEqual(offsets.slice(rescanStart,rescanStart+13),Array.from({length:13},(_,i)=>i*100));
 assert(offsets.slice(rescanStart+13).includes(500),'the prior cursor remains resumable after the terminal rescan');
});

test('changed-peer rescans also reach a fresh burst after oldest-first provider pages',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),seen=new Set();let changed=false;
 const original=Array.from({length:1000},(_,i)=>messageRow('ascending-old-'+i,peerA,ts));
 const burst=Array.from({length:275},(_,i)=>messageRow('ascending-new-'+i,peerA,ts+1));
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,changed?ts+1:ts)]);
  const rows=changed?[...original,...burst]:original;
  if(!changed&&body.offset===400)changed=true;
  return success(rows.slice(body.offset,body.offset+body.limit));
 },{time,journal:{accept:async event=>{seen.add(event.providerMessageId);return{accepted:true};}}});
 for(let i=0;i<140;i++)await r.tick();
 assert.equal([...seen].filter(id=>id.includes('_ascending-new-')).length,275);
 assert.equal([...seen].filter(id=>id.includes('_ascending-old-')).length,1000);
});

test('a newer discovery hint during message pagination schedules another complete fetch pass',async t=>{
 const ts=Math.floor(Date.now()/1000);let changed=false,starts=0;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,ts,{lastMessage:{id:{_serialized:changed?'false_new-hint':'true_old-hint'},timestamp:changed?ts+1:ts}})]);
  if(body.offset===0){starts++;if(starts===1){changed=true;return success(Array.from({length:100},(_,i)=>messageRow('old-'+i,peerA,ts)));}
   return success([messageRow('new-after-page',peerA,ts+1)]);}
  return success([]);
 });
 for(let i=0;i<7;i++)await r.tick();
 assert.equal(starts,2);assert(r.accepted.some(event=>event.providerMessageId.endsWith('_new-after-page')));
});

test('durable pending media survives reader restart and later fetch hydrates one event',async t=>{
 const {root,journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();let hydrated=false;
 const request=(action)=>action==='action/get-chats'?success([chat(peerA,ts)]):success([{...messageRow('media',peerA,ts,{hasMedia:true,type:'document'}),
  ...(hydrated?{media:{mimetype:'application/pdf',data:validMediaBytes('application/pdf').toString('base64'),filename:'synthetic.pdf'}}:{})}]);
 let r=await reader(t,request,{time,journal});await r.tick();r.stop();
 assert.equal((await journal.pending(WAAPI_INSTANCE))[0].event.mediaPending,true);
 hydrated=true;r=await reader(t,request,{time,journal:new WaapiJournal(root)});await r.tick();
 const pending=await journal.pending(WAAPI_INSTANCE);assert.equal(pending.length,1);assert.equal(pending[0].event.mediaPending,false);
 assert.equal(pending[0].event.media.mimeType,'application/pdf');assert.equal((await readdir(path.join(root,'events'))).length,1);
});

test('restart first empty fetch retains delayed journal media and later hydrates only the matching peer',async t=>{
 const {root,journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();let stage=0;
 const pendingRow=messageRow('restart-empty-media',peerA,ts,{hasMedia:true,type:'document'});
 const media={mimetype:'application/pdf',data:validMediaBytes('application/pdf').toString('base64'),filename:'synthetic.pdf'};
 const request=action=>action==='action/get-chats'?success([chat(peerA,ts)]):
  stage===0?success([pendingRow]):stage===1?success([]):success([
   {...messageRow('wrong-peer',peerB,ts,{hasMedia:true,type:'document'}),media}, {...pendingRow,media},
  ]);
 let r=await reader(t,request,{time,journal});await r.tick();r.stop();
 const key=journal.key(`${WAAPI_INSTANCE}:message:${pendingRow.message.id._serialized}:`);
 await journal.update('events',key,value=>({...value,retryAt:new Date(Date.now()+900000).toISOString()}));
 assert.equal((await journal.pending(WAAPI_INSTANCE)).length,0);
 stage=1;r=await reader(t,request,{time,journal:new WaapiJournal(root)});await r.tick();
 assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').length,1);
 assert.equal((await journal.get('events',key)).event.mediaPending,true);
 stage=2;await r.tick(300001);await r.tick(0);
 const stored=await journal.get('events',key);assert.equal(stored.event.mediaPending,false);
 assert.equal(stored.event.phone,peerA.slice(0,-5));assert.equal(stored.event.media.mimeType,'application/pdf');
 assert.equal((await readdir(path.join(root,'events'))).length,1);
 const fetches=r.calls.filter(call=>call.action==='action/fetch-messages').length;
 await r.tick(300001);await r.tick(0);assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').length,fetches);
 assert(r.calls.every(call=>['action/get-chats','action/fetch-messages'].includes(call.action)));
});

test('pending media is fetched again without a last-message change after bounded hydration delay',async t=>{
 const {journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();let hydrated=false;
 const r=await reader(t,(action)=>action==='action/get-chats'?success([chat(peerA,ts)]):success([{...messageRow('media',peerA,ts,{hasMedia:true,type:'document'}),
  ...(hydrated?{media:{mimetype:'application/pdf',data:validMediaBytes('application/pdf').toString('base64'),filename:'synthetic.pdf'}}:{})}]),{time,journal});
 await r.tick();hydrated=true;await r.tick(300000);await r.tick();
 assert.equal((await journal.pending(WAAPI_INSTANCE))[0].event.mediaPending,false);
});

test('restart recovers accepted pending media older than 24h without backfilling unrelated old messages',async t=>{
 const {root,journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();let stage=0;
 const pendingRow=messageRow('aging-pending-media',peerA,ts,{hasMedia:true,type:'document'});
 const media={mimetype:'application/pdf',data:validMediaBytes('application/pdf').toString('base64')};
 const request=action=>action==='action/get-chats'?success([chat(peerA,Math.floor(time.value/1000))]):
  stage===0?success([pendingRow]):stage===1?success([]):success([
   {...messageRow('foreign-old',peerB,ts,{hasMedia:true,type:'document'}),media},
   {...messageRow('unaccepted-old',peerA,ts,{hasMedia:true,type:'document'}),media},
   messageRow('unaccepted-old-text',peerA,ts), {...pendingRow,media},
  ]);
 let r=await reader(t,request,{time,journal});await r.tick();r.stop();
 time.value+=25*3600000;stage=1;r=await reader(t,request,{time,journal:new WaapiJournal(root)});await r.tick();
 const key=journal.key(`${WAAPI_INSTANCE}:message:${pendingRow.message.id._serialized}:`);
 assert.equal((await journal.get('events',key)).event.mediaPending,true);
 stage=2;await r.tick(300001);await r.tick(0);
 assert.equal((await journal.get('events',key)).event.mediaPending,false);
 assert.equal((await readdir(path.join(root,'events'))).length,1);
 assert(r.calls.every(call=>['action/get-chats','action/fetch-messages'].includes(call.action)));
});

test('malformed and missing intermediate media polls retain unresolved identity until valid matching hydration',async t=>{
 const {journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();let stage=0;
 const r=await reader(t,(action)=>{
  if(action==='action/get-chats')return success([chat(peerA,ts)]);
  if(stage===2)return success([]);
  return success([{...messageRow('awaited-media',peerA,ts,{hasMedia:true,type:'document'}),...(stage===1?
   {media:{mimetype:'application/pdf',data:'YQ==',filename:'invalid.pdf'}}:stage===3?
   {media:{mimetype:'application/pdf',data:validMediaBytes('application/pdf').toString('base64'),filename:'valid.pdf'}}:{})}]);
 },{time,journal});
 await r.tick();
 for(stage=1;stage<=3;stage++){await r.tick(300001);await r.tick(0);
  assert.equal((await journal.pending(WAAPI_INSTANCE))[0].event.mediaPending,stage!==3);}
 const fetches=r.calls.filter(call=>call.action==='action/fetch-messages').length;
 await r.tick(300001);await r.tick(0);
 assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').length,fetches);
});

test('restart first malformed media response preserves journal pending recovery and later hydrates the same identity',async t=>{
 const {root,journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();let stage=0;
 const request=action=>action==='action/get-chats'?success([chat(peerA,ts)]):success([{
  ...messageRow('restart-media',peerA,ts,{hasMedia:true,type:'document'}),...(stage===1?{media:{mimetype:'application/pdf',data:'YQ=='}}:
   stage===2?{media:{mimetype:'application/pdf',data:validMediaBytes('application/pdf').toString('base64')}}:{}),
 }]);
 let r=await reader(t,request,{time,journal});await r.tick();r.stop();stage=1;
 r=await reader(t,request,{time,journal:new WaapiJournal(root)});await r.tick();
 assert.equal((await journal.pending(WAAPI_INSTANCE))[0].event.mediaPending,true);
 stage=2;await r.tick(300001);await r.tick(0);
 assert.equal((await journal.pending(WAAPI_INSTANCE))[0].event.mediaPending,false);
 assert.equal((await readdir(path.join(root,'events'))).length,1);
});

test('repeated full message page stays incomplete with bounded retry while another peer progresses',async t=>{
 const {root,journal}=await journalFixture(t),ts=Math.floor(Date.now()/1000),time=clock();
 const full=Array.from({length:100},(_,i)=>messageRow('repeat-'+i,peerA,ts));
 const r=await reader(t,(action,body)=>action==='action/get-chats'?success([chat(peerA,ts),chat(peerB,ts)]):
  success(body.chatId===peerA?full:[messageRow('fair',peerB,ts)]),{time,journal});
 await r.tick(0);await r.tick(0);await r.tick(0);
 assert.equal((await readdir(path.join(root,'events'))).length,101);
 assert((await journal.get('events',journal.key(`${WAAPI_INSTANCE}:message:false_${peerB}_fair:`))).event.phone==='19999999992');
 const count=r.calls.length;for(let i=0;i<5;i++)await r.tick(0);assert.equal(r.calls.length,count);
 await r.tick(300001);await r.tick(0);assert.equal((await readdir(path.join(root,'events'))).length,101);
 assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').at(-1).body.offset,0);
});

test('message pagination explicitly stops at 200 pages without treating the unfinished peer as complete',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock();
 const r=await reader(t,(action,body)=>action==='action/get-chats'?success([chat(peerA,ts)]):
  success(Array.from({length:100},(_,i)=>messageRow('bounded-'+(body.offset+i),peerA,ts))),{time});
 for(let i=0;i<500&&r.accepted.length<20000;i++)await r.tick(300001);
 await r.tick(0);await r.tick(0);
 const fetches=r.calls.filter(call=>call.action==='action/fetch-messages');
 assert.equal(fetches.length,200);assert.equal(fetches.at(-1).body.offset,19900);assert.equal(r.accepted.length,20000);
 for(let i=0;i<5;i++)await r.tick(0);
 assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').length,200);
 await r.tick(300001);await r.tick(0);
 assert.equal(r.calls.filter(call=>call.action==='action/fetch-messages').at(-1).body.offset,0);
});

test('peer failure does not starve another queued peer',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock();let failed=false;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,ts),chat(peerB,ts)]);
  if(body.chatId===peerA&&!failed){failed=true;throw Error('SYNTHETIC_PEER_FAILURE');}
  return success([messageRow('ok',body.chatId,ts)]);
 },{time});
 await r.tick();await r.tick();await r.tick();assert.equal(r.accepted[0].phone,'19999999992');
});

test('six passive calls reserve two operator slots and count discovery, LID and fetch without losing continuation',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock(),lid='22252259123221@lid',calls=[];
 const provider=new WaapiProvider({config:{},now:()=>time.value});
 provider.request=async(action,body)=>{
  calls.push({action,body});
  if(action==='action/get-chats')return success([chat(lid,ts)]);
  if(action==='action/get-lid')return success({contacts:[{lid,pn:peerA}],count:1});
  return success(Array.from({length:100},(_,i)=>messageRow('burst-'+(body.offset+i),lid,ts)));
 };
 const r=await reader(t,null,{time,provider});for(let i=0;i<8;i++)await r.tick(0);
 assert.equal(calls.length,6);assert.equal(r.accepted.length,400,JSON.stringify(calls));
 assert.equal(calls.filter(call=>call.action==='action/get-lid').length,1);
 const offset=calls.at(-1).body.offset;await r.tick(1);assert.equal(calls.length,6);
 await r.tick(300000);await r.tick(0);assert.equal(calls.at(-1).body.offset,offset+100);assert.equal(r.accepted.length,500);
});

test('repeated full discovery page is reported incomplete and does not spin or ingest lastMessage',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock();
 const r=await reader(t,()=>success(Array.from({length:100},()=>chat('status@broadcast',ts))),{time});
 await r.tick(0);assert.equal(r.calls.length,2);assert.equal(r.accepted.length,0);
 await r.tick(45000);assert.equal(r.calls.length,2);
 await r.tick(300000);assert.equal(r.calls.length,3);assert.equal(r.calls.at(-1).body.offset,0);
});

test('provider429 globally waits before any other peer/discovery request and resumes later',async t=>{
 const ts=Math.floor(Date.now()/1000),time=clock();let reject=true;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,ts),chat(peerB,ts)]);
  if(reject){reject=false;throw Object.assign(Error('WHATSAPP_CRM_WAAPI_HTTP_429'),{statusCode:429});}
  return success([messageRow('after-limit',body.chatId,ts)]);
 },{time});
 await r.tick();const count=r.calls.length;for(let i=0;i<5;i++)await r.tick();assert.equal(r.calls.length,count);
 await r.tick(300000);await r.tick();assert.equal(r.accepted.length,1);
});

test('a provider-local quota resumes at its exact oldest-call expiry instead of adding another five minutes',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),requests=[];
 const provider=new WaapiProvider({config:{instanceId:WAAPI_INSTANCE,apiToken:'synthetic-offline-token'},now:()=>time.value,
  fetchFn:async(url,options)=>{
   const action=url.slice(url.lastIndexOf('/client/')+8),body=options.body?JSON.parse(options.body):undefined;
   requests.push({action,body,at:time.value});
   return{ok:true,json:async()=>success(action==='action/get-chats'?[chat(peerA,ts)]:[messageRow('exact-resume',peerA,ts)])};
  }});
 provider.calls=Array.from({length:7},()=>time.value-250000);
 const r=await reader(t,null,{time,provider});assert.equal(requests.length,0);
 await r.tick();assert.equal(requests.length,0,'passive transport must leave two provider slots');
 await r.tick(4999);assert.equal(requests.length,0);
 await r.tick(1);assert.equal(requests.length,1,'resume at 50s, not a new 5-minute block from the 45s rejection');
 await r.tick(0);
 assert.equal(r.accepted.length,1);assert.equal(requests.at(-1).action,'action/fetch-messages');
});

test('an explicit provider retry-after blocks every peer and discovery only until that deadline',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000);let rejected=false;
 const r=await reader(t,(action,body)=>{
  if(action==='action/get-chats')return success([chat(peerA,ts),chat(peerB,ts)]);
  if(!rejected){rejected=true;throw Object.assign(Error('WHATSAPP_CRM_WAAPI_HTTP_429'),{statusCode:429,meta:{retryAfterMs:90000}});}
  return success([messageRow('retry-after',body.chatId,ts)]);
 },{time});
 await r.tick();const count=r.calls.length;
 await r.tick(89999);assert.equal(r.calls.length,count);
 await r.tick(1);assert(r.calls.length>count);
 await r.tick(0);assert.equal(r.accepted.length,1);
});

test('shared operator occupancy blocks passive transport at six total calls and resumes at oldest expiry',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),requests=[];
 const provider=new WaapiProvider({config:{instanceId:WAAPI_INSTANCE,apiToken:'synthetic-offline-token'},now:()=>time.value,
  fetchFn:async(url,options)=>{
   const action=url.slice(url.lastIndexOf('/client/')+8),body=options.body?JSON.parse(options.body):undefined;
   requests.push({action,body,at:time.value});
   return{ok:true,json:async()=>success(action==='action/get-chats'?[chat(peerA,ts)]:
    Array.from({length:100},(_,i)=>messageRow('quota-page-'+(body.offset+i),peerA,ts)))};
  }});
 provider.calls=[time.value-250000];
 const r=await reader(t,null,{time,provider});
 for(let i=0;i<7;i++)await r.tick(0);
 assert.equal(requests.length,5);assert.equal(provider.calls.length,6);
 await r.tick(49999);assert.equal(requests.length,5);
 await r.tick(1);assert.equal(requests.length,6);assert.equal(provider.calls.length,6);
 assert.equal(requests.at(-1).at-requests[0].at,50000);
 for(let i=0;i<5;i++)await r.tick(0);assert.equal(requests.length,6);
});
test('TEST receiver imports only recent incoming messages from the verified peer, once, without sends',async()=>{
 const now=Date.now(),ts=Math.floor(now/1000),peer=WAAPI_RECIPIENT+'@c.us';let tick;const imports=[],requests=[];
 const row=(id,remote=peer,time=ts,fromMe=false)=>({message:{id:{_serialized:(fromMe?'true':'false')+'_'+remote+'_'+id,fromMe,remote},from:remote,to:remote,body:'test',timestamp:time}});
 const response={status:'success',data:{status:'success',instanceId:WAAPI_INSTANCE,data:[row('one'),row('one'),row('other','12345678900@c.us'),row('old',peer,ts-90000),row('future',peer,ts+600),row('sent',peer,ts,true)]}};
 const provider={request:async(path,body)=>{requests.push({path,body});return response;}};
 const stop=startTestIncomingReader({provider,config:{incomingTestOnly:true},bridge:{sync:async(event,id)=>{imports.push({event,id});return{confirmed:true};}},now:()=>now,setIntervalFn:fn=>{tick=fn;return 1;},clearIntervalFn:()=>{}});
 await new Promise(resolve=>setImmediate(resolve));await tick();stop();
 assert.equal(imports.length,1);assert.equal(imports[0].id,55);assert.equal(imports[0].event.direction,'incoming');assert(requests.every(x=>x.path==='action/fetch-messages'&&x.body.fromMe===false&&x.body.chatId===peer));
});

test('TEST reader resolves its verified linked peer but never imports another peer or sends',async()=>{
 const now=Date.now(),ts=Math.floor(now/1000),lid='22252259123221@lid';let tick;const imports=[],requests=[];
 const row=(id,remote)=>({message:{id:{_serialized:'false_'+remote+'_'+id,fromMe:false,remote},from:remote,body:'test linked identity',timestamp:ts}});
 const response={status:'success',data:{status:'success',instanceId:WAAPI_INSTANCE,data:[row('one',lid),row('one',lid),row('other','33352259123221@lid'),row('direct-other','12345678900@c.us')]}};
 const provider={request:async(path,body)=>{requests.push({path,body});return response;},resolveIncomingPhone:async peer=>{assert.equal(peer,lid);return WAAPI_RECIPIENT;}};
 const stop=startTestIncomingReader({provider,config:{verifiedRecipientLid:lid,incomingTestOnly:true},bridge:{sync:async(event,id)=>{imports.push({event,id});return{confirmed:true};}},now:()=>now,setIntervalFn:fn=>{tick=fn;return 1;},clearIntervalFn:()=>{}});
 await new Promise(resolve=>setImmediate(resolve));await tick();stop();
 assert.equal(imports.length,1);assert.equal(imports[0].id,55);assert.equal(imports[0].event.phone,WAAPI_RECIPIENT);assert.equal(imports[0].event.peerJid,lid);
 assert(requests.every(call=>call.path==='action/fetch-messages'&&call.body.chatId===WAAPI_RECIPIENT+'@c.us'));
});

test('six passive transports leave the same provider two slots for status plus explicit send, never enlarging eight-call quota',async t=>{
 const time=clock(),ts=Math.floor(time.value/1000),requests=[];
 const provider=new WaapiProvider({config:{instanceId:WAAPI_INSTANCE,apiToken:'synthetic-offline-token'},now:()=>time.value,fetchFn:async(url,options)=>{
  const action=url.slice(url.lastIndexOf('/client/')+8),body=options.body?JSON.parse(options.body):undefined;requests.push({action,body,at:time.value});
  const result=action==='status'?{status:'success',clientStatus:{status:'success',instanceId:WAAPI_INSTANCE,instanceStatus:'ready'}}:
   action==='action/send-message'?success({id:{_serialized:'true_'+WAAPI_RECIPIENT+'@c.us_synthetic-explicit',fromMe:true,remote:WAAPI_RECIPIENT+'@c.us'}}):
   action==='action/get-chats'?success([chat(peerA,ts)]):success(Array.from({length:100},(_,i)=>messageRow('retained-'+(body.offset+i),peerA,ts)));
  return {ok:true,json:async()=>result};
 }});
 const r=await reader(t,null,{time,provider});for(let i=0;i<8;i++)await r.tick(0);
 assert.equal(requests.length,6);assert.equal(provider.calls.length,6);assert.equal(r.accepted.length,500);
 assert.equal((await provider.getStatus()).providerConnected,true);
 const sent=await provider.sendMessage({phone:WAAPI_RECIPIENT,text:'Synthetic explicit operator test'});
 assert.equal(sent.providerAccepted,true);assert.equal(requests.length,8);assert.equal(provider.calls.length,8);
 assert.deepEqual(requests.slice(-2).map(r=>r.action),['status','action/send-message']);
 await r.tick(0);assert.equal(requests.length,8,'passive scheduler cannot spend the operator reserve or retry');
 await assert.rejects(()=>provider.request('status'),e=>e.code==='WHATSAPP_CRM_WAAPI_RATE_LIMIT'&&e.meta.transportAttempted===false);
 assert.equal(requests.length,8,'the total provider quota remains eight');
 await r.tick(299999);assert.equal(requests.length,8);await r.tick(1);
 assert.equal(requests.length,9);await r.tick(0);
 assert.equal(requests.length,10);assert.equal(requests.at(-1).body.offset,500,'retained continuation resumes after the scheduled head refresh');
 assert.equal(r.accepted.length,600);assert.equal(provider.calls.length,2);
});
