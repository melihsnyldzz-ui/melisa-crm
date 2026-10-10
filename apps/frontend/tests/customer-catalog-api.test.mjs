import test from 'node:test';
import assert from 'node:assert/strict';
import {customerCatalogApi,createCustomerCatalogLink,customerCatalogLinkUrl} from '../src/customerCatalog/api.js';
const token='x'.repeat(43);
const empty={revision:0,items:[],modelCount:0,seriesCount:0,pieceCount:0,productTotalExact:'0.00000000',currency:'TRY'};
const session={sessionId:'fixture-session',expiresAt:'2099-01-01T00:00:00Z',testOnly:true,customerLabel:'TEST',products:[],cart:empty,order:null};

test('customer capability stays in bearer header; filter and cart requests are bounded same-origin',async()=>{
  const original=globalThis.fetch,calls=[];
  try{globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:url.endsWith('/session')?session:url.endsWith('/cart')?empty:{products:[],facets:{}}});};
    await customerCatalogApi.session(token);await customerCatalogApi.products(token,{scope:'all',search:'çocuk & takım',age:'0–2 yaş',maxPrice:'120'});await customerCatalogApi.saveCart(token,{revision:0,items:[]});
    assert.equal(calls[0].url,'/api/customer-catalog/session');assert(!calls.some(call=>call.url.includes(token)));
    for(const call of calls){assert.equal(call.options.headers.Authorization,'Bearer '+token);assert.equal(call.options.redirect,'error');assert.equal(call.options.cache,'no-store');assert.equal(call.options.credentials,'omit');}
    assert.equal(calls[1].url,'/api/customer-catalog/products?scope=all&search=%C3%A7ocuk+%26+tak%C4%B1m&age=0%E2%80%932+ya%C5%9F&maxPrice=120');
    assert.equal(calls[2].options.method,'PUT');assert.deepEqual(JSON.parse(calls[2].options.body),{revision:0,items:[]});
  }finally{globalThis.fetch=original;}
});
test('expired capability and conflict are surfaced once without automatic retry or writes',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{globalThis.fetch=async()=>{calls++;return Response.json({error:{code:'CUSTOMER_CATALOG_SESSION_INVALID',message:'expired'}},{status:401});};
    await assert.rejects(()=>customerCatalogApi.session(token),{status:401,code:'CUSTOMER_CATALOG_SESSION_INVALID'});assert.equal(calls,1);
    await assert.rejects(()=>customerCatalogApi.session('bad'));assert.equal(calls,1);
    globalThis.fetch=async()=>{calls++;return Response.json({error:{code:'CUSTOMER_CATALOG_REVISION_CONFLICT',message:'changed'}},{status:409});};
    await assert.rejects(()=>customerCatalogApi.saveCart(token,{revision:0,items:[]}),{status:409});assert.equal(calls,2);
  }finally{globalThis.fetch=original;}
});
test('photos use guarded product path and reject arbitrary URL, SVG and counterfeit raster',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/api/customer-catalog/products/erp-1/photo');assert.equal(options.headers.Authorization,'Bearer '+token);return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'content-type':'image/png'}});};
    assert.equal((await customerCatalogApi.photo(token,'erp-1')).type,'image/png');await assert.rejects(()=>customerCatalogApi.photo(token,'https://outside.test/photo'));assert.equal(calls,1);
    globalThis.fetch=async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}});await assert.rejects(()=>customerCatalogApi.photo(token,'erp-1'));
    globalThis.fetch=async()=>new Response('<html/>',{headers:{'content-type':'image/png'}});await assert.rejects(()=>customerCatalogApi.photo(token,'erp-1'));
  }finally{globalThis.fetch=original;}
});
test('staff issuance is explicit and only uses current CRM identity and selected conversation',async()=>{
  const original=globalThis.fetch;
  try{globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/live/crm/customer-catalog/sessions');assert.equal(options.headers.Authorization,'Bearer synthetic-staff');assert.deepEqual(JSON.parse(options.body),{conversationId:'55'});return Response.json({success:true,data:{sessionId:'fixture',url:'/katalog#'+token,testOnly:true}});};
    assert.equal((await createCustomerCatalogLink('synthetic-staff','55')).url,'/katalog#'+token);
    await assert.rejects(()=>createCustomerCatalogLink('synthetic-staff','../other'));
  }finally{globalThis.fetch=original;}
});
test('operator on localhost receives the trusted Tailscale or existing LAN phone link',async()=>{
  const original=globalThis.fetch;
  try{
    for(const linkOrigin of ['http://100.91.12.34:62600','http://192.168.1.46:62600']){
      globalThis.fetch=async()=>Response.json({success:true,data:{sessionId:'fixture',url:'/katalog#'+token,testOnly:true,linkOrigin}});
      const result=await createCustomerCatalogLink('synthetic-staff','55');
      assert.equal(customerCatalogLinkUrl(result,'http://127.0.0.1:62600'),linkOrigin+'/katalog#'+token);
    }
    assert.equal(customerCatalogLinkUrl({url:'/katalog#'+token},'http://127.0.0.1:62600'),'http://127.0.0.1:62600/katalog#'+token);
  }finally{globalThis.fetch=original;}
});
test('minted phone link rejects public, loopback, wrong-port and URL-credential origins',async()=>{
  const original=globalThis.fetch;
  try{
    for(const linkOrigin of ['https://outside.test','http://127.0.0.1:62600','http://localhost:62600','http://100.128.12.34:62600','http://100.91.12.34:62600/','http://100.91.12.34:62600/path','http://100.91.12.34:62600?x=1','http://100.91.12.34:62600#other','http://user:pass@100.91.12.34:62600','http://100.91.12.34:62400','http://192.168.1.47:62600',null]){
      globalThis.fetch=async()=>Response.json({success:true,data:{sessionId:'fixture',url:'/katalog#'+token,testOnly:true,linkOrigin}});
      await assert.rejects(()=>createCustomerCatalogLink('synthetic-staff','55'));
      assert.throws(()=>customerCatalogLinkUrl({url:'/katalog#'+token,linkOrigin},'http://127.0.0.1:62600'));
    }
  }finally{globalThis.fetch=original;}
});
