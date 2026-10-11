import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {catalogAccessError} from '../src/catalog/session.js';
import {CATALOG_CRM_ONLY_ENABLED} from '../src/releaseCapabilities.js';

test('actual ERP connection panel exposes a clean corrective form only for recoverable auth states',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/catalog-ui-test.mjs';
 try {
  await build({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/catalog/CatalogWorkspace.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
  const {CatalogConnectionPanel}=await import(pathToFileURL(`${process.cwd()}/${file}`).href);
  const render=source=>renderToStaticMarkup(React.createElement(CatalogConnectionPanel,{customer:{name:'Synthetic customer'},source,onClose(){},onRead(){},onSignIn(){},onDisconnect(){}}));
  for (const code of ['USER_ERP_SESSION_REQUIRED','CATALOG_SESSION_REVOKED','ERP_LOGIN_REJECTED']) {
   const html=render(catalogAccessError({status:401,code}));assert.match(html,/ERP kullanıcı adı/);assert.match(html,/ERP şifresi/);assert.match(html,/type="password"/);assert.match(html,/ERP’ye bağlan/);assert.doesNotMatch(html,/value="[^"]+"/);
  }
  for (const state of ['loading','signing-in','disconnecting','blocked','error','uncertain']) {
   const html=render({state,message:'Synthetic status'});assert.doesNotMatch(html,/<form|type="password"/);assert.match(html,/Konuşmaya dön/);assert.match(html,/fiyatlı PDF şu anda kapalıdır/);
   if (['loading','signing-in','disconnecting'].includes(state))assert.match(html,/aria-busy="true"/);
   if (state==='uncertain')assert.match(html,/ERP bağlantısını kapat/);
  }
  for (const state of ['idle','loading','credentials','disconnected','blocked','error','uncertain']) {
   const html=renderToStaticMarkup(React.createElement(CatalogConnectionPanel,{customer:{name:'Synthetic customer'},source:{state,message:'Synthetic status',diagnostic:{status:500,code:'WHATSAPP_CRM_INTERNAL_ERROR'}},authMode:'crm',onClose(){},onRead(){},onSignIn(){throw new Error('Must not call ERP auth');},onDisconnect(){throw new Error('Must not call ERP auth');}}));
   assert.doesNotMatch(html,/<form|type="password"|name="username"|ERP’ye bağlan|ERP bağlantısını kapat/);assert.match(html,/Ek ERP girişi gerekmez/);assert.doesNotMatch(html,/HTTP 500|WHATSAPP_CRM_INTERNAL_ERROR/);
  }
 } finally {rmSync(file,{force:true});}
});

test('approved CRM-only release is enabled and explicit CRM logout retains server invalidation while the panel has no ERP auth controls',()=>{
 assert.equal(CATALOG_CRM_ONLY_ENABLED,true);
 const app=readFileSync('src/App.jsx','utf8'),workspace=readFileSync('src/catalog/CatalogWorkspace.jsx','utf8');
 assert.match(app,/explicitLogout: CATALOG_ENABLED && clearReceipts && Boolean\(closingKey\)/);assert.doesNotMatch(app,/explicitLogout:[^\n]*CATALOG_CRM_ONLY_ENABLED/);assert.match(app,/disconnect: \(\) => liveApi\.catalogSignOut\(closingKey\)/);assert.match(app,/authMode=\{CATALOG_CRM_ONLY_ENABLED\?"crm":"erp"\}/);assert.match(workspace,/onDisconnect=\{authMode==='erp'\?disconnect:undefined\}/);
});

test('catalog workspace owns navigation/session cleanup and output checks remain separate from send',()=>{
 const workspace=readFileSync('src/catalog/CatalogWorkspace.jsx','utf8'),builder=readFileSync('src/catalog/CatalogBuilder.jsx','utf8'),app=readFileSync('src/App.jsx','utf8');
 for(const event of ['popstate','pagehide','melisa-crm-session-cleared']) {assert(workspace.includes(`addEventListener('${event}',close)`));assert(workspace.includes(`removeEventListener('${event}',close)`));}
 assert.match(workspace,/event\.currentTarget\.reset\(\)/);assert.match(workspace,/type="password" autoComplete="off"/);assert.match(workspace,/beforeOutput=\{verifyOutput\}/);assert.match(workspace,/isContextCurrent=\{usable\}/);
 assert.equal((builder.match(/await beforeOutput\(\)/g)||[]).length,2);assert.match(builder,/await onAttach\(file,customer\.id,isCurrent,\{products:selectedProducts\.map\(p=>\(\{id:p\.id,revision:p\.revision\}\)\)\}\)/);assert.doesNotMatch(workspace+builder,/liveApi\.send|\.sendMessage\(/);
 assert.match(app,/CATALOG_ENABLED && modal === "catalog-builder" && selected.id && liveSession && catalogContextCurrent\(\)/);assert.match(app,/onCrmExpired=\{\(\)=>\{void renewExpiredNormalSession\(\);\}\}/);
 assert.match(app,/const renewExpiredNormalSession = \(\) => \{\s*return sessionLoaderRef\.current\.start\(\{resume:true,requireResume:true\}\)/);
});

test('catalog resets and default filter submission preserve server-side photo-only scope',()=>{
 const builder=readFileSync('src/catalog/CatalogBuilder.jsx','utf8');
 assert.doesNotMatch(builder,/hasImage:false/);
 assert.equal((builder.match(/hasImage:true/g)||[]).length,2);
 assert.match(builder,/onSubmit=[\s\S]*?hasImage:sourceStatus\.meta\.businessScope\?query\.hasImage!==false:true/);
 assert.match(builder,/onClick=[\s\S]*?const q=\{search:''[\s\S]*?hasImage:true\};setQuery\(q\);onPage\(q\);\}\}>Sıfırla/);
 assert.match(builder,/if\(paged\)\{const q=\{search:''[\s\S]*?hasImage:true\};setQuery\(q\);onPage\(q\)/);
 assert.match(builder,/Yalnız fotoğrafı olan ERP ürünleri gösterilir/);
});

test('previous unloaded selection remains removable individually without inventing a product or price',async()=>{
 const {catalogStorageKey,readPagedCatalog}=await import('../src/catalog/model.js');
 const storage={getItem:()=>JSON.stringify({draft:{selected:['erp-12','erp-30226']},saved:[]}),setItem(){}};
 const key=catalogStorageKey('synthetic','patron','55');
 assert.deepEqual(readPagedCatalog(storage,key,[]).draft.selected,['erp-12','erp-30226']);
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/catalog-previous-selection-test.mjs',previousWindow=globalThis.window;
 try{
  globalThis.window={sessionStorage:storage};
  await build({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/catalog/CatalogBuilder.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
  const Builder=(await import(pathToFileURL(`${process.cwd()}/${file}`).href)).default;
  const source={state:'ready',paged:true,query:{search:'',brand:'',category:'',barcode:'',hasImage:true},products:[],viewProducts:[],meta:{total:0,page:1,totalPages:1,facets:{brands:[],categories:[]}}};
  const html=renderToStaticMarkup(React.createElement(Builder,{customer:{id:'55',name:'Synthetic'},identity:'synthetic',role:'patron',products:[],sourceStatus:source,onPage(){},onClose(){},onAttach(){},onProductAction(){}}));
  assert.equal((html.match(/Önceki seçim [12] seçimden çıkar/g)||[]).length,2);assert.match(html,/Bu katalogda görünmüyor/);assert.match(html,/2 ürün/);assert.match(html,/disabled=""[^>]*>Ürünleri mesaj taslağına ekle/);assert.doesNotMatch(html,/erp-30226|erp-12|catalog-product-pick/);assert.deepEqual(readPagedCatalog(storage,key,[]).draft.selected,['erp-12','erp-30226']);
 }finally{globalThis.window=previousWindow;rmSync(file,{force:true});}
});

test('actual DB02 catalog renders explicit all-products choice with photo-only default; old catalog retains no choice',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/catalog-scope-test.mjs';
 try{await build({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/catalog/CatalogBuilder.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
  const {default:Builder}=await import(pathToFileURL(`${process.cwd()}/${file}`).href),scope={scopeKind:'VERIFIED_BUSINESS_TEST',database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',supportedCurrencies:['TRY','USD','EUR']};
  const render=businessScope=>renderToStaticMarkup(React.createElement(Builder,{customer:{id:'fixture',name:'Fixture'},identity:'fixture',role:'personel',products:[],sourceStatus:{state:'ready',paged:true,query:{page:1,limit:50,hasImage:true},viewProducts:[],meta:{total:0,totalPages:0,page:1,facets:{brands:[],categories:[]},...(businessScope?{businessScope}:{})}},onPage(){},onClose(){}}));
  const html=render(scope);assert.match(html,/aria-label="ERP ürün kapsamı"/);assert.match(html,/<option value="photos" selected="">Fotoğraflı ürünler/);assert.match(html,/Tüm ürünler/);assert.doesNotMatch(render(),/ERP ürün kapsamı|Tüm ürünler/);
 }finally{rmSync(file,{force:true});}
});

test('actual all-source filter submit preserves selected mode through search and explicit reset returns photo-only',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/catalog-submit-test.mjs';
 const scope={scopeKind:'VERIFIED_BUSINESS_TEST',database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',supportedCurrencies:['TRY','USD','EUR']};let cursor=0;const states=[];
 const original=globalThis.__catalogHooks;globalThis.__catalogHooks={useEffect(){},useMemo:fn=>fn(),useRef:value=>({current:value}),useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];}};
 const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
 try{await build({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/catalog/CatalogBuilder.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'},plugins:[{name:'catalog-submit-harness',setup(b){b.onLoad({filter:/CatalogBuilder\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace("import { useEffect, useMemo, useRef, useState } from 'react';",'const {useEffect,useMemo,useRef,useState}=globalThis.__catalogHooks;')}));}}]});
  const {default:Builder}=await import(pathToFileURL(`${process.cwd()}/${file}`).href),calls=[],props={customer:{id:'fixture',name:'Fixture'},identity:'fixture',role:'personel',products:[],sourceStatus:{state:'ready',paged:true,query:{search:'',brand:'',category:'',barcode:'',page:1,limit:50,hasImage:false},viewProducts:[],meta:{businessScope:scope,total:0,totalPages:0,page:1,facets:{brands:[],categories:[]}}},onPage:q=>calls.push(q),onClose(){}};
  const render=()=>{cursor=0;return nodes(Builder(props));};let tree=render();tree.find(n=>n.type==='input'&&n.props['aria-label']==='Ürün adı veya stok kodu ara').props.onChange({target:{value:'EUR product'}});tree=render();tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(calls[0].hasImage,false);assert.equal(calls[0].search,'EUR product');
  tree.find(n=>n.type==='button'&&n.props.children==='Sıfırla').props.onClick();assert.equal(calls[1].hasImage,true);assert.equal(calls[1].search,'');tree=render();tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(calls[2].hasImage,true);
 }finally{globalThis.__catalogHooks=original;rmSync(file,{force:true});}
});
