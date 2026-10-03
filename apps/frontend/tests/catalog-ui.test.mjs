import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {catalogAccessError} from '../src/catalog/session.js';
import {CATALOG_CRM_ONLY_ENABLED} from '../src/releaseCapabilities.js';

test('actual ERP connection panel exposes a clean corrective form only for recoverable auth states',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/catalog-ui-test.mjs';
 try {
  buildSync({entryPoints:['src/catalog/CatalogWorkspace.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
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
   assert.doesNotMatch(html,/<form|type="password"|name="username"|ERP’ye bağlan|ERP bağlantısını kapat/);assert.match(html,/Ek ERP girişi gerekmez/);assert.match(html,/HTTP 500/);assert.match(html,/WHATSAPP_CRM_INTERNAL_ERROR/);
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
 assert.equal((builder.match(/await beforeOutput\(\)/g)||[]).length,2);assert.match(builder,/await onAttach\(file,customer\.id,isCurrent\)/);assert.doesNotMatch(workspace+builder,/liveApi\.send|\.sendMessage\(/);
 assert.match(app,/CATALOG_ENABLED && modal === "catalog-builder" && selected.id && liveSession && catalogContextCurrent\(\)/);assert.match(app,/onCrmExpired=\{\(\)=>closeLiveSession/);
});
