import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizeAccountIdentity,isMobilePreviewPath} from '../src/accountIdentity.js';
import {normalizePermissions} from '../src/liveApi.js';
import worker from '../worker/index.js';

test('account identity only allows /auth/me id, username and raw reported role',()=>{
 const raw={id:42,username:'crm-user',role:'Owner',name:'Other name',token:'private',accessToken:'secret',password:'hidden',chatwootId:8};
 const session=normalizePermissions(raw);
 assert.deepEqual(session.accountIdentity,{id:'42',username:'crm-user',role:'Owner'});
 assert.equal(session.role,'patron');
 assert.deepEqual(normalizeAccountIdentity({id:{id:3},username:[],role:null,name:'Patron'}),{id:null,username:null,role:null});
 assert.deepEqual(normalizeAccountIdentity(),{id:null,username:null,role:null});
});
test('account info SSR cannot leak session fields or invent a Patron identity',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/account-info-test.mjs';
 try{
  buildSync({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/AccountInfo.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react']});
  const {default:AccountInfo}=await import(pathToFileURL(`${process.cwd()}/${file}`).href);
  const html=renderToStaticMarkup(React.createElement(AccountInfo,{identity:{id:'42',username:'review',role:'mudur',accessToken:'DO_NOT_RENDER',password:'ALSO_PRIVATE'}}));
  assert.match(html,/42/);assert.match(html,/review/);assert.match(html,/mudur/);assert.doesNotMatch(html,/DO_NOT_RENDER|ALSO_PRIVATE|Patron/);
  const empty=renderToStaticMarkup(React.createElement(AccountInfo,{identity:undefined}));assert.match(empty,/Sunucu bildirmedi/);assert.doesNotMatch(empty,/Patron/);
 }finally{rmSync(file,{force:true});}
});
test('mobile-preview selects layout only and still uses the real application login gate',async()=>{
 for(const path of ['/mobile-preview','/mobile-preview/','/crm/mobile-preview','/crm/mobile-preview/'])assert(isMobilePreviewPath(path));
 for(const path of ['/mobile-preview-other','/crm/mobile-preview-other','/crm-evil/mobile-preview','/crm/mobile-preview//','/'])assert(!isMobilePreviewPath(path));
 const source=readFileSync('src/App.jsx','utf8');assert.match(source,/import\.meta\.env\.DEV && new URLSearchParams/);assert.match(source,/if \(liveMode && !liveSession\) return <LoginGate/);
 const routes=[];const res=await worker.fetch(new Request('https://test.example/mobile-preview',{headers:{accept:'text/html'}}),{ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;routes.push(path);return new Response(path==='/'?'app':'missing',{status:path==='/'?200:404});}}});
 assert.equal(res.status,200);assert.deepEqual(routes,['/mobile-preview','/']);
});
test('production first render with or without a remembered CRM token exposes only the login gate',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/anonymous-app-test.mjs';const previousWindow=globalThis.window;
 try{
  buildSync({absWorkingDir:process.cwd(),tsconfigRaw:{},entryPoints:[process.cwd()+'/src/App.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',define:{'import.meta.env.DEV':'false'},external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
  const {App}=await import(pathToFileURL(`${process.cwd()}/${file}`).href);
  for(const remembered of ['', 'synthetic-remembered-token']){
   globalThis.window={location:{pathname:'/mobile-preview',search:'?demo=1'},matchMedia:()=>({matches:true}),sessionStorage:{getItem:key=>key==='melisa-crm-access-token'?remembered:null},localStorage:{getItem:()=>null}};
   const html=renderToStaticMarkup(React.createElement(App));
   assert.match(html,/aria-label="Melisa CRM güvenli giriş"/);
   if (remembered) assert.match(html,/Kaydedilen CRM oturumunuzla bağlantı kuruluyor/);
   else { assert.match(html,/type="password"/); assert.match(html,/Kullanıcı adı/); }
   assert.doesNotMatch(html,/Lina Chahine|Mohamed Khaled|lina\.chahine|Sorumlu bekliyor|Davet bağlantısını hazırla|synthetic-remembered-token/);
  }
 }finally{globalThis.window=previousWindow;rmSync(file,{force:true});}
});
test('same-origin Worker preserves anonymous and unauthorized denials without replacing them with application HTML',async()=>{
 for(const status of [401,403]){
  let received;
  const response=await worker.fetch(new Request('https://design.example/api/live/crm/inbox'),{CRM_API_BASE_URL:'https://gateway.example',CRM_API_FETCH:async request=>{received=request;return Response.json({error:{code:'TEST_AUTH_REQUIRED'}},{status});},ASSETS:{fetch:()=>{throw new Error('API denial must not render the app');}}});
  assert.equal(response.status,status);assert.equal(received.headers.get('authorization'),null);assert.equal(response.headers.get('cache-control'),'no-store');
 }
});

test('account identity sources are tagged so user ID cannot collide with a different username', async () => {
 const {accountIdentityKey}=await import('../src/accountIdentity.js');assert.equal(accountIdentityKey({id:42,username:'owner'}),'id:42');assert.equal(accountIdentityKey({username:'42'}),'username:42');assert.notEqual(accountIdentityKey({id:42}),accountIdentityKey({username:'42'}));assert.equal(accountIdentityKey({}),'');
});
