import test from 'node:test';import assert from 'node:assert/strict';
import {createCatalogBridge} from '../apps/gateway/src/services/catalogBridge.mjs';
import {ERP_DATABASE} from '../packages/contracts/index.mjs';
test('ERP dependency fails closed without deployment approval',async()=>{
 const response=await createCatalogBridge()(new Request('http://fixture.test/crm/catalog/products'));
 assert.equal(response.status,503);
});
test('synthetic ERP response verifies identity and preserves privacy',async()=>{
 const control=new AbortController();let calls=0;
 const bridge=createCatalogBridge({deploymentApproved:true,authorizeCrm:async()=>({id:'fixture',role:'patron',permissions:['crm.view'],catalogReadApproved:true}),resolveCrmReadSession:async()=>({crmActorId:'fixture',authorization:'Bearer synthetic-fixture',expiresAt:Date.now()+60000,isCurrent:()=>true,signal:control.signal}),transport:async()=>{calls++;return Response.json({success:true,data:[{id:1,stockCode:'SYNTHETIC',productName:'Fixture',isActive:true,salePrice:10,stockQuantity:2,currency:'TRY',internalNote:'must-not-export'}],meta:{source:'crm-catalog-sql-select-only',sourceDatabaseVerified:true,databaseName:ERP_DATABASE,verifiedCrmActorId:'fixture',verifiedCrmRole:'patron',page:1,limit:20,total:1,totalPages:1,hasNextPage:false,hasPreviousPage:false}})}});
 const response=await bridge(new Request('http://fixture.test/crm/catalog/products'));
 assert.equal(response.status,200);assert.equal(calls,1);const body=await response.json();assert.equal(body.data[0].stockCode,'SYNTHETIC');assert.equal(body.data[0].internalNote,undefined);
});
