const ROLE_LOGIN_KEY='melisa-crm-test-role-login';
export function testAdminAvailable(location=globalThis.location,buildEnabled=import.meta.env?.VITE_CRM_TEST==='1') {
  return buildEnabled && location?.origin==='http://127.0.0.1:62400';
}
export function testRoleLogin(storage) {
  try{return (storage??globalThis.sessionStorage)?.getItem(ROLE_LOGIN_KEY)==='1';}catch{return false;}
}
export function chooseTestRoleLogin(value,storage) {
  try{const target=storage??globalThis.sessionStorage;value?target?.setItem(ROLE_LOGIN_KEY,'1'):target?.removeItem(ROLE_LOGIN_KEY);}catch{}
}
export async function bootstrapTestAdmin({signal,fetchFn=fetch}={}) {
  const response=await fetchFn('/api/test-admin/session',{method:'POST',signal,headers:{'Content-Type':'application/json'}});
  if(!response.ok)throw Error('TEST ADMIN oturumu açılamadı. Yeniden deneyin.');
  const result=await response.json();
  if(typeof result.accessToken!=='string'||!result.accessToken)throw Error('TEST ADMIN oturumu doğrulanamadı.');
  return result.accessToken;
}
