import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadBudgetMiddleware,budgetKey} from './catalogReadBudget.mjs';
import {apiRateLimit} from './security.js';
import {env} from '../config/env.js';
import {installTestAdminSession} from '../services/testAdminSession.mjs';
import express from 'express';

test('fresh verified actors have separate exact read/send/catalog budgets; invalid actors retain global protection',()=>{
  let actor={id:'staff',active:true,role:'personel',permissions:['crm.view','crm.send']};
  const counts=new Map(),events=[];
  const limiter=scope=>(req,res)=>{const key=scope==='global'?'global':budgetKey(req);counts.set(key,(counts.get(key)||0)+1);events.push([scope,key,counts.get(key)]);};
  const middleware=createReadBudgetMiddleware({verifyToken:()=>actor,canRead:()=>true,globalLimiter:limiter('global'),catalogLimiter:limiter('catalog'),verificationLimiter:limiter('verification'),crmReadLimiter:limiter('crm-read'),crmSendLimiter:limiter('crm-send')});
  const call=(method,path,authorization='Bearer fixture')=>middleware({method,path,get:()=>authorization},{},()=>{});
  call('GET','/crm/inbox');call('POST','/crm/conversations/55/messages');call('GET','/crm/catalog/products');call('GET','/auth/me');
  assert.deepEqual(events.map(e=>e[0]),['crm-read','crm-send','catalog','verification']);
  assert.equal(new Set(events.map(e=>e[1])).size,4);
  actor={...actor,active:false};call('GET','/crm/inbox');
  actor={...actor,active:true,permissions:['crm.view']};call('POST','/crm/conversations/55/messages');
  call('GET','/crm/inbox','');call('POST','/crm/inbox');call('GET','/crm/conversations/55/messages');
  assert.deepEqual(events.slice(4).map(e=>e[0]),Array(5).fill('global'));
  actor={...actor,role:'unknown'};call('GET','/crm/catalog/products');assert.equal(events.at(-1)[0],'global');
});

test('actual send exhaustion leaves reads open and returns server-selected scope and Retry-After',async()=>{
  const old={max:env.rateLimit.max,windowMs:env.rateLimit.windowMs};
  env.rateLimit.max=1;env.rateLimit.windowMs=60000;
  const session=installTestAdminSession({uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401'});
  const token=session().accessToken,app=express();app.use(apiRateLimit());app.use((req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${token}`};
  try{
    assert.equal((await fetch(url+'/crm/conversations/55/messages',{method:'POST',headers})).status,200);
    const limited=await fetch(url+'/crm/conversations/55/messages',{method:'POST',headers});assert.equal(limited.status,429);
    assert.equal(limited.headers.get('x-crm-ratelimit-scope'),'crm-send');assert.ok(Number(limited.headers.get('retry-after'))>0);
    assert.equal((await fetch(url+'/crm/inbox',{headers})).status,200);
    const readLimited=await fetch(url+'/crm/inbox',{headers});assert.equal(readLimited.status,429);assert.equal(readLimited.headers.get('x-crm-ratelimit-scope'),'crm-read');
    assert.equal((await fetch(url+'/crm/catalog/products',{headers})).status,200);
    assert.equal((await fetch(url+'/auth/me',{headers})).status,200);
    assert.equal((await fetch(url+'/unknown')).status,200);
    const globalLimited=await fetch(url+'/unknown');assert.equal(globalLimited.status,429);assert.equal(globalLimited.headers.get('x-crm-ratelimit-scope'),'global');
  }finally{env.rateLimit.max=old.max;env.rateLimit.windowMs=old.windowMs;await new Promise(resolve=>server.close(resolve));}
});
