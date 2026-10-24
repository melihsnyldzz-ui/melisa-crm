import test from 'node:test';
import assert from 'node:assert/strict';
import {validMediaBytes} from '../apps/gateway/src/utils/validMediaFixtures.js';
// Mock transport only; this selection opens no listener or connection.
process.env.CRM_ERP_CATALOG_ORIGIN='http://127.0.0.1:62402';
const {createCatalogBridge,isTestCatalogPhotoOrigin}=await import('../apps/gateway/src/services/catalogBridge.mjs');

test('authenticated photo forwarding is restricted to explicit62402 loopback adapter',()=>{
  for(const origin of ['http://127.0.0.1:62402','http://localhost:62402','http://[::1]:62402'])assert.equal(isTestCatalogPhotoOrigin(origin),true);
  for(const origin of ['http://127.0.0.1:4100','http://example.com:62402','http://127.0.0.1.example.com:62402','http://user:secret@127.0.0.1:62402','http://127.0.0.1:62402/path','http://127.0.0.1:62402/?token=x','https://127.0.0.1:62402'])assert.equal(isTestCatalogPhotoOrigin(origin),false);
});

test('explicit TEST option forwards verified CRM lease to safe asset; default preserves public headers',async()=>{
  for(const photoCrmAuthorization of [false,true]){
    const calls=[],controller=new AbortController();let current=true;
    const session={crmActorId:'fixture-actor',authorization:'Bearer verified-read-lease',expiresAt:Date.now()+60000,isCurrent:()=>current,signal:controller.signal,release(){}};
    const bridge=createCatalogBridge({deploymentApproved:true,photoCrmAuthorization,
      authorizeCrm:async()=>({id:'fixture-actor',role:'personel',permissions:['crm.view'],catalogReadApproved:true}),resolveCrmReadSession:async()=>session,
      transport:async(url,options)=>{
        calls.push({url:String(url),options});
        if(new URL(url).pathname.startsWith('/api/crm-catalog/'))return Response.json({success:true,data:{id:'vega-7',isActive:true,imageUrl:'/uploads/vega-products/fixture photo.png'},meta:{source:'crm-existing-stock-select-only',sourceDatabaseVerified:true,productDatabaseVerified:true,imageDatabaseVerified:true,imageDatabaseName:'MELISA_ERP_V2',productDatabaseName:'VEGA2026',verifiedCrmActorId:'fixture-actor',verifiedCrmRole:'personel'}});
        assert.equal(String(url),'http://127.0.0.1:62402/uploads/vega-products/fixture%20photo.png');
        assert.equal(options.redirect,'manual');
        assert.deepEqual(options.headers,photoCrmAuthorization?{accept:'image/png,image/jpeg,image/webp',authorization:session.authorization}:{accept:'image/png,image/jpeg,image/webp'});
        return new Response(validMediaBytes('image/png'),{headers:{'content-type':'image/png'}});
      },
    });
    const response=await bridge(new Request('http://127.0.0.1/crm/catalog/products/vega-7/photo'));
    assert.equal(response.status,200);assert.equal(calls.length,2);assert.deepEqual(Buffer.from(await response.arrayBuffer()),validMediaBytes('image/png'));
    current=false;
    const rejected=await bridge(new Request('http://127.0.0.1/crm/catalog/products/vega-7/photo'));assert.equal(rejected.status,401);assert.equal(calls.length,2);
  }
});
