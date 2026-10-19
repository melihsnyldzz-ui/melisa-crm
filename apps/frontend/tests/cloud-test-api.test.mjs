import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudTestApi,syntheticProducts,syntheticSession} from '../src/cloudTest/api.js';
import {catalogProductsForCurrency,selectedSaleLines} from '../src/catalog/productActions.js';
import {nativeOrderPayload,validateNativeReceipt} from '../src/lib/nativeOrder.js';

const session={user:{id:17,name:'Sentetik Angela',role:'staff',synthetic:true},csrfToken:'synthetic-csrf',accessToken:'synthetic-session'};
const row={id:101,code:'SYN-101',name:'Sentetik Tulum',barcode:'8690000000101',stock3:10000,price4:250000,currency:'TRY'};
const response=data=>Response.json({success:true,data});

test('synthetic catalog preserves integer money through actual CRM selection and native draft contract',()=>{
  const products=syntheticProducts([row,{...row,id:102,code:'SYN-102',price4:12345}]);
  const lines=selectedSaleLines(catalogProductsForCurrency(products,'TRY'));
  const body=nativeOrderPayload('12345678-1234-4234-9234-123456789012',{id:'55',phone:'9000000000501'},{id:501,revision:'a'.repeat(64),blocked:false},{basis:'exact-phone'},lines,[2,3],'1.00000000');
  assert.equal(lines[0].priceExact,'25.00000000');
  assert.equal(lines[1].priceExact,'1.23450000');
  assert.equal(body.items[0].priceSourceKey,'cloud-synthetic:price:101');
  const receipt={request:body,status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,items:[
    {productId:101,stockCode:'SYN-101',quantity:2,currency:'TRY',unitPriceExact4:'25.0000',lineTotalExact4:'50.0000'},
    {productId:102,stockCode:'SYN-102',quantity:3,currency:'TRY',unitPriceExact4:'1.2345',lineTotalExact4:'3.7035'},
  ],grandTotalExact4:'53.7035',amountTryExact4:'53.7035'};
  assert.equal(validateNativeReceipt(receipt,body),receipt);
  assert.equal(Object.hasOwn(products[0],'catalogVersion'),false,'no canonical SQL source metadata is fabricated');
  for(const invalid of [{...row,price4:1.2},{...row,stock3:-1},{...row,currency:'ABC'},{...row,id:0}])assert.throws(()=>syntheticProducts([invalid]));
  assert.throws(()=>syntheticProducts([row,row]));
});

test('cloud ERP login confirms selected synthetic session without transmitting credentials',async()=>{
  const calls=[];
  const api=createCloudTestApi(async(url,options)=>{calls.push({url,options});return response(session);});
  assert.deepEqual(await api.erpLogin(session.accessToken,{username:'never-forward-user',password:'never-forward-value'}),{accessToken:session.accessToken,user:session.user});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/cloud-test/session');
  assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
  assert.equal(JSON.stringify(calls).includes('never-forward'),false);
  assert.throws(()=>syntheticSession({...session,user:{...session.user,synthetic:false}}));
  assert.throws(()=>syntheticSession({...session,user:{...session.user,id:99}}));
});

test('cloud writes bind CSRF and opaque token to verified HttpOnly session; stale actor never writes',async()=>{
  const calls=[];
  const api=createCloudTestApi(async(url,options)=>{calls.push({url,options});return response(url.endsWith('/session')?session:{id:'saved'});});
  const body={requestId:'12345678-1234-4234-9234-123456789012'};
  await api.erpV2Draft(session.accessToken,session.accessToken,body);
  const write=calls.at(-1);
  assert.equal(write.url,'/api/cloud-test/erp/drafts');assert.equal(write.options.method,'POST');
  assert.equal(write.options.headers['X-Cloud-CSRF'],session.csrfToken);
  assert.equal(write.options.headers.Authorization,`Bearer ${session.accessToken}`);
  assert.equal(write.options.credentials,'same-origin');assert.deepEqual(JSON.parse(write.options.body),body);
  const before=calls.length;
  await assert.rejects(()=>api.erpV2Draft('stale-token','stale-token',body),{status:401});
  assert.equal(calls.length,before+1);assert.equal(calls.at(-1).options.method,'GET');
});

test('anonymous session actor selection uses server CSRF and rejects nonallowlisted actors locally',async()=>{
  const calls=[];
  const api=createCloudTestApi(async(url,options)=>{calls.push({url,options});return response(options.method==='POST'?session:{user:null,csrfToken:'anonymous-csrf',accessToken:null});});
  await api.selectActor(17);
  assert.equal(calls.at(-1).options.headers['X-Cloud-CSRF'],'anonymous-csrf');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{actorId:17});
  await assert.rejects(()=>api.selectActor(999));assert.equal(calls.length,2);
});

test('authorization denial and malformed cloud responses remain visible to existing ERP dialog',async()=>{
  const forbidden=createCloudTestApi(async url=>url.endsWith('/session')?response(session):Response.json({success:false,error:{code:'FORBIDDEN',message:'Atama gerekli'}},{status:403}));
  await assert.rejects(()=>forbidden.customers(session.accessToken),{status:403,code:'FORBIDDEN'});
  const malformed=createCloudTestApi(async()=>Response.json({success:true}));
  await assert.rejects(()=>malformed.session(),{code:'CLOUD_TEST_INVALID_RESPONSE'});
});
