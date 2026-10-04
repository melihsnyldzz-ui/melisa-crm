import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextDraftStorage, TEXT_DRAFT_STORAGE_KEY, textDraftActorScope} from '../src/lib/textDraftStorage.js';

const actor = (id='a', extras={}) => ({accountIdentity:{id},role:'mudur',canSend:true,chatwootAgentId:7,liveSendEnabled:true,...extras});
const conversation = (id='55', extras={}) => ({id,phone:'+90 538 721 77 33',channel:'whatsapp',assignedUserId:7,owner:'Personel',...extras});
function memoryStorage() { const values=new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; }
const store = storage => createTextDraftStorage({getStorage:()=>storage});
test('realistic unsent multiline text survives repeated same-tab reloads only after verified actor/inbox',()=>{
  const storage=memoryStorage(), a=actor(), c=conversation(), text='  Merhaba\nÜrün ve fiyat için hazırladığım, henüz gönderilmemiş mesaj. 👶\n  ';
  const first=store(storage);first.activate(a,[c]);assert.equal(first.set(c,text).persisted,true);
  for(let i=0;i<4;i++){const next=store(storage);assert.deepEqual(next.visibleDrafts([c]),{});assert.equal(next.set(c,'must not overwrite before authentication').drafts['55'],undefined);assert.equal(next.activate(a,[c]).drafts['55'],text);}
  assert(!storage.getItem(TEXT_DRAFT_STORAGE_KEY).includes('token'));
});
test('conversation drafts stay separate; accepted send clears captured chat only',()=>{
  const storage=memoryStorage(), s=store(storage), a=actor(), one=conversation(), two=conversation('56');s.activate(a,[one,two]);s.set(one,'one');s.set(two,'two');
  assert.deepEqual(s.clearSent(one,'one',textDraftActorScope(a)).drafts,{'56':'two'});
  assert.deepEqual(store(storage).activate(a,[one,two]).drafts,{'56':'two'});
});
test('late send completion cannot clear a newer human draft or a replacement actor/assignment',()=>{
  const s=store(memoryStorage()), a=actor(), c=conversation();s.activate(a,[c]);s.set(c,'sending');s.set(c,'human edit');
  assert.equal(s.clearSent(c,'sending',textDraftActorScope(a)).drafts['55'],'human edit');
  s.activate(actor('b'),[c]);s.set(c,'sending');assert.equal(s.clearSent(c,'sending',textDraftActorScope(a)).drafts['55'],'sending');
  const moved=conversation('55',{assignedUserId:9,owner:'Other'});s.synchronize([moved]);s.set(moved,'sending');
  assert.equal(s.clearSent(c,'sending',textDraftActorScope(actor('b'))).drafts['55'],'sending');
});
test('401 suspension preserves records; reauthentication requires the same verified role and actor',()=>{
  const storage=memoryStorage(), s=store(storage), a=actor(), c=conversation();s.activate(a,[c]);s.set(c,'expiry text');s.suspend();
  assert.deepEqual(s.visibleDrafts([c]),{});assert.equal(s.set(c,'hidden update').drafts['55'],undefined);
  assert.equal(s.activate(a,[c]).drafts['55'],'expiry text');
  s.suspend();assert.deepEqual(s.activate(actor('b'),[c]).drafts,{});assert.deepEqual(store(storage).activate(a,[c]).drafts,{});
});
test('logout and role, crm.send, staff binding changes purge; provider readiness does not',()=>{
  for(const changed of [actor('a',{role:'personel'}),actor('a',{canSend:false}),actor('a',{chatwootAgentId:8})]){
    const storage=memoryStorage(),s=store(storage),c=conversation();s.activate(actor(),[c]);s.set(c,'private');assert.deepEqual(s.activate(changed,[c]).drafts,{});assert.deepEqual(store(storage).activate(actor(),[c]).drafts,{});
  }
  const storage=memoryStorage(),s=store(storage),c=conversation();s.activate(actor(),[c]);s.set(c,'keep');assert.equal(s.activate(actor('a',{liveSendEnabled:false}),[c]).drafts['55'],'keep');s.clear();assert.deepEqual(store(storage).activate(actor(),[c]).drafts,{});
});
test('partial inbox does not discard unopened drafts; peer and assignment are checked before display',()=>{
  const storage=memoryStorage(),s=store(storage),a=actor(),c=conversation(),later=conversation('150');s.activate(a,[c,later]);s.set(later,'later page');
  const reload=store(storage);assert.deepEqual(reload.activate(a,[c]).drafts,{});assert.equal(reload.synchronize([c,later]).drafts['150'],'later page');
  const changed=conversation('150',{phone:'+905000000000'});assert.deepEqual(reload.visibleDrafts([changed]),{});reload.synchronize([changed]);assert.deepEqual(store(storage).activate(a,[later]).drafts,{});
});
test('explicit conversation access loss clears only that record, blank clears without trim',()=>{
  const storage=memoryStorage(),s=store(storage),a=actor(),one=conversation(),two=conversation('56');s.activate(a,[one,two]);s.set(one,'one');s.set(two,'  ');s.forget(one.id);
  assert.equal(store(storage).activate(a,[one,two]).drafts['56'],'  ');s.set(two,'');assert.deepEqual(store(storage).activate(a,[one,two]).drafts,{});
});
test('corrupt, prototype, oversized or extra-field storage is discarded without exposing it',()=>{
  const a=actor(),c=conversation(),valid={version:1,actor:textDraftActorScope(a),records:{'55':{scope:JSON.stringify(['55','905387217733','whatsapp','7','','Personel']),text:'valid'}}};
  for(const raw of ['{',JSON.stringify({...valid,token:'never accepted'}),JSON.stringify({...valid,records:{'55':{...valid.records['55'],text:'x'.repeat(2001)}}}),JSON.stringify({...valid,records:JSON.parse('{"__proto__":{"scope":"[]","text":"bad"}}')}),'x'.repeat(300001)]){
    const storage=memoryStorage();storage.setItem(TEXT_DRAFT_STORAGE_KEY,raw);const s=store(storage);assert.deepEqual(s.activate(a,[c]).drafts,{});assert.equal(storage.getItem(TEXT_DRAFT_STORAGE_KEY),null);
  }
});
test('quota/unavailable storage keeps editable in-memory text and reports it was not persisted',()=>{
  const broken={getItem:()=>null,setItem:()=>{throw new Error('quota');},removeItem:()=>{throw new Error('blocked');}};
  for(const getStorage of [()=>broken,()=>{throw new Error('disabled');}]){
    const s=createTextDraftStorage({getStorage}),c=conversation();s.activate(actor(),[c]);const result=s.set(c,'keep user text');assert.equal(result.drafts['55'],'keep user text');assert.equal(result.persisted,false);
  }
});
test('record bound never silently evicts old or newly edited in-memory drafts',()=>{
  const storage=memoryStorage(),s=store(storage),a=actor(),rows=Array.from({length:101},(_,i)=>conversation(String(i+1)));s.activate(a,rows);
  rows.slice(0,100).forEach((row,i)=>s.set(row,`draft ${i}`));const result=s.set(rows[100],'extra');assert.equal(result.persisted,false);assert.equal(Object.keys(result.drafts).length,101);assert.equal(result.drafts['1'],'draft 0');assert.equal(result.drafts['101'],'extra');
  assert.equal(Object.keys(store(storage).activate(a,rows).drafts).length,100);assert.equal(s.forget('1').persisted,true);assert.equal(store(storage).activate(a,rows).drafts['101'],'extra');
});
test('oversized translated text remains editable with a persistence warning instead of silent truncation',()=>{
  const storage=memoryStorage(),s=store(storage),a=actor(),c=conversation(),text='translated '.repeat(201);s.activate(a,[c]);s.set(c,'prior saved text');
  const result=s.set(c,text);assert.equal(result.drafts['55'],text);assert.equal(result.persisted,false);assert.equal(store(storage).activate(a,[c]).drafts['55'],'prior saved text');
  assert.equal(s.set(c,'shortened').persisted,true);assert.equal(store(storage).activate(a,[c]).drafts['55'],'shortened');
});
test('failed purge cannot resurrect old text in this instance; writable fallback overwrites stale bytes',()=>{
  const storage=memoryStorage(),a=actor(),c=conversation(),s=store(storage);s.activate(a,[c]);s.set(c,'private');const originalRemove=storage.removeItem,originalSet=storage.setItem;
  storage.removeItem=()=>{throw new Error('blocked');};storage.setItem=()=>{throw new Error('blocked');};assert.equal(s.clear().persisted,false);assert.deepEqual(s.activate(a,[c]).drafts,{});
  storage.setItem=originalSet;assert.equal(s.set(c,'new').persisted,true);assert.equal(store(storage).activate(a,[c]).drafts['55'],'new');
  s.clear();assert.deepEqual(store(storage).activate(a,[c]).drafts,{});storage.removeItem=originalRemove;
});
test('failed/uncertain transport leaves text unchanged with no helper send or retry capability',()=>{
  const storage=memoryStorage(),s=store(storage),a=actor(),c=conversation();s.activate(a,[c]);s.set(c,'uncertain');
  s.suspend();assert.equal(store(storage).activate(a,[c]).drafts['55'],'uncertain');assert.equal(s.activate(a,[c]).drafts['55'],'uncertain');assert.equal(s.send,undefined);assert.equal(s.retry,undefined);
});
test('failed purge on actor switch or initial actor mismatch cannot resurrect another actor',()=>{
  for(const initialMismatch of [false,true]){
    const storage=memoryStorage(),a=actor(),b=actor('b'),c=conversation(),first=store(storage);first.activate(a,[c]);first.set(c,'private A');
    const s=initialMismatch?store(storage):first;storage.removeItem=()=>{throw new Error('blocked');};storage.setItem=()=>{throw new Error('blocked');};
    assert.equal(s.activate(b,[c]).persisted,false);assert.deepEqual(s.activate(a,[c]).drafts,{});assert.equal(s.activate(a,[c]).persisted,false);
  }
});
