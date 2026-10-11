const nativeBridges=new WeakMap();let nativeSerial=0;
export function createNativeSessionBridge({window:host=globalThis.window,timeoutMs=5000}={}) {
  const origin=host?.location?.origin;
  if(!['http://192.168.1.46:62700','http://127.0.0.1:62700'].includes(origin)||typeof host?.MelisaProtectedSession?.postMessage!=='function')return null;
  const native=host.MelisaProtectedSession;
  if(nativeBridges.has(native))return nativeBridges.get(native);
  const pending=new Map();let queue=Promise.resolve();
  native.onmessage=event=>{
    let result;try{result=JSON.parse(event.data);}catch{return;}
    if(result?.v!==1||typeof result.id!=='string'||typeof result.ok!=='boolean')return;
    const call=pending.get(result.id);if(!call)return;pending.delete(result.id);clearTimeout(call.timer);
    result.ok?call.resolve(result.session??null):call.reject(Error('Cihaz oturumu saklanamadı. Yeniden giriş yapın.'));
  };
  function direct(action,session){return new Promise((resolve,reject)=>{
    const id=`crm_${Date.now()}_${++nativeSerial}`,timer=setTimeout(()=>{pending.delete(id);reject(Error('Cihaz oturumu yanıt vermedi.'));},timeoutMs);
    pending.set(id,{resolve,reject,timer});
    try{native.postMessage(JSON.stringify({v:1,id,action,...(action==='put'?{session}:{})}));}catch{clearTimeout(timer);pending.delete(id);reject(Error('Cihaz oturumu kullanılamıyor.'));}
  });}
  function call(action,session){const next=queue.then(()=>direct(action,session));queue=next.catch(()=>{});return next;}
  const bridge={get:()=>call('get'),put:session=>call('put',session),clear:()=>call('clear')};nativeBridges.set(native,bridge);return bridge;
}

const invalid=()=>Object.assign(Error('Hesap oturumu değişti. Yeniden giriş yapın.'),{status:401});
function recordOf(result){
  const user=result?.user;
  if(typeof result?.accessToken!=='string'||!result.accessToken||typeof result.refreshToken!=='string'||!result.refreshToken||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=0||typeof user?.id!=='string'||!user.id||typeof user.username!=='string'||!user.username||user.testAdmin||user.testPersonnel)throw invalid();
  return {accessToken:result.accessToken,refreshToken:result.refreshToken,userId:user.id,username:user.username,expiresAt:result.expiresAt};
}
function sameUser(record,user){return record.userId===String(user?.id??'')&&record.username===user?.username&&!user?.testAdmin&&!user?.testPersonnel;}

// No browser storage of credentials or tokens. Reopening always rotates a
// server-verified grant, then /auth/me establishes the visible identity.
export function createRememberedNormalSession({bridge,refresh,logout}) {
  let generation=0,record=null,queue=Promise.resolve();
  const serialize=fn=>{const call=queue.then(fn);queue=call.catch(()=>{});return call;};
  function clear(){
    const old=record;generation++;record=null;
    return serialize(async()=>{
      let saved=old,failure=null;
      if(!saved)try{saved=await bridge?.get();}catch(error){failure=error;}
      try{await bridge?.clear();}catch(error){failure??=error;}
      if(saved?.refreshToken)try{await logout(saved.refreshToken);}catch(error){failure??=error;}
      if(failure)throw Error('Oturumun kapanışı doğrulanamadı. Bağlantınızı kontrol edin.');
    });
  }
  return {
    async begin(){const closed=clear(),epoch=generation;await closed;return epoch;},
    async remember(result,user,epoch){
      if(epoch!==generation)return false;
      if(!result?.refreshToken)return false;
      const next=recordOf(result);if(!sameUser(next,user))throw invalid();
      await serialize(async()=>{if(epoch!==generation)return;record=next;await bridge?.put(next);});return epoch===generation;
    },
    async resume({signal}={}){
      const epoch=generation;
      const saved=record||await serialize(()=>bridge?.get());
      if(epoch!==generation||signal?.aborted||!saved)return null;
      const result=await refresh(saved.refreshToken,{signal});
      if(epoch!==generation||signal?.aborted)return null;
      const next=recordOf(result);if(!sameUser(saved,result.user)||next.userId!==saved.userId)throw invalid();
      // Refresh already validated the persisted normal identity and current
      // server fingerprint. Preserve the rotated secret even if the following
      // /me or inbox read has a transient failure; never commit UI permissions here.
      await serialize(async()=>{if(epoch!==generation)return;record=next;await bridge?.put(next);});
      if(epoch!==generation||signal?.aborted)return null;
      return {result,epoch};
    },
    clear,
  };
}
