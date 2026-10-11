import test from 'node:test';
import assert from 'node:assert/strict';
import {SEMIH_TEST_COOKIE,SEMIH_TEST_REQUEST_PROOF_COOKIE,semihCookieToken,semihSameOrigin,semihBrowserLogin,writeSemihCookie,clearSemihCookie,clearRejectedSemihCookie} from './semihTestCookie.mjs';
const req=headers=>({get:name=>headers[name],is:content=>content==='application/json'&&headers['content-type']==='application/json'});
test('Semih cookie writes require exact TEST Origin and JSON independently of CORS',()=>{
 for(const origin of ['http://127.0.0.1:62700','http://192.168.1.46:62700'])assert.equal(semihBrowserLogin(req({origin,'content-type':'application/json','sec-fetch-site':'same-origin'})),true);
 for(const headers of [{},{origin:'http://127.0.0.1:62701','content-type':'application/json'},{origin:'http://192.168.1.47:62700','content-type':'application/json'},{origin:'https://attacker.invalid','content-type':'application/json'},{origin:'http://127.0.0.1:62700','content-type':'text/plain'},{origin:'http://127.0.0.1:62700','content-type':'application/json','sec-fetch-site':'cross-site'}])assert.throws(()=>semihSameOrigin(req(headers),{write:true}),{statusCode:403});
});

test('owned request proof has exact loopback origin and an independent cookie namespace',()=>{
 const keys=['CRM_CUSTOMER_PRODUCT_REQUEST_PROOF','CRM_UI_ORIGIN','CRM_ISOLATED_PREPARATION','CRM_TEST_EXPECTED_DATABASE','CRM_SEMIH_TEST_CONTINUE_ENABLED'];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const proof={CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'true',CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_SEMIH_TEST_CONTINUE_ENABLED:'true'};
 const regularToken='a'.repeat(43),proofToken='b'.repeat(43),cookies=`${SEMIH_TEST_COOKIE}=${regularToken}; ${SEMIH_TEST_REQUEST_PROOF_COOKIE}=${proofToken}`;
 try{
  Object.assign(process.env,proof);
  assert.equal(semihBrowserLogin(req({origin:proof.CRM_UI_ORIGIN,'content-type':'application/json'})),true);
  assert.equal(semihCookieToken(req({cookie:cookies})),proofToken);
  assert.equal(semihCookieToken(req({cookie:`${SEMIH_TEST_COOKIE}=${regularToken}`})),null);
  for(const origin of ['http://127.0.0.1:62700','http://192.168.1.46:62700','http://127.0.0.1:62801','http://192.168.1.46:62800','https://attacker.invalid'])assert.equal(semihBrowserLogin(req({origin,'content-type':'application/json'})),false);
  assert.equal(semihBrowserLogin(req({origin:proof.CRM_UI_ORIGIN,'content-type':'application/json','sec-fetch-site':'same-site'})),false);
  let written,cleared;const res={cookie:(...args)=>written=args,clearCookie:(...args)=>cleared=args};
  const visible=writeSemihCookie(res,{refreshToken:proofToken,refreshExpiresAt:100000,accessToken:'offline-access'});
  assert.equal(written[0],SEMIH_TEST_REQUEST_PROOF_COOKIE);assert.equal(visible.refreshToken,undefined);
  clearSemihCookie(res);assert.equal(cleared[0],SEMIH_TEST_REQUEST_PROOF_COOKIE);
  cleared=null;clearRejectedSemihCookie(req({cookie:`${SEMIH_TEST_COOKIE}=${regularToken}`,origin:proof.CRM_UI_ORIGIN}),res,{statusCode:401});assert.equal(cleared,null);
  for(const change of [{CRM_ISOLATED_PREPARATION:'false'},{CRM_TEST_EXPECTED_DATABASE:'LIVE'},{CRM_UI_ORIGIN:'http://127.0.0.1:62801'},{CRM_SEMIH_TEST_CONTINUE_ENABLED:'false'}]){
   Object.assign(process.env,proof,change);assert.equal(semihBrowserLogin(req({origin:proof.CRM_UI_ORIGIN,'content-type':'application/json'})),false);
   assert.equal(semihCookieToken(req({cookie:`${SEMIH_TEST_COOKIE}=${regularToken}`})),null);
  }
  Object.assign(process.env,proof);delete process.env.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF;
  assert.equal(semihCookieToken(req({cookie:cookies})),regularToken);
  assert.equal(semihCookieToken(req({cookie:`${SEMIH_TEST_REQUEST_PROOF_COOKIE}=${proofToken}`})),null);
  assert.equal(semihBrowserLogin(req({origin:proof.CRM_UI_ORIGIN,'content-type':'application/json'})),false);
 }finally{for(const[key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('remembered GET allows same-origin browser metadata and rejects foreign/cross-site reads',()=>{
 assert.doesNotThrow(()=>semihSameOrigin(req({})));assert.doesNotThrow(()=>semihSameOrigin(req({'sec-fetch-site':'same-origin'})));
 for(const headers of [{origin:'https://attacker.invalid'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}])assert.throws(()=>semihSameOrigin(req(headers)),{statusCode:403});
});
test('opaque cookie parser rejects duplicate/malformed values and cookie result cannot leak its refresh secret',()=>{
 const token='a'.repeat(43);assert.equal(semihCookieToken(req({})),null);assert.equal(semihCookieToken(req({cookie:`other=public; ${SEMIH_TEST_COOKIE}=${token}`})),token);
 assert.throws(()=>semihCookieToken(req({cookie:`${SEMIH_TEST_COOKIE}=bad`})),{statusCode:401});assert.throws(()=>semihCookieToken(req({cookie:`${SEMIH_TEST_COOKIE}=${token}; ${SEMIH_TEST_COOKIE}=${token}`})),{statusCode:403});
 let written,cleared;const response={cookie:(...args)=>written=args,clearCookie:(...args)=>cleared=args};
 const result=writeSemihCookie(response,{refreshToken:token,accessToken:'offline-access',refreshExpiresAt:100000});assert.equal(result.refreshToken,undefined);assert.equal(result.accessToken,'offline-access');
 assert.equal(written[0],SEMIH_TEST_COOKIE);assert.equal(written[1],token);assert.deepEqual(written[2],{httpOnly:true,sameSite:'strict',path:'/api/live/auth',expires:new Date(100000)});assert.equal(written[2].domain,undefined);
 clearSemihCookie(response);assert.deepEqual(cleared,[SEMIH_TEST_COOKIE,{httpOnly:true,sameSite:'strict',path:'/api/live/auth'}]);
});
test('auth rejection cannot erase cookies from foreign/same-site contexts; trusted TEST UI cleanup is allowed',()=>{
 const cookie=`${SEMIH_TEST_COOKIE}=${'a'.repeat(43)}`;
 for(const headers of [{},{origin:'http://127.0.0.1:62701'},{origin:'http://127.0.0.1:62700','sec-fetch-site':'same-site'},{'sec-fetch-site':'same-site',referer:'http://127.0.0.1:62701/'},{'sec-fetch-site':'same-origin',referer:'http://127.0.0.1:62701/'}]){
  let cleared=false;clearRejectedSemihCookie(req({cookie,...headers}),{clearCookie:()=>{cleared=true;}},{statusCode:401});assert.equal(cleared,false);
 }
 for(const headers of [{origin:'http://127.0.0.1:62700'},{'sec-fetch-site':'same-origin',referer:'http://192.168.1.46:62700/'}]){
  let cleared=false;clearRejectedSemihCookie(req({cookie,...headers}),{clearCookie:()=>{cleared=true;}},{statusCode:401});assert.equal(cleared,true);
 }
 let cleared=false;clearRejectedSemihCookie(req({cookie,origin:'http://127.0.0.1:62700'}),{clearCookie:()=>{cleared=true;}},{statusCode:403,code:'AUTH_TEST_ORIGIN_REQUIRED'});assert.equal(cleared,false);
});
