import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberTerminalShare,verifyTerminalShare,clearTerminalShare} from '../src/terminalShareProof.js';
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const row={id:'erp-36724',revision:'a'.repeat(64)},envelope=()=>({data:{...row,status:'active',hold:{blocked:false}},meta:{catalogVersion:'melisa-catalog.v1',sourceDatabaseVerified:true,cached:false}});
test('exact share source metadata survives refresh and is scoped to actor/conversation; no prices or auth are stored',async()=>{
 const storage=store();rememberTerminalShare(storage,'staff-a','55',[row]);let reads=0;
 const verify=(actor='staff-a',conversationId='55')=>verifyTerminalShare({storage,actor,conversationId,isCurrent:()=>true,readProduct:async id=>{reads++;assert.equal(id,row.id);return envelope();}});
 assert.equal(await verify(),1);assert.equal(await verify(),1);assert.equal(reads,2);
 assert.equal(await verify('staff-b'),0);assert.equal(await verify('staff-a','56'),0);
 clearTerminalShare(storage,'staff-a','55');assert.equal(await verify(),0);
});
test('ERP unavailable, changed price revision, quarantine and context switch fail before any send callback',async()=>{
 for(const mode of ['offline','revision','hold','context']){
  const storage=store();rememberTerminalShare(storage,'staff-a','55',[row]);let current=true;
  await assert.rejects(()=>verifyTerminalShare({storage,actor:'staff-a',conversationId:'55',isCurrent:()=>current,readProduct:async()=>{if(mode==='offline')throw Error('unavailable');const result=envelope();if(mode==='revision')result.data.revision='b'.repeat(64);if(mode==='hold')result.data.hold.blocked=true;if(mode==='context')current=false;return result;}}),/Güncel fiyat doğrulanamadı/);
 }
});
test('unreliable storage blocks adding price content instead of allowing an unverified refresh',()=>{
 const storage=store();storage.setItem=()=>{throw Error('full');};assert.throws(()=>rememberTerminalShare(storage,'staff-a','55',[row]),/Güncel fiyat doğrulanamadı/);
});
