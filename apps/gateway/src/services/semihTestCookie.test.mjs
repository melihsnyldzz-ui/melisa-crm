import test from 'node:test';
import assert from 'node:assert/strict';
import {SEMIH_TEST_COOKIE,semihCookieToken,semihSameOrigin,semihBrowserLogin,writeSemihCookie,clearSemihCookie,clearRejectedSemihCookie} from './semihTestCookie.mjs';
const req=headers=>({get:name=>headers[name],is:content=>content==='application/json'&&headers['content-type']==='application/json'});
test('Semih cookie writes require exact TEST Origin and JSON independently of CORS',()=>{
 for(const origin of ['http://127.0.0.1:62700','http://192.168.1.46:62700'])assert.equal(semihBrowserLogin(req({origin,'content-type':'application/json','sec-fetch-site':'same-origin'})),true);
 for(const headers of [{},{origin:'http://127.0.0.1:62701','content-type':'application/json'},{origin:'http://192.168.1.47:62700','content-type':'application/json'},{origin:'https://attacker.invalid','content-type':'application/json'},{origin:'http://127.0.0.1:62700','content-type':'text/plain'},{origin:'http://127.0.0.1:62700','content-type':'application/json','sec-fetch-site':'cross-site'}])assert.throws(()=>semihSameOrigin(req(headers),{write:true}),{statusCode:403});
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
