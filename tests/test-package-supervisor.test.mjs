import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {assertTestExecutionPackage} from '../deploy/test-supervisor.mjs';

test('source supervisor does not invoke package verification',()=>{
  assert.equal(assertTestExecutionPackage(path.resolve('fixture/source'),{},()=>{throw Error('unexpected')}),undefined);
});
test('package child recovery verifies the same root and exact pinned manifest before launch',()=>{
  const root=path.resolve('fixture/package'),pin='a'.repeat(64);let calls=0;
  const verify=input=>{calls++;assert.deepEqual(input,{packageRoot:root,manifestSha256:pin});return 'VERIFIED'};
  assert.equal(assertTestExecutionPackage(root,{CRM_TEST_PACKAGE_ROOT:root,CRM_TEST_PACKAGE_MANIFEST_SHA256:pin},verify),'VERIFIED');
  assert.equal(assertTestExecutionPackage(root,{CRM_TEST_PACKAGE_ROOT:root,CRM_TEST_PACKAGE_MANIFEST_SHA256:pin},verify),'VERIFIED');assert.equal(calls,2);
  assert.equal(assertTestExecutionPackage(root,{CRM_TEST_PACKAGE_ROOT:root,CRM_TEST_PACKAGE_MANIFEST_SHA256:pin.toUpperCase()},verify),'VERIFIED');assert.equal(calls,3);
});
test('partial pin, foreign execution root and altered payload never fall back to source mode',()=>{
  const root=path.resolve('fixture/package'),pin='a'.repeat(64);let calls=0;const verify=()=>{calls++;throw Error('PACKAGE_PAYLOAD_MISMATCH')};
  for(const env of [{CRM_TEST_PACKAGE_ROOT:root},{CRM_TEST_PACKAGE_MANIFEST_SHA256:pin},{CRM_TEST_PACKAGE_ROOT:root,CRM_TEST_PACKAGE_MANIFEST_SHA256:'bad'}])assert.throws(()=>assertTestExecutionPackage(root,env,verify),/PAIR_REQUIRED/);
  assert.throws(()=>assertTestExecutionPackage(path.resolve('fixture/foreign'),{CRM_TEST_PACKAGE_ROOT:root,CRM_TEST_PACKAGE_MANIFEST_SHA256:pin},verify),/ROOT_MISMATCH/);assert.equal(calls,0);
  assert.throws(()=>assertTestExecutionPackage(root,{CRM_TEST_PACKAGE_ROOT:root,CRM_TEST_PACKAGE_MANIFEST_SHA256:pin},verify),/PACKAGE_PAYLOAD_MISMATCH/);assert.equal(calls,1);
});
