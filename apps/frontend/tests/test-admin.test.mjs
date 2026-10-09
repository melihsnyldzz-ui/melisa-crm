import test from 'node:test';
import assert from 'node:assert/strict';
import {testAdminAvailable,testRoleLogin,chooseTestRoleLogin,bootstrapTestAdmin} from '../src/testAdmin.js';
test('automatic TEST admin needs both the TEST build and exact loopback origin',()=>{
  assert.equal(testAdminAvailable({origin:'http://127.0.0.1:62400'},true),true);
  assert.equal(testAdminAvailable({origin:'http://127.0.0.1:62600'},true),true);
  assert.equal(testAdminAvailable({origin:'http://127.0.0.1:62600'},false),false);
  assert.equal(testAdminAvailable({origin:'http://192.168.1.46:62600'},true),false);
  for(const origin of ['https://crm.example.com','http://127.0.0.1:4200','http://localhost:62400','http://192.168.1.46:62400'])assert.equal(testAdminAvailable({origin},true),false);
  assert.equal(testAdminAvailable({origin:'http://127.0.0.1:62400'},false),false);
});
test('real-role choice persists through reload and can return to TEST admin',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  assert.equal(testRoleLogin(storage),false);chooseTestRoleLogin(true,storage);assert.equal(testRoleLogin(storage),true);
  chooseTestRoleLogin(false,storage);assert.equal(testRoleLogin(storage),false);
});
test('blocked browser storage does not prevent rendering normal or TEST login',t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('storage blocked');}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete globalThis.sessionStorage;});
  assert.equal(testRoleLogin(),false);assert.doesNotThrow(()=>chooseTestRoleLogin(true));
});
test('bootstrap uses a cancellable same-origin POST and fails closed on rejection',async()=>{
  const signal=new AbortController().signal;
  const token=await bootstrapTestAdmin({signal,fetchFn:async(url,options)=>{assert.equal(url,'/api/test-admin/session');assert.equal(options.method,'POST');assert.equal(options.signal,signal);return Response.json({accessToken:'synthetic-token'});}});
  assert.equal(token,'synthetic-token');
  await assert.rejects(bootstrapTestAdmin({fetchFn:async()=>new Response(null,{status:403})}),/açılamadı/);
});
