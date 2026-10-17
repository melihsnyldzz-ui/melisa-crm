import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTestErpPhotoRead} from '../deploy/test-erp-read-environment.mjs';
import {validMediaBytes} from '../apps/gateway/src/utils/validMediaFixtures.js';
import {publicCrmUser} from '../apps/gateway/src/services/crmAuthService.js';

const reference='/uploads/vega-products/fixture.png';
const actor=publicCrmUser({id:'synthetic-personel',username:'fixture-personel',displayName:'Fixture Personel',active:true,role:'personel',chatwootAgentId:7,permissions:['crm.view']});
async function fixture(t,{authStatus=200,currentActor=actor,catalogRead=true,databaseName='MELISA_ERP_V2',metadata=true}={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'crm-photo-fixture-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  await fs.writeFile(path.join(directory,'fixture.png'),validMediaBytes('image/png'));
  let sqlCalls=0,authCalls=0;const bindings=[];
  const handler=createTestErpPhotoRead({photoRoot:directory,crmOrigin:'http://127.0.0.1:62401',
    transport:async(url,options)=>{authCalls++;assert.equal(String(url),'http://127.0.0.1:62401/auth/me');assert.equal(options.redirect,'error');return Response.json({success:authStatus===200,data:currentActor,meta:{source:'crm-auth',catalogRead}},{status:authStatus});},
    getSqlPool:async()=>({request:()=>({input(name,type,value){bindings.push({name,value});return this},async query(sql){sqlCalls++;if(sql==='SELECT DB_NAME() AS databaseName;')return{recordset:[{databaseName}]};assert.match(sql,/is_active=1 AND is_primary=1 AND file_path=@filePath/);assert.match(sql,/IF DB_NAME\(\)<>N'MELISA_ERP_V2'/);return{recordset:metadata?[{filePath:reference}]:[]};}})}),
    getSqlDriver:()=>({NVarChar:size=>size}),
  });
  const request=(value=reference,authorized=true)=>new Request('http://127.0.0.1:62402'+value,{headers:authorized?{authorization:'Bearer synthetic-fixture'}:{}});
  return{directory,handler,request,bindings,sqlCalls:()=>sqlCalls,authCalls:()=>authCalls};
}

test('protected photo requires CRM auth, active role and catalogRead before SQL',async t=>{
  for(const settings of [{authStatus:401},{currentActor:{...actor,active:false}},{catalogRead:false},{currentActor:{...actor,role:'unknown'}},{currentActor:{...actor,permissions:[]}}]){
    const f=await fixture(t,settings),response=await f.handler(f.request());assert.ok([401,403].includes(response.status));assert.equal(f.sqlCalls(),0);
  }
  const f=await fixture(t);assert.equal((await f.handler(f.request(reference,false))).status,401);assert.equal(f.authCalls(),0);
});

test('photo references reject traversal, unknown types and query tokens',async t=>{
  const f=await fixture(t);
  for(const value of ['/uploads/vega-products/%2e%2e%2fsecret.png','/uploads/vega-products/sub%2ffile.png','/uploads/vega-products/file.html',reference+'?token=secret'])assert.ok([400,404].includes((await f.handler(f.request(value))).status));
  assert.equal(f.sqlCalls(),0);assert.equal(f.authCalls(),0);
});

test('wrong database and missing active-primary metadata reject photo read',async t=>{
  for(const [settings,status]of [[{databaseName:'WRONG_DATABASE'},503],[{metadata:false},404]]){
    const f=await fixture(t,settings);assert.equal((await f.handler(f.request())).status,status);
  }
});

test('authorized exact metadata photo has validated bytes and no-store response',async t=>{
  assert.equal(Object.hasOwn(actor,'active'),false);
  const f=await fixture(t),response=await f.handler(f.request());assert.equal(response.status,200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),validMediaBytes('image/png'));
  assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(f.bindings,[{name:'filePath',value:reference}]);assert.equal(f.authCalls(),2);
});

test('missing file and signature-only invalid PNG do not expose paths',async t=>{
  for(const missing of [true,false]){
    const f=await fixture(t),file=path.join(f.directory,'fixture.png');
    if(missing)await fs.unlink(file);else await fs.writeFile(file,Buffer.from([137,80,78,71,13,10,26,10]));
    const response=await f.handler(f.request());assert.equal(response.status,missing?404:502);assert.ok(!(await response.text()).includes(f.directory));
  }
});

test('symlink escaping the photo root cannot be served',async t=>{
  const f=await fixture(t),outside=await fs.mkdtemp(path.join(os.tmpdir(),'crm-photo-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  const target=path.join(outside,'outside.png');await fs.writeFile(target,validMediaBytes('image/png'));await fs.unlink(path.join(f.directory,'fixture.png'));
  try{await fs.symlink(target,path.join(f.directory,'fixture.png'),'file')}catch(error){
    if(error.code!=='EPERM')throw error;
    // Windows junctions exercise the same realpath escape without symlink privileges.
    await fs.symlink(outside,path.join(f.directory,'fixture.png'),'junction');
  }
  assert.equal((await f.handler(f.request())).status,404);
});
