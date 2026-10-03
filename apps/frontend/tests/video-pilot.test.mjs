import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pathToFileURL } from 'node:url';
import { bindPilotNavigation, createPilotSession, createRoomName, invitationPreview, quoteDraftProducts, roomURL } from '../src/video/pilot.js';
const fakeCrypto = { getRandomValues(bytes) { bytes.fill(42); return bytes; } };
const contextCrypto = count => ({getRandomValues(bytes){ count.calls += 1; bytes.fill(count.calls); return bytes; }});
test('no room name, entropy access or side effects before explicit prepare; repeated clicks are idempotent', () => {
  const count={calls:0}; const session=createPilotSession({isCurrent:()=>true,cryptoApi:contextCrypto(count)});
  assert.equal(session.current(),''); assert.equal(count.calls,0);
  const room=session.prepare(); assert.match(room,/^MelisaPilot-[0-9a-f]{32}$/); assert.equal(count.calls,1);
  assert.equal(session.prepare(),room); assert.equal(count.calls,1);
});
test('room links contain only fixed Jitsi origin, opaque entropy and optional muted preferences',()=>{
  const room=createRoomName(fakeCrypto), url=new URL(roomURL(room,{join:true}));
  assert.equal(url.protocol,'https:'); assert.equal(url.hostname,'meet.jit.si'); assert.equal(url.username,''); assert.equal(url.search,'');
  assert.equal(url.hash,'#config.startWithAudioMuted=true&config.startWithVideoMuted=true');
  for(const bad of ['', 'Customer-19999999999', '../x', '//other.test', 'MelisaPilot-'+ 'a'.repeat(32)+'?token=private', 'https://meet.jit.si/name']) assert.throws(()=>roomURL(bad));
  const preview=invitationPreview(room); assert(preview.includes(url.href)); assert(!preview.includes('müşteriId')); assert(!preview.includes('token='));
});
test('missing secure crypto fails closed rather than using time, phone, names or Math.random',()=>{
  assert.throws(()=>createRoomName({}),/Güvenli/); assert.throws(()=>createPilotSession({isCurrent:()=>true,cryptoApi:{}}).prepare());
  assert.throws(()=>createPilotSession({cryptoApi:fakeCrypto}).prepare(),/bağlamı/);
});
test('close discards room and prevents repeated actions; reopening requires a fresh explicit prepare',()=>{
  const count={calls:0}; const session=createPilotSession({isCurrent:()=>true,cryptoApi:contextCrypto(count)}); const old=session.prepare();
  session.close(); session.close(); assert.equal(session.current(),''); assert.throws(()=>session.prepare()); assert.equal(count.calls,1);
  const fresh=createPilotSession({isCurrent:()=>true,cryptoApi:contextCrypto(count)}); assert.equal(fresh.current(),''); assert.notEqual(fresh.prepare(),old);
});
test('recipient removal/switch and account/session invalidation reject stale invite or join, even if old recipient returns',()=>{
  for(const reason of ['recipient','account','session']){
    let current=true;const session=createPilotSession({isCurrent:()=>current,cryptoApi:fakeCrypto});session.prepare();
    current=false;assert.equal(session.current(),'',reason);assert.equal(session.isActive(),false);assert.throws(()=>session.prepare());
    current=true;assert.equal(session.current(),'');assert.throws(()=>session.prepare());
  }
});
test('Back/Forward and page exit dismiss only; cleanup removes navigation handlers and cannot restore an invite',()=>{
  for(const eventName of ['popstate','pagehide']){
    const target=new EventTarget();let closed=0;const session=createPilotSession({isCurrent:()=>true,cryptoApi:fakeCrypto});session.prepare();
    const cleanup=bindPilotNavigation(target,()=>{session.close();closed++;});target.dispatchEvent(new Event(eventName));assert.equal(closed,1);assert.equal(session.current(),'');
    cleanup();target.dispatchEvent(new Event('popstate'));assert.equal(closed,1);assert.throws(()=>session.prepare());
  }
});
test('offer selection is an explicit local allowlist with no price, quantity, supplier, customer or ERP writes',()=>{
  const rows=[{id:1,code:'REAL.1',name:'Original product',salePrice:50,stockQuantity:3,cost:1,supplier:'private',customerId:42},{id:2,code:'REAL.2',name:'Another'}];
  const before=JSON.stringify(rows);assert.deepEqual(quoteDraftProducts(rows,['1','1','absent']),[{id:'1',code:'REAL.1',name:'Original product'}]);assert.equal(JSON.stringify(rows),before);
});
test('actual component initially renders no room link or embedded media and only a read-only non-sending preview flow',async()=>{
  mkdirSync('.sites-runtime',{recursive:true});const filename='.sites-runtime/video-pilot-test.mjs';
  try{
    buildSync({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/video/JitsiPilot.jsx'],outfile:filename,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
    const {default:JitsiPilot}=await import(pathToFileURL(`${process.cwd()}/${filename}`).href);
    const html=renderToStaticMarkup(React.createElement(JitsiPilot,{customer:{name:'Synthetic <script>Customer</script>',phone:'+0000'},products:[],isCurrent:()=>true,onClose:()=>{throw Error('SSR must not close');}}));
    assert.match(html,/Davet bağlantısını hazırla/);assert.match(html,/Gönderilmeyen|davet önizlemesi/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<iframe|<video|<audio|href=|MelisaPilot-[a-f0-9]{32}/);
    assert.match(html,/CRM otomatik kayıt başlatmaz/);assert.match(html,/Henüz|henüz/);
  }finally{rmSync(filename,{force:true});}
});
test('integration keeps invitations outside composer/send and rejects stale context before external join',()=>{
  const component=readFileSync('src/video/JitsiPilot.jsx','utf8'),app=readFileSync('src/App.jsx','utf8'),model=readFileSync('src/video/pilot.js','utf8');
  assert.match(component,/target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"/);
  assert.match(component,/sessionRef\.current\.current\(\) !== room/);assert.match(component,/readOnly rows=/);assert.match(component,/disclosureAccepted \?/);
  assert.doesNotMatch(component+model,/getUserMedia|MediaRecorder|window\.open|fetch\(|liveApi|localStorage|sessionStorage|sendMessage|setDraft|history\.pushState/);
  assert.match(app,/closeVideoPilot\(\); setSelectedId/);assert.match(app,/closeVideoPilot\(\); setMobileChatOpen\(false\)/);
  assert.match(app,/sendScopeRef\.current\.isCurrent\(videoContext\.epoch\)/);assert.match(app,/modal === "Video" && videoContextCurrent/);
  assert.doesNotMatch(app,/createVideoRequest|Video görüşme talebi personele yönlendirildi/);
  assert.match(app,/onClick=\{\(\) => onOpenVideo\(selected\?\.id\)\}/);
  assert.match(app,/selectedConversation\(conversationsRef\.current, recipientId\)/);
  assert.match(app,/recipientId: String\(recipient\.id\)/);
});
