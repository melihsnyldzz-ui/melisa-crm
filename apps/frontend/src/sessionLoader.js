// One user-driven login/resume at a time; logout invalidates even non-abortable
// transports. Credentials/tokens are never stored here beyond the active call.
export function createSessionLoader({api,onCommit,onError,onBusy}) {
  let generation=0, active=null;
  const current=operation=>active===operation && operation.generation===generation && !operation.controller.signal.aborted;
  function invalidate() { generation++; active?.controller.abort(); active=null; }
  function start({token='',credentials=null}={}) {
    if(active?.pending) return active.promise;
    invalidate();
    const operation={generation,controller:new AbortController(),pending:true,promise:null};active=operation;
    onBusy(true);
    operation.promise=(async()=>{
      try {
        const signal=operation.controller.signal;
        let key=token;
        if(credentials){const result=await api.login(credentials.username,credentials.password,{signal});if(!current(operation))return null;key=result.accessToken;}
        if(!key)throw new Error('CRM oturumu gerekli.');
        const session=await api.session(key,{signal});if(!current(operation))return null;
        const [inbox,agents]=await Promise.all([
          api.inbox(key,0,{signal}),
          session.canAssign?api.agents(key,{signal}).catch(error=>{if(error?.name==='AbortError'||error?.status===401)throw error;return {agents:[]};}):Promise.resolve({agents:[]}),
        ]);
        if(!current(operation))return null;
        const result={key,session,inbox,agents};onCommit(result);return result;
      }catch(error){if(current(operation))onError(error);return null;}
      finally {if(current(operation)){operation.pending=false;onBusy(false);}}
    })();
    return operation.promise;
  }
  return {start,invalidate,isPending:()=>Boolean(active?.pending)};
}
export function sessionReadIsCurrent({active=true,key,currentKey,epochCurrent=true,recipientId,currentRecipientId}) {
  return Boolean(active && key && currentKey===key && epochCurrent && (recipientId===undefined || String(recipientId)===String(currentRecipientId)));
}
