import test from 'node:test';
import assert from 'node:assert/strict';
import { liveApi } from '../src/liveApi.js';

test('actual JSON and photo transports honor matching server budgets; unknown 429 stops all later transports', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  let denied = '/crm/catalog/products?', scope = 'catalog';
  globalThis.fetch = async (url, options) => {
    const path = String(url).replace('/api/live', '');
    calls.push({path, method: options.method || 'GET'});
    if (path.startsWith(denied)) return new Response('', {status:429,headers:{'Retry-After':'60','X-CRM-RateLimit-Scope':scope}});
    return Response.json({success:true,data:{id:42,username:'synthetic',role:'mudur',permissions:['crm.view','crm.send'],liveSendEnabled:false,conversations:[],summary:{total:0}}});
  };
  try {
    const token='synthetic-budget-transport';
    await assert.rejects(liveApi.existingCatalogProducts(token),{status:429});
    await assert.rejects(liveApi.existingCatalogPhoto(token,'vega-42'),{status:429});
    assert.equal(calls.length,1,'photo shares the confirmed catalog cooldown before fetch');
    await liveApi.session(token);await liveApi.inbox(token);await liveApi.assign(token,'55',7);
    assert.equal(calls.length,4,'unrelated authenticated actions still reach their server checks');
    denied='/crm/inbox';scope='crm-read';
    await assert.rejects(liveApi.inbox(token),{status:429});
    await assert.rejects(liveApi.conversation(token,'55'),{status:429});
    assert.equal(calls.length,5);
    await liveApi.assign(token,'55',7);assert.equal(calls.length,6);
    denied='/auth/me';scope='unrecognized';
    await assert.rejects(liveApi.session('another-synthetic-budget-token'),{status:429});
    await assert.rejects(liveApi.assign(token,'55',7),{status:429});
    assert.equal(calls.length,7,'unknown scope is global and never sends or retries a mutation');
  } finally { globalThis.fetch = originalFetch; }
});
