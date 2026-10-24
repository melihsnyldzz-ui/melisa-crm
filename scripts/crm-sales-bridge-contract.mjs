// Offline diagnostic only. This is not a CRM sales adapter or a TEST service.
import '../tests/offline-test-guard.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {nativeOrderPayload,validateNativeReceipt} from '../apps/frontend/src/lib/nativeOrder.js';
import {catalogProductsForCurrency,selectedSaleLines} from '../apps/frontend/src/catalog/productActions.js';

export const bridgeReference = Object.freeze({
  erpCommit:'d78474ae0eb45146790e608979fc3e06c9741adb',
  crmCommit:'f5ad566b852425ed21d3ec9e87b783b85e90b890',
  files:Object.freeze([
    Object.freeze({
      name:'application.mjs',
      sha256:'9f3fca9dd654a5886f259724958167735b40f4877d592fd6d697e4f0476f99d9',
    }),
    Object.freeze({
      name:'store.mjs',
      sha256:'d9841b00819c508f872a4bf498b01cf4c9266016cb0ed48374ff1d1badfe48d9',
    }),
    Object.freeze({
      name:'marker.mjs',
      sha256:'76cc9b8ec07c954135b5291c5348d5278a40e8a285f67945fd2327de55e28019',
    }),
    Object.freeze({
      name:'crm-cloud-api.mjs',
      sha256:'8a7a8064eadeeb30e254c480b17c5bdcf8f1d99f8218d4e96db0822d3e6ac40b',
    }),
  ]),
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
function pinnedSources(input){
  const workspace=fs.realpathSync(fileURLToPath(new URL('../apps/frontend/.sites-runtime/',import.meta.url)));
  const directory=fs.realpathSync(input),relative=path.relative(workspace,directory);
  if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail('BRIDGE_FIXTURE_SCOPE_REJECTED');
  const files=[];
  for(const {name,sha256:expected}of bridgeReference.files){
    const filename=path.join(directory,name),stat=fs.lstatSync(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||fs.realpathSync(filename)!==filename)fail('BRIDGE_SOURCE_PIN_REJECTED');
    const bytes=fs.readFileSync(filename);
    if(hash(bytes)!==expected)fail('BRIDGE_SOURCE_PIN_REJECTED');
    files.push({name,sha256:expected,bytes:bytes.length});
  }
  return {directory,files};
}

export async function probeSalesBridge(sourceDirectory){
  const sources=pinnedSources(sourceDirectory);
  const {createStore}=await import(pathToFileURL(path.join(sources.directory,'store.mjs')).href);
  const {createApplication}=await import(pathToFileURL(path.join(sources.directory,'application.mjs')).href);
  const {createCloudTestApi}=await import(pathToFileURL(path.join(sources.directory,'crm-cloud-api.mjs')).href);
  const fixture=fs.mkdtempSync(path.join(sources.directory,'.bridge-probe-'));
  const database=path.join(fixture,'synthetic.sqlite');
  let store,report;
  try{
    store=createStore(database);
    const application=createApplication({store});
    const origin='https://offline-crm.invalid';
    let requests=0;
    function transport(){
      let cookie='';
      return async(url,options={})=>{
        const headers=new Headers(options.headers);
        if(cookie)headers.set('Cookie',cookie);
        if(options.method==='POST')headers.set('Origin',origin);
        // Direct Web Request/Response dispatch: no listener, fetch or socket.
        const response=await application(new Request(origin+url,{...options,headers}));
        const next=response.headers.get('Set-Cookie');if(next)cookie=next.split(';')[0];
        requests++;
        return response;
      };
    }
    const crmTransport=transport(),erpTransport=transport();
    const crm=createCloudTestApi(crmTransport),erp=createCloudTestApi(erpTransport);
    const crmSession=await crm.selectActor(17),erpSession=await erp.selectActor(15);
    const token=crmSession.accessToken;
    const customer=(await crm.erpV2Customers(token,token,'55','9000000000501')).entries[0];
    const products=await crm.products(token);
    const lines=selectedSaleLines(catalogProductsForCurrency(products,'TRY')).slice(0,1);
    const payload=nativeOrderPayload('c06a0001-0000-4000-8000-000000000001',
      {id:'55',phone:'9000000000501'},customer,{basis:'exact-phone'},lines,[2],'1.00000000');
    const receipt=await crm.erpV2Draft(token,token,payload);
    validateNativeReceipt(receipt,payload);
    const actor=store.actors().find(row=>row.id===15),order=store.getOrders(actor)[0];
    assert.equal(order.id,Number(receipt.id));
    assert.equal(receipt.grandTotalExact4,'50.0000');
    const draftRevisionReturned=Object.hasOwn(receipt,'revision');

    // Change only this newly created disposable SQLite fixture's product price.
    const editor=new DatabaseSync(database);
    try{editor.prepare('UPDATE products SET price4=? WHERE id=?').run(300000,101);}finally{editor.close();}
    assert.equal((await crm.products(token))[0].priceExact,'30.00000000');
    async function erpPost(suffix,body){
      const session=await erp.session();
      const response=await erpTransport('/api/cloud-test'+suffix,{method:'POST',
        headers:{'Content-Type':'application/json','X-Cloud-CSRF':session.csrfToken,Authorization:'Bearer '+erpSession.accessToken},body:JSON.stringify(body)});
      const value=await response.json();
      return {status:response.status,value};
    }
    const conversionPath='/erp/orders/'+order.id+'/sale';
    const requestId='c06a0002-0000-4000-8000-000000000002';
    const witnessed=await erpPost(conversionPath,{requestId,expectedRevision:order.revision});
    assert.equal(witnessed.status,400);
    assert.equal(witnessed.value.error.code,'INVALID_FIELDS');
    assert.equal(store.snapshot(actor).sales.length,0);
    const converted=await erpPost(conversionPath,{requestId});
    assert.equal(converted.status,200);
    const sale=converted.value.data;
    assert.equal(sale.grandTotalExact4,'50.0000');
    const finalized=await erpPost('/work-sales/drafts/'+sale.id+'/finalize',
      {requestId:'c06a0003-0000-4000-8000-000000000003',expectedRevision:sale.revision});
    assert.equal(finalized.status,200);
    assert.equal(finalized.value.data.invoice.grandTotalExact4,'50.0000');
    assert.equal(store.snapshot(actor).customers.find(row=>row.id===501).balance4,500000);
    report={schemaVersion:'crm-sales-bridge-contract-probe.v1',taskId:'DOT-CRM-BRIDGE-20261020-0945-1',
      result:'BLOCKED_UPSTREAM_CONTRACT',bridgeReady:false,applicationChanged:false,
      source:{erpCommit:bridgeReference.erpCommit,crmCloudCommit:bridgeReference.crmCommit,files:sources.files},
      scope:'One new changed-price negative case; prerequisite draft setup is not another baseline acceptance. Actual pinned Cloud modules and current CRM native payload/receipt validation; no normal Windows/native runtime.',
      observation:{productId:101,quantity:2,orderPriceExact8:'25.00000000',currentPriceExact8:'30.00000000',
        storedOrderTotalExact4:'50.0000',currentPriceTotalExact4:'60.0000',draftRevisionReturned,
        endpoint:'/api/cloud-test/erp/orders/:id/sale',
        withExpectedRevision:{status:witnessed.status,code:witnessed.value.error.code,salesCreated:0},
        sentRevisionKind:'unchanged order revision, not a current product/quote price witness',
        withoutExpectedRevision:{status:converted.status,totalExact4:sale.grandTotalExact4},
        finalize:{status:finalized.status,totalExact4:finalized.value.data.invoice.grandTotalExact4},
        requestedBridgeBehavior:'Server contract for current price/stock check and the existing reviewed-price policy before linking the same order to one sale; reject stale state (for example 409) or explicitly preserve an authorized quoted price',
        actual:'400 for the extra order-revision field; bare request creates/finalizes a sale retaining the stored order price after catalog price changed',
        conclusion:'The requested price/quote freshness or reviewed-price decision is not represented by this endpoint. Retaining an order price is not itself proved to be an ERP pricing bug; no automatic repricing is requested.'},
      boundaries:{directRequestDispatches:requests,listenersStarted:0,externalHttpOrSqlServer:false,
        sqlite:'new disposable synthetic fixture only',erpRepositoryWrites:false,sharedRuntimeWrites:false,
        liveOrVegaOrT1:false,realCustomerMessages:false,paidApi:false,guiOrHumanAcceptance:false},
    };
  }finally{
    store?.close();
    const exact=fs.realpathSync(fixture);
    if(path.dirname(exact)!==sources.directory||!path.basename(exact).startsWith('.bridge-probe-'))fail('BRIDGE_FIXTURE_CLEANUP_REJECTED');
    for(const name of ['synthetic.sqlite','synthetic.sqlite-journal','synthetic.sqlite-wal','synthetic.sqlite-shm']){
      const filename=path.join(exact,name);
      if(fs.existsSync(filename)){if(!fs.lstatSync(filename).isFile())fail('BRIDGE_FIXTURE_CLEANUP_REJECTED');fs.unlinkSync(filename);}
    }
    fs.rmdirSync(exact);
  }
  return {...report,fixtureRemoved:!fs.existsSync(fixture)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)fail('BRIDGE_PINNED_REFERENCE_DIRECTORY_REQUIRED');
    console.log(JSON.stringify(await probeSalesBridge(process.argv[2]),null,2));
    process.exitCode=3; // Deliberately not a green bridge/TEST acceptance result.
  }catch(error){console.error(error.code||'BRIDGE_PROBE_FAILED');process.exitCode=1;}
}
