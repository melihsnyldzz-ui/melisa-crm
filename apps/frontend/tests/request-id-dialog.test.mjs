import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
async function fixture(cryptoApi,run){
 mkdirSync(frontend+'.sites-runtime/',{recursive:true});
 const directory=mkdtempSync(frontend+'.sites-runtime/uuid-dialog-'),file=directory+'/dialog.mjs',before={crypto:Object.getOwnPropertyDescriptor(globalThis,'crypto'),window:globalThis.window,hooks:globalThis.__uuidHooks,harness:globalThis.__uuidHarness};
 const values=[],data=new Map();let cursor=0;
 globalThis.window={sessionStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:cryptoApi});
 globalThis.__uuidHooks={useRef(initial){const index=cursor++;if(!(index in values))values[index]={current:initial};return values[index];},useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useEffect(){}};
 const harness=globalThis.__uuidHarness={api:{erpLogin:async()=>{throw Error('Unexpected login');},erpV2DraftDetail:async()=>{throw Error('Unexpected read');},erpV2Draft:async()=>{throw Error('Unexpected write');},erpV2Customers:async()=>({phone:'',entries:[],status:'missing'})}};
 try{
  await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/ERPOrderDialog.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],plugins:[{name:'uuid-dialog-hooks',setup(build){build.onLoad({filter:/ERPOrderDialog\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace("import {useEffect,useRef,useState} from 'react';","const {useEffect,useRef,useState}=globalThis.__uuidHooks;").replace(' const current=()=>',' globalThis.__uuidHarness.actions={requestId,setReceipt,setActor,store,login,save};\n const current=()=>')}));build.onLoad({filter:/liveApi\.js$/},args=>({loader:'js',contents:readFileSync(args.path,'utf8')+'\nfor(const name of Object.keys(globalThis.__uuidHarness.api))liveApi[name]=(...args)=>globalThis.__uuidHarness.api[name](...args);'}));}}]});
  const Dialog=(await import(pathToFileURL(file).href)).default;
  const render=(extra={})=>{cursor=0;return Dialog({token:'synthetic',actorKey:'id:uuid-test',conversation:{id:'55',name:'Synthetic'},items:[],isCurrent:()=>true,onClose(){},onSaved(){},...extra});};
  await run({render,harness,data});
 }finally{if(before.crypto)Object.defineProperty(globalThis,'crypto',before.crypto);else delete globalThis.crypto;globalThis.window=before.window;globalThis.__uuidHooks=before.hooks;globalThis.__uuidHarness=before.harness;rmSync(file,{force:true});rmSync(directory,{recursive:true});}
}
test('HTTP LAN UUID: actual ERP dialog first render and new intent use getRandomValues without randomUUID',async()=>{
 let entropy=0;await fixture({getRandomValues:bytes=>{bytes.fill(++entropy);return bytes;}},async h=>{
  assert.match(renderToStaticMarkup(h.render()),/ERP kullanıcı adı/);const first=h.harness.actions.requestId.current;assert.match(first,uuid);
  h.render();assert.equal(h.harness.actions.requestId.current,first);assert.equal(entropy,1);
  h.harness.actions.setActor('7');h.harness.actions.setReceipt({documentNo:'Synthetic',request:{documentCurrency:'TRY'},grandTotalExact4:'0.0000',items:[]});h.render();
  let cleared=0;h.harness.actions.store.current.newIntent=()=>{cleared++;};
  find(h.render(),node=>node.type==='button'&&node.props.children==='Yeni sipariş taslağı').props.onClick();
  await Promise.resolve();await Promise.resolve();assert.equal(cleared,1);assert.match(h.harness.actions.requestId.current,uuid);assert.notEqual(h.harness.actions.requestId.current,first);
 });
});
test('HTTP LAN UUID: missing secure randomness is visible in ERP dialog and cannot clear an existing receipt on new intent',async()=>{
 await fixture({},async h=>{const html=renderToStaticMarkup(h.render());assert.match(html,/güvenli rastgele kimlik/);});
 let available=true;await fixture({getRandomValues:bytes=>{if(!available)throw Error('Synthetic unavailable');bytes.fill(3);return bytes;}},async h=>{
  h.render();const first=h.harness.actions.requestId.current;h.harness.actions.setActor('7');h.harness.actions.setReceipt({documentNo:'Synthetic',request:{documentCurrency:'TRY'},grandTotalExact4:'0.0000',items:[]});h.render();let cleared=0;h.harness.actions.store.current.newIntent=()=>{cleared++;};available=false;
  find(h.render(),node=>node.type==='button'&&node.props.children==='Yeni sipariş taslağı').props.onClick();await Promise.resolve();await Promise.resolve();
  assert.equal(cleared,0);assert.equal(h.harness.actions.requestId.current,first);assert.match(renderToStaticMarkup(h.render()),/güvenli rastgele kimlik/);
 });
});
test('HTTP LAN UUID: pending ERP intent retries its saved ID without any random API and stays one mock write',async()=>fixture({},async h=>{
 const requestId='00000000-0000-4000-8000-000000000001';
 const line={productId:1,stockCode:'SYNTHETIC',quantity:2,priceId:1,unitSourceId:1,tier:1,currency:'TRY',priceExact8:'1.00000000',priceSourceKey:'synthetic'};
 const payload={requestId,conversationId:'55',peer:'9050000000000',customerId:1,customerMatch:{basis:'exact-phone',phone:'9050000000000',revision:'a'.repeat(64),reason:null},documentCurrency:'TRY',exchangeRateExact8:'1.00000000',items:[line]};
 const key='melisa-crm-native-order-v2:id%3Auuid-test:55';h.data.set(key,JSON.stringify({version:2,nativeActorId:'7',resolved:false,payload}));
 let writes=0;const reads=[];h.harness.api.erpLogin=async()=>({user:{id:7},accessToken:'synthetic'});
 h.harness.api.erpV2DraftDetail=async(_token,_erp,id)=>{reads.push(id);if(!writes)throw Object.assign(Error('Synthetic missing'),{status:404});return {request:payload,status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,items:[{...line,unitPriceExact4:'1.0000',lineTotalExact4:'2.0000'}],grandTotalExact4:'2.0000',amountTryExact4:'2.0000'};};
 h.harness.api.erpV2Draft=async(_token,_erp,body)=>{writes++;assert.deepEqual(body,payload);};
 assert.match(renderToStaticMarkup(h.render()),/Önceki taslak korunuyor/);assert.equal(h.harness.actions.requestId.current,requestId);
 await h.harness.actions.login();h.render();await h.harness.actions.save();h.render();
 assert.equal(writes,1);assert(reads.length>=2);assert(reads.every(id=>id===requestId));assert.equal(JSON.parse(h.data.get(key)).payload.requestId,requestId);assert.equal(JSON.parse(h.data.get(key)).resolved,true);
 await h.harness.actions.save();assert.equal(writes,1);
}));
test('saved draft new intent returns to fresh catalog instead of resubmitting recovery-only price rows',async()=>fixture({getRandomValues:bytes=>{bytes.fill(4);return bytes;}},async h=>{
 let catalogOpens=0,cleared=0;
 const props={recoveryOnly:true,onNewDraft(){catalogOpens++;},items:[{productId:1,stockCode:'SYNTHETIC',priceExact8:'1.00000000'}]};
 h.render(props);h.harness.actions.setActor('7');h.harness.actions.setReceipt({documentNo:'Synthetic',request:{documentCurrency:'TRY'},grandTotalExact4:'0.0000',items:[]});
 h.harness.actions.store.current.newIntent=()=>{cleared++;};
 h.harness.api.erpV2Customers=async()=>{throw Error('Recovery rows must not be reused as a new catalog selection');};
 find(h.render(props),node=>node.type==='button'&&node.props.children==='Yeni sipariş taslağı').props.onClick();
 await Promise.resolve();await Promise.resolve();
 assert.equal(cleared,1);assert.equal(catalogOpens,1);assert.doesNotMatch(renderToStaticMarkup(h.render(props)),/Recovery rows/);
}));
