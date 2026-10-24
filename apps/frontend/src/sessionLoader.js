import {createTerminalSessionConsumer} from './terminalSessionIdentity.js';

export const createTerminalSessionLoader=options=>createTerminalSessionConsumer(createSessionLoader,options);

// One user-driven login/resume at a time; logout invalidates even non-abortable
// transports. Credentials/tokens are never stored here beyond the active call.
export function createSessionLoader({api,onCommit,onError,onBusy,onAgents=()=>{},onAgentsState=()=>{},now=Date.now}) {
  let generation=0, active=null;
  const current=operation=>active===operation && operation.generation===generation && !operation.controller.signal.aborted;
  function invalidate() { generation++; active?.controller.abort(); active=null; }
  function readAgents(operation) {
    if(!current(operation)||!operation.key||!operation.session?.canAssign)return Promise.resolve(null);
    if(operation.agentsPending)return operation.agentsPending;
    const revision=operation.agentsRevision||0;
    onAgentsState({busy:true,error:''});
    operation.agentsPending=(async()=>{
      try{const result=await api.agents(operation.key,{signal:operation.controller.signal});if(current(operation)&&revision===(operation.agentsRevision||0))onAgents(result);return result;}
      catch(error){if(current(operation)){if([401,403].includes(error.status))onError(error);else if(revision===(operation.agentsRevision||0))onAgentsState({error:error.message||'Temsilciler alınamadı. Yeniden deneyin.'});}return null;}
      finally{operation.agentsPending=null;if(current(operation)&&revision===(operation.agentsRevision||0))onAgentsState({busy:false});}
    })();return operation.agentsPending;
  }
  function start({token='',credentials=null,resume=false,requireResume=false}={}) {
    if(active?.pending) return active.promise;
    invalidate();
    const operation={generation,controller:new AbortController(),pending:true,promise:null};active=operation;
    onBusy(true);
    operation.promise=(async()=>{
      try {
        const signal=operation.controller.signal;
        let key=token,normalResult=null;
        if(credentials){normalResult=await api.login(credentials.username,credentials.password,{signal});if(!current(operation))return null;key=normalResult.accessToken;}
        else if(resume){normalResult=await api.resumeNormalSession({signal});if(!current(operation))return null;if(!normalResult){if(requireResume)throw Object.assign(new Error('Oturum sona erdi. Yeniden giriş yapın.'),{status:401});return null;}key=normalResult.accessToken;}
        if(!key)throw new Error('CRM oturumu gerekli.');
        const session=await api.session(key,{signal});if(!current(operation))return null;
        if(normalResult&&api.rememberNormalSession){await api.rememberNormalSession(normalResult,session);if(!current(operation))return null;}
        const permissionReadAt=now();
        const inbox=await api.inbox(key,0,{view:'bootstrap',signal});const inboxReadAt=now();
        if(!current(operation))return null;
        const result={key,session,inbox,agents:{agents:[]},permissionReadAt,inboxReadAt};onCommit(result);
        operation.key=key;operation.session=session;void readAgents(operation);return result;
      }catch(error){if(current(operation))onError(error,{resume});return null;}
      finally {if(current(operation)){operation.pending=false;onBusy(false);}}
    })();
    return operation.promise;
  }
  async function refreshAgents({afterMutation=false}={}) {
    const operation=active;if(!operation||!current(operation)||!operation.key||!operation.session?.canAssign)return null;
    if(!afterMutation)return readAgents(operation);
    operation.agentsRevision=(operation.agentsRevision||0)+1;
    onAgentsState({busy:true,error:''});
    if(operation.agentsPending)await operation.agentsPending;
    return current(operation)?readAgents(operation):null;
  }
  return {start,invalidate,refreshAgents,isPending:()=>Boolean(active?.pending)};
}
export function sessionReadIsCurrent({active=true,key,currentKey,epochCurrent=true,recipientId,currentRecipientId}) {
  return Boolean(active && key && currentKey===key && epochCurrent && (recipientId===undefined || String(recipientId)===String(currentRecipientId)));
}
