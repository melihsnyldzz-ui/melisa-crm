// No OS, network, file or process access. Host operations are injected and bounded by the fixed release.
import {createHash} from 'node:crypto';
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=code=>{throw Object.assign(Error(code),{code})};
export const NORMAL_SID='S-1-5-21-2170750028-1005938530-2568122015-1001';
export const OWNER_FIELDS=['pid','parentPid','createdUtc','executablePath','sid','elevated'];
export function sameOwner(a,b){return !!a&&!!b&&OWNER_FIELDS.every(k=>a[k]===b[k])&&JSON.stringify(a.binds)===JSON.stringify(b.binds)}
function assertOwner(o){
 if(!o||!Number.isSafeInteger(o.pid)||o.pid<1||!Number.isSafeInteger(o.parentPid)||o.parentPid<0||
  !Number.isFinite(Date.parse(o.createdUtc))||o.executablePath!=='C:\\Program Files\\nodejs\\node.exe'||o.sid!==NORMAL_SID||o.elevated!==false||
  JSON.stringify(o.binds)!==JSON.stringify(['127.0.0.1']))fail('EXACT_NORMAL_LOOPBACK_OWNER_REQUIRED');
}
export function createOwnedTransition(ports){
 const required=['now','identity','readOwner','verifyStopped','verifyPins','stopExact','launch','smoke','loadJournal','saveJournal','lock'];
 if(required.some(k=>typeof ports[k]!=='function'))fail('FIXED_HOST_PORTS_REQUIRED');
 async function approve(m,a,mode){
  const n=ports.now(),identity=await ports.identity();
  if(identity.sid!==NORMAL_SID||identity.elevated!==false)fail('NORMAL_XASER_EXECUTION_REQUIRED');
  if(!a||!['issuedAt','expiresAt','ownerObservedAt'].every(k=>Number.isFinite(Date.parse(a[k])))||a.mode!==mode||a.manifestSha256!==m.sha256||a.scope!=='owned-4212-transition-only'||a.localLogoutOriginApproved!==true||
   !/^[a-f0-9]{64}$/.test(a.nonce||'')||Date.parse(a.issuedAt)>n||Date.parse(a.expiresAt)<=n||
   Date.parse(a.expiresAt)-Date.parse(a.issuedAt)>90000||n-Date.parse(a.ownerObservedAt)>30000||Date.parse(a.ownerObservedAt)>n)fail('FRESH_EXACT_TRANSITION_APPROVAL_REQUIRED');
  assertOwner(a.owner);
 }
 async function pins(m){if(!await ports.verifyPins(m))fail('CONCURRENT_SOURCE_OR_RELEASE_EDIT_STOP');}
 const write=async(j)=>{await ports.saveJournal(clone(j));};
 async function freshness(a){const n=ports.now();if(!Number.isFinite(Date.parse(a.expiresAt))||n>=Date.parse(a.expiresAt))fail('TRANSITION_APPROVAL_EXPIRED_STOP');}
 async function stop(m,a,j,owner){
  await pins(m);await freshness(a);const fresh=await ports.readOwner();
  if(!sameOwner(owner,fresh))fail('OWNER_CHANGED_BEFORE_STOP');
  assertOwner(fresh);j.stopIntent=clone(owner);await write(j);
  await pins(m);await freshness(a);
  await ports.stopExact(owner,{expiresAt:a.expiresAt});if(!await ports.verifyStopped(owner))fail('STOP_OUTCOME_UNCONFIRMED_NO_RETRY');
  j.stoppedConfirmed=true;await write(j);
 }
 async function launch(m,a,j,kind){
  await pins(m);await freshness(a);
  if(await ports.readOwner())fail('PORT_CONFLICT_NO_LAUNCH');
  // Journal before launch: a crash/missing receipt is permanently uncertain, never a second start.
  j.launchIntent={kind,issuedAt:new Date(ports.now()).toISOString()};j.launchReceipt=null;await write(j);
  if(await ports.readOwner())fail('PORT_CHANGED_AFTER_LAUNCH_INTENT');
  await pins(m);await freshness(a);
  const receipt=await ports.launch(kind,m,{expiresAt:a.expiresAt});assertOwner(receipt);
  if(receipt.parentPid!==await ports.identity().then(x=>x.pid)||Date.parse(receipt.createdUtc)<Date.parse(j.launchIntent.issuedAt))fail('LAUNCH_RECEIPT_BINDING_MISMATCH');
  j.launchReceipt=clone(receipt);await write(j);
  const fresh=await ports.readOwner();if(!sameOwner(receipt,fresh))fail('LAUNCHED_OWNER_NOT_VERIFIED');
  await pins(m);await freshness(a);if(!await ports.smoke(kind,m))fail('ANONYMOUS_RELEASE_SMOKE_FAILED');
  j.state=kind==='candidate'?'APPLIED_4212':'RECOVERED_OLD_4212';await write(j);return clone(j);
 }
 async function run({manifest:m,approval:a,mode='Apply'}){
  if(!m||!/^[a-f0-9]{64}$/.test(m.sha256||''))fail('PINNED_MANIFEST_REQUIRED');
  if(!['Apply','Recover'].includes(mode))fail('EXACT_TRANSITION_MODE_REQUIRED');
  await approve(m,a,mode);const unlock=await ports.lock();let journal,touched=false;
  try{
   await pins(m);journal=await ports.loadJournal();
   if(mode==='Apply'){
    if(journal)fail('SINGLE_USE_JOURNAL_EXISTS');
    const owner=await ports.readOwner();if(!sameOwner(a.owner,owner)||!sameOwner(m.oldOwner,owner))fail('FRESH_APPROVED_OWNER_MISMATCH');
    if(!await ports.smoke('old',m))fail('OWNED_BEFORE_IMAGE_SMOKE_REQUIRED');
    journal={version:1,manifestSha256:m.sha256,nonce:a.nonce,state:'PREPARED',oldOwner:clone(owner),stoppedConfirmed:false,stopIntent:null,launchIntent:null,launchReceipt:null,recoveryIntent:null};touched=true;await write(journal);
    await stop(m,a,journal,owner);return await launch(m,a,journal,'candidate');
   }
   if(!journal||journal.version!==1||journal.manifestSha256!==m.sha256||!sameOwner(journal.oldOwner,m.oldOwner)||a.nonce===journal.nonce)fail('EXACT_EXISTING_RECOVERY_JOURNAL_REQUIRED');
   if(journal.state==='PERMISSION_DENIED_TERMINAL')fail('PREVIOUS_PERMISSION_DENIAL_REQUIRES_SEPARATE_REVIEW');
   if(journal.state==='HOST_OPERATION_UNCERTAIN_NO_RETRY')fail('HOST_OPERATION_UNCERTAIN_REQUIRES_SEPARATE_RECONCILIATION');
   if(journal.state==='RECOVERED_OLD_4212')fail('RECOVERY_ALREADY_COMPLETE');
   if(journal.recoveryIntent&&!journal.recoveryReceipt)fail('RECOVERY_LAUNCH_UNCERTAIN_NO_RETRY');
   if(journal.launchIntent&&!journal.launchReceipt)fail('CANDIDATE_LAUNCH_UNCERTAIN_NO_RETRY');
   const current=await ports.readOwner();touched=true;
   if(sameOwner(current,journal.oldOwner)){
    if(journal.launchIntent||!sameOwner(current,a.owner))fail('RECOVERY_OLD_OWNER_CONFLICT');
    if(!await ports.smoke('old',m))fail('RECOVERY_OLD_SMOKE_FAILED');journal.state='RECOVERED_OLD_4212';await write(journal);return clone(journal);
   }
   if(current){
    if(!journal.launchReceipt||!sameOwner(current,journal.launchReceipt)||!sameOwner(current,a.owner))fail('RECOVERY_UNOWNED_LISTENER_STOP');
    await stop(m,a,journal,current);
   }else if(!journal.stoppedConfirmed||!await ports.verifyStopped(journal.oldOwner))fail('RECOVERY_STOP_NOT_PROVEN');
   // Separate durable recovery marker survives any exception/crash; no implicit automatic rollback.
   journal.recoveryIntent={issuedAt:new Date(ports.now()).toISOString(),nonce:a.nonce};await write(journal);
   const result=await launch(m,a,journal,'old');journal.recoveryReceipt=clone(result.launchReceipt);await write(journal);return clone(journal);
  }catch(error){
   if(journal&&touched){journal.state=error?.permissionDenied?'PERMISSION_DENIED_TERMINAL':error?.operationUncertain?'HOST_OPERATION_UNCERTAIN_NO_RETRY':'STOPPED_REVIEW_REQUIRED';journal.errorCode=/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'HOST_OPERATION_FAILED_STOP';await write(journal);}
   throw error;
  }finally{await unlock();}
 }
 return {run};
}
export const manifestHash=bytes=>createHash('sha256').update(bytes).digest('hex');
