import test from 'node:test';
import assert from 'node:assert/strict';
import {liveApi,normalizeInboxPayload,effectiveInboxSummary,mergeInboxConversations,reconcileBootstrapConversations} from '../src/liveApi.js';

const payload=()=>({conversations:[{id:'55',name:'Synthetic customer',messagesLoaded:false,detailLoaded:false,preview:'Son mesaj yükleniyor…'}],summary:{complete:false,total:null,open:null,unread:null,pendingHumanReply:null},pagination:{bootstrap:true,offset:0,nextOffset:0,hasNext:true}});
test('bootstrap null totals, explicit unloaded history and pagination survive normalization',()=>{
 const result=normalizeInboxPayload(payload());assert.equal(result.summary.total,null);assert.equal(result.summary.unread,null);assert.equal(result.summary.unassigned,null);assert.equal(result.summary.complete,false);assert.equal(result.pagination.nextOffset,0);assert.equal(result.conversations[0].messagesLoaded,false);
 assert.deepEqual(effectiveInboxSummary(result.summary,result.conversations),result.summary);
 const empty=normalizeInboxPayload({conversations:[],summary:{complete:true,total:0,unread:0}});assert.equal(empty.summary.total,0);assert.equal(empty.summary.complete,true);
});
test('full paginated inbox replaces the page unassigned count with the accessible DTO count',()=>{
 const rows=Array.from({length:767},(_,index)=>({id:String(index+1),name:'Synthetic customer',assignedUserName:index<57||(index>=100&&index<150)?'Synthetic agent':'',unread:0}));
 const firstPage=normalizeInboxPayload({conversations:rows.slice(0,100),summary:{complete:true,total:767}});
 assert.equal(firstPage.summary.unassigned,43);
 const all=normalizeInboxPayload({conversations:rows,summary:firstPage.summary}).conversations;
 const summary=effectiveInboxSummary(firstPage.summary,all);
 assert.equal(summary.total,767);assert.equal(summary.unassigned,660);assert.equal(firstPage.summary.unassigned,43);
 assert.equal(effectiveInboxSummary({complete:true,total:0,unassigned:43},[]).unassigned,0);
});
test('partial inbox scope preserves page counts and unknown bootstrap totals',()=>{
 const rows=Array.from({length:100},(_,index)=>({id:String(index+1),name:'Synthetic customer',assignedUserName:index<57?'Synthetic agent':''}));
 const firstPage=normalizeInboxPayload({conversations:rows,summary:{complete:true,total:767}});
 assert.equal(effectiveInboxSummary(firstPage.summary,firstPage.conversations).unassigned,43);
 const bootstrap=normalizeInboxPayload({conversations:rows,summary:{complete:false,total:null,unassigned:null}});
 assert.deepEqual(effectiveInboxSummary(bootstrap.summary,bootstrap.conversations),bootstrap.summary);
 assert.equal(effectiveInboxSummary({unassigned:null},firstPage.conversations).unassigned,null);
});
test('a lightweight refresh preserves selected loaded detail and workflow, including a verified empty history',()=>{
 for(const messages of [[],[{id:'m1',text:'Synthetic text'}]]){
  const current={id:'55',messages,messagesLoaded:true,detailLoaded:true,workflow:[{id:'synthetic-workflow'}]};
  const result=mergeInboxConversations([current],normalizeInboxPayload(payload()).conversations,'55')[0];
  assert.equal(result.messagesLoaded,true);assert.equal(result.detailLoaded,true);assert.deepEqual(result.messages,messages);assert.deepEqual(result.workflow,current.workflow);
 }
});
test('completed traversal reconciles stale bootstrap membership without deleting unrelated newer rows',()=>{
 const rows=[{id:'old'},{id:'kept'},{id:'new'}],bootstrap=new Set(['old','kept']),seen=new Set(['kept']);
 assert.deepEqual(reconcileBootstrapConversations(rows,bootstrap,seen,2),[{id:'kept'},{id:'new'}]);
 assert.deepEqual(reconcileBootstrapConversations(rows,bootstrap,new Set(),0),[]);
});
test('bootstrap query is exact and a cancelled selected-detail caller cannot commit a late transport',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:payload()});};
 try{const controller=new AbortController();const result=await liveApi.inbox('synthetic-bootstrap',0,{view:'bootstrap',signal:controller.signal});assert.match(calls[0].url,/^\/api\/live\/crm\/inbox\?limit=100&offset=0&view=bootstrap$/);assert.equal(result.summary.total,null);assert.equal(calls[0].options.view,undefined);await assert.rejects(liveApi.inbox('synthetic',0,{view:'unsupported'}));
  let finish;globalThis.fetch=()=>new Promise(r=>{finish=r;});const pending=liveApi.conversation('synthetic-bootstrap','55',{signal:controller.signal});const rejected=assert.rejects(pending,{name:'AbortError'});controller.abort();finish(Response.json({success:true,data:{id:'55',messages:[]}}));await rejected;
 }finally{globalThis.fetch=original;}
});
