import {createRememberedNormalSession} from './nativeSessionBridge.js';

const semihId='crm-semih-test-20261012';
const semihPermissions=['crm.view','crm.send','crm.assign','crm.agents','crm.manage'];
const invalid=()=>Object.assign(Error('Kaydedilen TEST hesabı doğrulanamadı. Yeniden giriş yapın.'),{status:401});
export function isSemihTestUser(user) {
  return Boolean(user?.id===semihId&&user.username==='crm-semih-test'&&user.displayName==='Semih TEST'
    &&user.role==='patron'&&!user.testAdmin&&!user.testPersonnel
    &&user.normalTestScope?.semihTestContinue===true&&user.normalTestScope.isolatedPreparation===true
    &&user.normalTestScope.database==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    &&Array.isArray(user.permissions)&&user.permissions.length===semihPermissions.length
    &&semihPermissions.every(permission=>user.permissions.includes(permission)));
}
export function rememberedSessionMetadata(result) {
  if(result?.enabled!==true)return {enabled:false,user:null};
  if(result.user!==null&&!isSemihTestUser(result.user))throw invalid();
  return {enabled:true,user:result.user};
}
export function initialSessionAction({remembered,testAdminEnabled,manualTestLogin,native=false}) {
  if(remembered.enabled)return remembered.user?'continue':native?'resume':'login';
  return testAdminEnabled&&!manualTestLogin?'test-admin':'resume';
}

// The refresh grant is an HttpOnly cookie owned by the browser. Only a verified
// identity is returned to the entry screen; /me still precedes every UI commit.
// Mutations share a queue so logout also revokes a late login/refresh response.
export function createBrowserNormalSession({inspect,refresh,logout,nativeRefresh,nativeLogout,logoutAccess}) {
  const fallback=createRememberedNormalSession({bridge:null,refresh:nativeRefresh,logout:nativeLogout,logoutAccess});
  let generation=0,queue=Promise.resolve(),enabled=false,fallbackEpoch;
  const fallbackEpochs=new WeakMap();
  const serialize=fn=>{const call=queue.then(fn);queue=call.catch(()=>{});return call;};
  async function probe(options={}){const epoch=generation,result=rememberedSessionMetadata(await inspect(options));if(epoch!==generation||options.signal?.aborted)return {enabled:false,user:null};enabled=result.enabled;return result;}
  function clear(options){generation++;return serialize(async()=>{await fallback.clear(enabled?undefined:options);if(enabled)await logout();});}
  return {
    probe,
    async begin(options){const closed=clear(options),epoch=generation;await closed;fallbackEpoch=await fallback.begin();return epoch;},
    authenticate: (authenticate,epoch)=>serialize(async()=>{if(epoch!==generation)return null;const result=await authenticate();if(isSemihTestUser(result?.user)&&!result.refreshToken)enabled=true;return result;}),
    async remember(result,user,epoch){
      if(epoch!==generation)return false;
      if(isSemihTestUser(result?.user)&&!result.refreshToken){if(!isSemihTestUser(user))throw invalid();enabled=true;return true;}
      return fallback.remember(result,user,fallbackEpochs.get(result)??fallbackEpoch);
    },
    resume(options={}){
      const epoch=generation;
      return serialize(async()=>{
        if(epoch!==generation||options.signal?.aborted)return null;
        const remembered=await probe(options);
        if(epoch!==generation||options.signal?.aborted)return null;
        if(remembered.enabled&&remembered.user){
          const result=await refresh(options);
          if(epoch!==generation||options.signal?.aborted)return null;
          if(!isSemihTestUser(result?.user)||typeof result.accessToken!=='string'||!result.accessToken||result.refreshToken)throw invalid();
          return {result,epoch};
        }
        const resumed=await fallback.resume(options);
        if(epoch!==generation||options.signal?.aborted||!resumed)return null;
        fallbackEpochs.set(resumed.result,resumed.epoch);return {result:resumed.result,epoch};
      });
    },
    clear,
  };
}
