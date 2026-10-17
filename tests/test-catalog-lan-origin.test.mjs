import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from '../apps/gateway/node_modules/express/index.js';
import {createCatalogRouter} from '../apps/gateway/src/services/catalogRouter.mjs';
test('catalog signout accepts exact configured LAN origin with current auth; wildcard/other origins rejected',async t=>{
  let revoked=0,verified=0;
  const options={Router:express.Router,activationApproved:true,uiOrigin:'http://127.0.0.1:62400',additionalUiOrigins:['http://192.168.1.46:62400'],transport:()=>{throw Error('unexpected transport')},verifyCrmContext:()=>{verified++;return{user:{id:'fixture',permissions:['crm.view']}}},access:{base:()=>true,revoke:()=>revoked++,lease:()=>{throw Error('unexpected lease')}}};
  for(const origin of ['*','http://192.168.*:62400','http://192.168.1.46:62400/path'])assert.throws(()=>createCatalogRouter({...options,additionalUiOrigins:[origin]}));
  const app=express();app.use(express.json());app.use(createCatalogRouter(options).router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const url='http://127.0.0.1:'+server.address().port;
  for(const origin of ['http://127.0.0.1:62400','http://192.168.1.46:62400']){
    const response=await fetch(url+'/crm/catalog/auth/sign-out',{method:'POST',headers:{authorization:'Bearer fixture',origin,'content-type':'application/json'},body:'{}'});assert.equal(response.status,200);
  }
  assert.equal(revoked,2);assert.equal(verified,2);
  for(const origin of ['http://192.168.1.47:62400','null','http://example.com:62400']){
    const response=await fetch(url+'/crm/catalog/auth/sign-out',{method:'POST',headers:{authorization:'Bearer fixture',origin,'content-type':'application/json'},body:'{}'});assert.equal(response.status,403);
  }
  assert.equal(revoked,2);assert.equal(verified,2);
  const missing=await fetch(url+'/crm/catalog/auth/sign-out',{method:'POST',headers:{origin:'http://192.168.1.46:62400','content-type':'application/json'},body:'{}'});assert.equal(missing.status,401);assert.equal(revoked,2);
  const removed=await fetch(url+'/crm/catalog/auth/sign-in',{method:'POST',headers:{authorization:'Bearer fixture',origin:'http://192.168.1.46:62400','content-type':'application/json'},body:'{}'});assert.equal(removed.status,410);
});
