import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import React from 'react';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const actor=()=>({accountIdentity:{id:42},role:'mudur',canSend:true,paidAiEnabled:true,chatwootAgentId:7,liveSendEnabled:false});
const conversation=id=>({id,phone:'+905387217733',channel:'whatsapp',assignedUserId:7,owner:'Synthetic staff',name:'Synthetic customer '+id,messages:[],preview:'Hello',languageCode:'en',unread:0});
const blankPolicy=()=>({version:'synthetic-v1',minimumOrderMode:'unconfigured',minimumOrder:null,telegramUrl:null,countryRules:[],shippingTerms:'',salesNotes:''});
const policy=()=>({policy:blankPolicy(),revision:'a'.repeat(64),configured:true,writable:false});
const reply=()=>({mode:'copilot',autoSend:false,erpWrite:false,requiresHumanReview:true,conversationId:'55',conversationRevision:'b'.repeat(64),action:'reply',reply:'Draft for staff review.',summaryTr:'Personel için Türkçe özet.',generatedAt:new Date().toISOString(),policyFacts:{...blankPolicy(),revision:'a'.repeat(64),requiresStaffConfirmation:true,countrySelection:'unverified',shippingConfirmation:'staff',discountAllowed:false,breakSeries:false,autoSend:false,writeErp:false}});
const line=quantity=>({productId:8023,stockCode:'SYN-8023',quantity,currency:'TRY',priceExact8:'3.00000000'});
const saved=(customerId=8,quantity=3,id='55')=>({documentNo:'SYN-DRAFT-1',grandTotalExact4:'9.0000',items:[line(quantity)],request:{requestId:'00000000-0000-4000-8000-000000000001',conversationId:id,customerId,documentCurrency:'TRY',items:[line(quantity)]}});
const deferred=()=>{let resolve;const promise=new Promise(accept=>{resolve=accept;});return {promise,resolve};};
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const result=find(child,predicate);if(result)return result;}return null;}

// Compile the real App and retain its hook cells across render calls. Only hooks
// and external API boundaries are replaced; the singleton flow and actual ERP
// onSaved/onClose handlers run unchanged. No browser, provider or TEST service.
async function fixture(run){
 const directory=frontend+'.sites-runtime/';mkdirSync(directory,{recursive:true});const file=directory+'sales-erp-context-'+randomUUID()+'.mjs';
 const previous={window:globalThis.window,document:globalThis.document,hooks:globalThis.__salesErpHooks,harness:globalThis.__salesErpHarness};
 const values=[],effects=[],storage=new Map();let cursor=0;
 globalThis.window={location:{pathname:'/',search:''},crypto:{randomUUID},sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),dispatchEvent(){},requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},addEventListener(){},removeEventListener(){}};
 globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 globalThis.__salesErpHooks={useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],update=>{values[i]=typeof update==='function'?update(values[i]):update;}];},useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const calls={sales:[],send:0,erpWrite:0};
 const forbiddenErpWrite=async()=>{calls.erpWrite++;throw Error('ERP write forbidden in fixture');};
 const harness=globalThis.__salesErpHarness={actions:null,api:{rememberedNormalSession:async()=>({enabled:false,user:null}),hasNativeNormalSession:()=>false,clearNormalSession:async()=>{},erpDrafts:async()=>({orders:[]}),catalogSignOut:async()=>({}),salesRules:async()=>policy(),salesDraft:async(...args)=>{calls.sales.push(args);return {...reply(),conversationId:String(args[1])};},send:async()=>{calls.send++;throw Error('Message send forbidden in fixture');},erpDraft:forbiddenErpWrite,erpV2Draft:forbiddenErpWrite}};
 try{
  await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/App.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_CRM_TEST':'"1"','import.meta.env.VITE_CRM_ISOLATED_PREPARATION':'"0"'},external:['react','@phosphor-icons/react'],loader:{'.css':'empty'},plugins:[{name:'actual-sales-erp-app-lifecycle',setup(builder){
   builder.onLoad({filter:/App\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace(/^import \{ useCallback, useEffect, useMemo, useRef, useState \} from "react";/,'const {useCallback,useEffect,useMemo,useRef,useState}=globalThis.__salesErpHooks;').replace('  if(liveMode&&!liveSession&&!semihEntry.checked)','  globalThis.__salesErpHarness.actions={commitLiveSession,selectConversation,setDraft,setErpOrderContext,setModal,takeSalesDraft,getFlow:()=>salesDraftFlowRef.current};\n  if(liveMode&&!liveSession&&!semihEntry.checked)')}));
   builder.onLoad({filter:/liveApi\.js$/},args=>({loader:'js',contents:readFileSync(args.path,'utf8')+'\nfor(const name of Object.keys(globalThis.__salesErpHarness.api))liveApi[name]=(...args)=>globalThis.__salesErpHarness.api[name](...args);'}));
  }}]});
  const {App}=await import(pathToFileURL(file).href);
  const render=()=>{cursor=0;effects.length=0;const tree=App();for(const fn of effects.filter(fn=>String(fn).includes('salesDraftFlowRef.current.synchronize')))fn();return tree;};
  render();const startup=effects.find(fn=>String(fn).includes('liveApi.rememberedNormalSession'));const stop=startup();for(let i=0;i<12;i++)await Promise.resolve();render();
  const rows=[conversation('55'),conversation('56')];harness.actions.commitLiveSession({key:'synthetic-access',session:actor(),inbox:{conversations:rows,summary:{total:2}},agents:{agents:[]}});render();
  const open=(id='55',extra={})=>{harness.actions.setErpOrderContext({recipientId:id,items:[line(1)],current:()=>true,...extra});harness.actions.setModal('erp-order');return render();};
  const save=(order=saved())=>{const tree=open(String(order.request.conversationId));const dialog=find(tree,node=>typeof node.props?.onSaved==='function'&&Array.isArray(node.props.items));assert(dialog);dialog.props.onSaved(order);const next=render();find(next,node=>typeof node.props?.onSaved==='function').props.onClose();return render();};
  const composer=()=>find(render(),node=>node.type==='textarea'&&node.props['aria-label']==='Mesajınız').props.value;
  try{await run({harness,calls,render,open,save,composer,select:id=>{harness.actions.selectConversation(rows.find(row=>row.id===id));return render();},flow:()=>harness.actions.getFlow()});assert.equal(calls.send,0);assert.equal(calls.erpWrite,0);}finally{stop?.();harness.actions.getFlow()?.close();}
 }finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.__salesErpHooks=previous.hooks;globalThis.__salesErpHarness=previous.harness;rmSync(file,{force:true});}
}

test('actual first-mounted flow uses the separately saved ERP customer and quantities after rerender',async()=>fixture(async h=>{
 h.save(saved(8,3));assert.equal(await h.flow().start(),true);
 assert.deepEqual(h.calls.sales[0][2].draftContext,{requestId:saved().request.requestId,customerId:8,items:[{erpProductId:8023,stockCode:'SYN-8023',quantity:3}]});
}));

test('actual first-mounted flow receives only the current selected conversation open ERP items',async()=>fixture(async h=>{
 h.open('55',{items:[line(4)]});assert.equal(await h.flow().start(),true);
 assert.deepEqual(h.calls.sales[0][2].draftContext,{items:[{erpProductId:8023,stockCode:'SYN-8023',quantity:4}]});
}));

for(const [name,extra] of [['stale operation',{recipientId:'55',current:()=>false}],['another recipient',{recipientId:'56',current:()=>true}]])test('actual App ignores '+name+' ERP form context in favour of its selected saved record',async()=>fixture(async h=>{
 h.save(saved(8,3));h.open('55',{...extra,items:[line(99)]});assert.equal(await h.flow().start(),true);
 assert.equal(h.calls.sales[0][2].draftContext?.customerId,8);assert.equal(h.calls.sales[0][2].draftContext?.items[0].quantity,3);
}));

test('saved ERP customer changes cancel pending generation without overwriting the staff composer',async()=>fixture(async h=>{
 h.save(saved(8));h.harness.actions.setDraft('Personelin mevcut mesajı');h.render();const waiting=deferred();h.harness.api.salesDraft=(...args)=>{h.calls.sales.push(args);return waiting.promise;};
 const pending=h.flow().start();h.save(saved(9));waiting.resolve(reply());assert.equal(await pending,false);assert.equal(h.flow().isPreviewCurrent(),false);assert.equal(h.composer(),'Personelin mevcut mesajı');
}));

test('saved ERP quantity changes invalidate an already generated proposal',async()=>fixture(async h=>{
 h.save(saved(8,3));assert.equal(await h.flow().start(),true);assert.equal(h.flow().isPreviewCurrent(),true);
 h.save(saved(8,5));assert.equal(h.flow().isPreviewCurrent(),false);
}));

test('ERP changes during policy readback cannot append the old reply to the actual staff composer',async()=>fixture(async h=>{
 h.save(saved(8));h.harness.actions.setDraft('Personelin korunan metni');h.render();assert.equal(await h.flow().start(),true);
 const waiting=deferred();h.harness.api.salesRules=()=>waiting.promise;const taking=h.harness.actions.takeSalesDraft();h.save(saved(9));waiting.resolve(policy());await taking;
 assert.equal(h.composer(),'Personelin korunan metni');
}));

test('conversation changes choose each selected customer saved ERP context without cross-customer reuse',async()=>fixture(async h=>{
 h.save(saved(8,3,'55'));h.select('56');h.save(saved(9,5,'56'));assert.equal(await h.flow().start(),true);
 assert.equal(h.calls.sales[0][1],'56');assert.equal(h.calls.sales[0][2].draftContext?.customerId,9);
 h.select('55');assert.equal(await h.flow().start(),true);assert.equal(h.calls.sales[1][1],'55');assert.equal(h.calls.sales[1][2].draftContext?.customerId,8);
}));
