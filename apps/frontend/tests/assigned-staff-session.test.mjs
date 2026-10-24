import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('reloaded assigned staff uses only its server-verified own-family logout marker, without issuer authority',async t=>{
  for(const enabled of [false,true])await t.test(enabled?'verified staff family':'ordinary unmarked staff',async()=>{
    const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];let stored='synthetic-staff-access';
    const staff={id:'crm-crm06-staff-test-20261014',username:'crm-crm06-staff',role:'personel',chatwootAgentId:2,
      permissions:['crm.view'],...(enabled?{assignedStaffRefresh:true}:{})};
    globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},
      sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
    globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({data:url.endsWith('/me')?staff:{loggedOut:true}});};
    try{
      const {liveApi,saveAccessKey}=await import(`../src/liveApi.js?assigned-staff-own-close-${enabled}`);
      const profile=await liveApi.session(stored);assert.equal(profile.customerProductRequestIssuer,undefined);
      assert.deepEqual(profile.permissions,['crm.view']);await liveApi.clearNormalSession(stored);
      assert.deepEqual(calls.map(c=>c.url),enabled?['/api/live/auth/me','/api/live/auth/logout']:['/api/live/auth/me']);
      if(enabled){const close=calls[1];assert.equal(close.options.headers.Authorization,'Bearer synthetic-staff-access');
        assert.equal(close.options.body,'{}');assert.equal(close.options.credentials,'omit');assert.equal(close.options.redirect,'error');}
      // App clears its access key after the normal close operation succeeds.
      saveAccessKey('');assert.equal(stored,null);
    }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
  });
});
