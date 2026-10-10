import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getErpAuthorization } from '../deploy/test-erp-catalog.mjs';
import { resolveTestEndpoints } from '../deploy/test-endpoints.mjs';

test('existing isolated seller write identity never substitutes the read-only catalog identity', async () => {
  const testEndpoints=resolveTestEndpoints({ CRM_TEST_PORT_BASE:'62600', CRM_ISOLATED_PREPARATION:'true',
    CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174', CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_01' });
  const environment={ CRM_ERP_CATALOG_ACCESS_PATH:path.resolve('synthetic-account-scope.json') }, calls=[];
  const options={ environment,testEndpoints,readFileFn:async()=>JSON.stringify({
    ilker:{username:'synthetic-reader',password:'synthetic-only'},seller:{username:'synthetic-writer',password:'synthetic-only'} }),
    fetchFn:async(_url,request)=>{
      const writer=JSON.parse(request.body).username==='synthetic-writer';calls.push(writer?'seller':'ilker');
      return Response.json({ data:{ accessToken:writer?'synthetic-writer-session':'synthetic-reader-session',
        user:{permissions:['product.view','sales.view',...(writer?['sales.create']:[])]} } });
    } };
  assert.equal(await getErpAuthorization({...options,refresh:true}), 'Bearer synthetic-reader-session');
  assert.equal(await getErpAuthorization({...options,refresh:true,accountName:'seller'}), 'Bearer synthetic-writer-session');
  assert.equal(await getErpAuthorization(options), 'Bearer synthetic-reader-session');
  assert.equal(await getErpAuthorization({...options,accountName:'seller'}), 'Bearer synthetic-writer-session');
  assert.deepEqual(calls,['ilker','seller']);
  await assert.rejects(getErpAuthorization({...options,accountName:'seller',testEndpoints:resolveTestEndpoints({})}), /ERP_AUTH_REQUIRED/);
  await assert.rejects(getErpAuthorization({...options,accountName:'arbitrary'}), /ERP_AUTH_REQUIRED/);
  await assert.rejects(getErpAuthorization({...options,refresh:true,accountName:'seller',
    fetchFn:async()=>Response.json({data:{accessToken:'synthetic-reader-session',user:{permissions:['product.view','sales.view']}}})}), /ERP_AUTH_REQUIRED/);
});
