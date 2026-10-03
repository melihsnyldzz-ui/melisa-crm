import test from 'node:test';
import assert from 'node:assert/strict';
import {liveApi} from '../src/liveApi.js';
const credentials={username:' synthetic-erp-user ',password:'synthetic-test-only'};
const success=()=>({success:true,data:{connected:true,expiresAt:new Date(Date.now()+60000).toISOString(),permissions:['product.view']}});

test('catalog login uses exact same-origin POST and returns only a bounded expiry field',async()=>{
 const previous=globalThis.fetch,calls=[],payload=success();
 try {
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({...payload,data:{...payload.data,token:'DO_NOT_RETURN',password:'DO_NOT_RETURN',username:'DO_NOT_RETURN',source:'DO_NOT_RETURN'}});};
  const result=await liveApi.catalogSignIn('synthetic-crm',credentials);
  assert.deepEqual(result,{expiresAt:Date.parse(payload.data.expiresAt)});assert.equal(calls.length,1);const {url,options}=calls[0];
  assert.equal(url,'/api/live/crm/catalog/auth/sign-in');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer synthetic-crm');assert.equal(options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(options.body),{username:'synthetic-erp-user',password:'synthetic-test-only'});assert(!url.includes('synthetic'));assert(!Object.hasOwn(options,'preserveEnvelope'));
 } finally {globalThis.fetch=previous;}
});

test('catalog login refuses absent CRM session or incomplete credentials before transport',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try {globalThis.fetch=async()=>{calls++;return Response.json(success());};await assert.rejects(()=>liveApi.catalogSignIn('',credentials),{status:401});for(const value of [{username:' ',password:'x'},{username:'x',password:''},{username:null,password:'x'},{username:'x',password:42}])await assert.rejects(()=>liveApi.catalogSignIn('synthetic',value));assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});

test('catalog login fails closed for incomplete, expired or unauthorized success envelopes',async()=>{
 const previous=globalThis.fetch;let payload;
 try {globalThis.fetch=async()=>Response.json(payload);for(const value of [{},{success:true,data:{}},{success:true,data:{...success().data,connected:false}},{success:true,data:{...success().data,expiresAt:'invalid'}},{success:true,data:{...success().data,expiresAt:'2000-01-01T00:00:00Z'}},{success:true,data:{...success().data,permissions:[]}},{success:true,data:{...success().data,permissions:'product.view'}}]){payload=value;await assert.rejects(()=>liveApi.catalogSignIn('synthetic-invalid',credentials),{code:'CATALOG_AUTH_RESPONSE_INVALID'});}}finally{globalThis.fetch=previous;}
});

test('catalog login preserves exact gateway denial and does not retry',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try {globalThis.fetch=async()=>{calls++;return Response.json({success:false,error:{code:'ERP_LOGIN_REJECTED',message:'Synthetic rejection'}},{status:401});};await assert.rejects(()=>liveApi.catalogSignIn('synthetic-denial',credentials),{status:401,code:'ERP_LOGIN_REJECTED'});assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});

test('catalog login preserves exact 409 SESSION_CONTEXT_CHANGED and never repeats the POST',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try {globalThis.fetch=async()=>{calls++;return Response.json({success:false,error:{code:'SESSION_CONTEXT_CHANGED',message:'Synthetic session superseded'}},{status:409});};await assert.rejects(()=>liveApi.catalogSignIn('synthetic-context-changed',credentials),{status:409,code:'SESSION_CONTEXT_CHANGED'});await Promise.resolve();assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});

test('lost or malformed catalog login responses never retry authentication',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try {globalThis.fetch=async()=>{calls++;throw new TypeError('Synthetic offline');};await assert.rejects(()=>liveApi.catalogSignIn('synthetic-offline',credentials));assert.equal(calls,1);globalThis.fetch=async()=>{calls++;return new Response('malformed',{status:200});};await assert.rejects(()=>liveApi.catalogSignIn('synthetic-malformed',credentials),{code:'CRM_INVALID_RESPONSE'});assert.equal(calls,2);}finally{globalThis.fetch=previous;}
});

test('catalog sign-in caller abort reaches transport and prevents late successful auth commit',async()=>{
 const previous=globalThis.fetch,controller=new AbortController();let captured,resolve;
 try {globalThis.fetch=async(_url,options)=>{captured=options.signal;return new Promise(done=>resolve=done);};const pending=liveApi.catalogSignIn('synthetic-abort',credentials,{signal:controller.signal});await Promise.resolve();controller.abort();assert(captured.aborted);resolve(Response.json(success()));await assert.rejects(()=>pending,{name:'AbortError'});}finally{globalThis.fetch=previous;}
});

test('catalog sign-out requires confirmed disconnection and cannot claim malformed success',async()=>{
 const previous=globalThis.fetch,calls=[];let payload={success:true,data:{connected:false},meta:{source:'crm-catalog-auth'}};
 try {globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json(payload);};assert.deepEqual(await liveApi.catalogSignOut('synthetic-out'),{connected:false});assert.equal(calls[0].url,'/api/live/crm/catalog/auth/sign-out');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.body,'{}');for(const value of [{success:true,data:{}},{success:true,data:{connected:true}},{success:true,data:{connected:'false'}}]){payload=value;await assert.rejects(()=>liveApi.catalogSignOut('synthetic-out-invalid'),{code:'CATALOG_AUTH_RESPONSE_INVALID'});}assert.equal(calls.length,4);await assert.rejects(()=>liveApi.catalogSignOut(''),{status:401});assert.equal(calls.length,4);}finally{globalThis.fetch=previous;}
});

test('catalog GET ignores unsupported brand/category options and sends only search/page/limit',async()=>{
 const previous=globalThis.fetch;let address;
 try {globalThis.fetch=async url=>{address=url;return Response.json({success:true,data:[],meta:{}});};await liveApi.catalogProducts('synthetic-filters',{search:'takım',page:1,limit:100,brand:'unused',category:'unused'});const query=new URL(address,'https://example.test').searchParams;assert.deepEqual([...query.keys()],['search','page','limit']);assert.equal(query.get('search'),'takım');}finally{globalThis.fetch=previous;}
});

test('CRM-only catalog GET supports optional trimmed server filters without unknown or repeated keys',async()=>{
 const previous=globalThis.fetch;let address,options;
 try {globalThis.fetch=async(url,init)=>{address=url;options=init;return Response.json({success:true,data:[],meta:{}});};await liveApi.catalogProducts('synthetic-crm-filters',{authMode:'crm',search:' takım ',brand:' Marka & Co ',category:' Üst giyim ',page:2,limit:75,ignored:'not-forwarded'});const query=new URL(address,'https://example.test').searchParams;assert.deepEqual([...query.keys()],['search','brand','category','page','limit']);assert.equal(query.get('search'),'takım');assert.equal(query.get('brand'),'Marka & Co');assert.equal(query.get('category'),'Üst giyim');assert.equal(query.get('page'),'2');assert.equal(query.get('limit'),'75');assert(!Object.hasOwn(options,'authMode'));assert(!Object.hasOwn(options,'preserveAuthDenial'));}finally{globalThis.fetch=previous;}
});

test('CRM-only catalog GET trims before the 120-character limit and omits empty filters',async()=>{
 const previous=globalThis.fetch,addresses=[];
 try {globalThis.fetch=async url=>{addresses.push(url);return Response.json({success:true,data:[],meta:{}});};await liveApi.catalogProducts('synthetic-empty',{authMode:'crm',search:'   ',brand:'\t',category:'\n'});assert.deepEqual([...new URL(addresses[0],'https://example.test').searchParams.keys()],['page','limit']);await liveApi.catalogProducts('synthetic-trim',{authMode:'crm',search:`${' '.repeat(200)}${'a'.repeat(120)}${' '.repeat(200)}`});assert.equal(new URL(addresses[1],'https://example.test').searchParams.get('search'),'a'.repeat(120));}finally{globalThis.fetch=previous;}
});

test('CRM-only catalog invalid filters and unsafe pagination fail before transport',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try {globalThis.fetch=async()=>{calls++;throw new Error('must not fetch');};for(const options of [{search:'x'.repeat(121)},{brand:'x'.repeat(121)},{category:'x'.repeat(121)},{brand:['one','two']},{category:null},{search:4},{page:Number.MAX_SAFE_INTEGER+1},{page:0},{page:1.5},{limit:101},{limit:0}])await assert.rejects(()=>liveApi.catalogProducts('synthetic-invalid-query',{authMode:'crm',...options}),{status:400,code:'INVALID_QUERY'});assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});
