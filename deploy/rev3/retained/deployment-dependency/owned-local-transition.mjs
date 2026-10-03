// Future fixed host entry. Import has no side effects. No runtime operation without an explicit approved request.
import {readFile,open,unlink,lstat,realpath,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createOwnedTransition,manifestHash} from './ownedTransition.mjs';
import {runBoundedHost,isPermissionDenial} from './boundedHost.mjs';
export const RELEASE_ROOT=path.resolve(fileURLToPath(new URL('./',import.meta.url)));
const root=RELEASE_ROOT,task=path.resolve(root,'..');
const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',node='C:\\Program Files\\nodejs\\node.exe';
const inside=(base,p)=>p.startsWith(base+path.sep);
export async function safePath(base,relative){
 base=path.resolve(base);
 if(typeof relative!=='string'||relative.includes(':')||relative.includes('\0')||path.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>!x||x==='.'||x==='..'||/^\.env(?:\.|$)|^\.npmrc$|^credentials(?:\.|$)/i.test(x)))throw Error('EXACT_RELATIVE_RELEASE_PATH_REQUIRED');
 const target=path.resolve(base,relative);if(!inside(base,target))throw Error('RELEASE_PATH_OUTSIDE_SCOPE');
 let current=base;
 for(const part of relative.split(/[\\/]/)){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('REPARSE_RELEASE_PATH_REJECTED');}
 if(!inside(await realpath(base),await realpath(target)))throw Error('RELEASE_REALPATH_OUTSIDE_SCOPE');return target;
}
export async function executeOwnedTransition(){
 const args=process.argv.slice(2);
 if(args.length!==2||!['--apply-owned-4212','--recover-owned-4212'].includes(args[0])||args[1]!=='--approved-exact-local-logout-origin')throw Error('EXPLICIT_REVIEWED_RUNTIME_SCOPE_REQUIRED');
 const mode=args[0].includes('recover')?'Recover':'Apply';
 const bytes=await readFile(path.join(root,'TRANSITION_MANIFEST.APPROVED.json')),manifest=JSON.parse(bytes);manifest.sha256=manifestHash(bytes);
 const approval=JSON.parse(await readFile(path.join(root,'TRANSITION_APPROVAL.json')));
 const releaseBytes=await readFile(path.join(root,'RELEASE_MANIFEST.json')),release=JSON.parse(releaseBytes);
 if(manifest.releaseSha256!==manifestHash(releaseBytes)||manifest.releaseRoot!==root||manifest.taskRoot!==task||manifest.ownerProcessSourceProof!=='reviewed-startup-receipt-plus-anonymous-client-hash')throw Error('FIXED_RELEASE_PROOF_REQUIRED');
 const apps='C:\\Users\\Xaser\\Documents\\Codex\\2026-05-20\\melisa-mini-erp-temiz-repoyu-bu\\melisa-erp-v2\\apps';
 const expectedNew={entry:'ui4212/serve-local-candidate.mjs',dist:'frontend/dist/client'};
 if(manifest.candidate.entry!==expectedNew.entry||manifest.candidate.dist!==expectedNew.dist||manifest.old.entry!=='CRM_LOCAL_DEV/local-catalog-media-dev/serve-local-candidate.mjs'||
  manifest.old.dist!=='CRM_LOCAL_DEV/local-catalog-media-dev/frontend-verified-4076f103-2026-10-01T15-46-50-851Z/client'||manifest.old.indexSha256!=='da9b1352730964a00829e68577d60f86eecedf406983f108c240a6047cea9e75')throw Error('FIXED_OLD_NEW_ENTRY_REQUIRED');
 const targets=["api/src/services/crmCatalogReadSource.mjs","api/src/routes/crmCatalogReadRoutes.js","whatsapp-crm-api/src/services/catalogBridge.mjs","whatsapp-crm-api/src/services/erpSourceContract.mjs","whatsapp-crm-api/src/middleware/catalogReadBudget.mjs","api/src/workers/crmExistingStockReadWorker.mjs","whatsapp-crm-api/src/services/catalogRouter.mjs","whatsapp-crm-api/src/routes/index.js","whatsapp-crm-api/src/middleware/security.js","whatsapp-crm-api/src/app.js","whatsapp-crm-api/src/config/env.js","whatsapp-crm-api/src/controllers/conversationController.js","whatsapp-crm-api/src/middleware/messageUploadParser.js","whatsapp-crm-api/src/providers/waapiProvider.js","whatsapp-crm-api/src/services/chatwootConversationService.js","whatsapp-crm-api/src/services/chatwootInboxService.js","whatsapp-crm-api/src/services/outboundAttemptService.js","whatsapp-crm-api/src/services/sendService.js","whatsapp-crm-api/src/services/waapiChatwootBridge.js","whatsapp-crm-api/src/services/waapiJournal.js","whatsapp-crm-api/src/services/waapiWebhookService.js","whatsapp-crm-api/src/utils/mediaFormatValidation.js","whatsapp-crm-api/src/utils/messageMedia.js","whatsapp-crm-api/src/config/boundedOwnerMediaActivation.js"].sort();
 if(!Array.isArray(release.backendTargets)||JSON.stringify(release.backendTargets.map(f=>f.file).sort())!==JSON.stringify(targets))throw Error('EXACT_TWENTY_FOUR_BACKEND_PINS_REQUIRED');
 // Existing entry emits only this nonsecret startup receipt. It supplements approved fresh metadata;
 // it does not attest process memory/loaded modules or replace current owner/creation verification.
 const receiptFile=await safePath(task,'CRM_LOCAL_DEV/local-catalog-media-dev/runtime.json');
 const startup=JSON.parse(await readFile(receiptFile));
 if(startup.pid!==manifest.oldOwner?.pid||startup.bind!=='127.0.0.1'||startup.port!==4212||startup.gateway!=='http://127.0.0.1:4200'||
  !Number.isFinite(Date.parse(startup.startedAt))||Date.parse(startup.startedAt)<Date.parse(manifest.oldOwner.createdUtc)||Date.parse(startup.startedAt)-Date.parse(manifest.oldOwner.createdUtc)>30000)throw Error('OWNED_NONSECRET_STARTUP_RECEIPT_REQUIRED');
 let journalRecords=[];
 async function readJournalChain(){
  const names=(await readdir(root)).filter(n=>/^TRANSITION_JOURNAL\.\d{6}\.json$/.test(n)).sort(),records=[];let previous=null;
  for(let i=0;i<names.length;i++){
   if(names[i]!==`TRANSITION_JOURNAL.${String(i+1).padStart(6,'0')}.json`)throw Error('JOURNAL_SEQUENCE_GAP_STOP');
   const bytes=await readFile(await safePath(root,names[i])),record=JSON.parse(bytes);
   if(record.sequence!==i+1||record.previousSha256!==previous)throw Error('JOURNAL_CHAIN_CHANGED_STOP');
   previous=manifestHash(bytes);records.push({name:names[i],sha256:previous,payload:record.payload});
  }return records;
 }
 const host=async(action,expected,expiresAt)=>runBoundedHost({command:powershell,args:['-NoProfile','-NonInteractive','-File',path.join(root,'owned-host-metadata.ps1'),'-Action',action,'-ApprovedOwned4212Runtime',...(expected?['-ExpectedOwnerJson',JSON.stringify(expected)]:[]),...(expiresAt?['-ApprovalExpiresAt',expiresAt]:[])]});
 const ports={
  now:Date.now,identity:async()=>({...await host('Identity'),pid:process.pid}),readOwner:()=>host('Probe'),verifyStopped:o=>host('Stopped',o),stopExact:async(o,guard)=>{if(!await host('Stop',o,guard.expiresAt))throw Error('STOP_OUTCOME_NOT_PROVEN')},
  verifyPins:async()=>{
   try{
    for(const f of release.files){const p=await safePath(root,f.file);if(manifestHash(await readFile(p))!==f.sha256)return false;}
    for(const f of release.backendTargets){const p=await safePath(apps,f.file);if(manifestHash(await readFile(p))!==f.candidateSha256)return false;}
    for(const f of release.oldUiPins){const p=await safePath(task,f.file);if(manifestHash(await readFile(p))!==f.sha256)return false;}
    return true;
   }catch(error){if(error.code==='EACCES'||error.code==='EPERM')throw Object.assign(Error('PIN_PERMISSION_DENIED_STOP'),{permissionDenied:true,code:'PIN_PERMISSION_DENIED_STOP'});return false;}
  },
  lock:async()=>{const p=path.join(root,'TRANSITION.lock');const handle=await open(p,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));await handle.sync();return async()=>{await handle.close();await unlink(p)};},
  loadJournal:async()=>{journalRecords=await readJournalChain();return journalRecords.at(-1)?.payload??null},
  saveJournal:async j=>{
   const existing=await readJournalChain();if(JSON.stringify(existing.map(r=>r.sha256))!==JSON.stringify(journalRecords.map(r=>r.sha256)))throw Error('CONCURRENT_JOURNAL_EDIT_STOP');
   const sequence=existing.length+1,name=`TRANSITION_JOURNAL.${String(sequence).padStart(6,'0')}.json`;
   const b=Buffer.from(JSON.stringify({sequence,previousSha256:existing.at(-1)?.sha256??null,payload:j},null,2));
   // Append-only + exclusive creation: never overwrite an edited record or a competing writer.
   const h=await open(path.join(root,name),'wx');try{await h.writeFile(b);await h.sync()}finally{await h.close()}
   journalRecords.push({name,sha256:manifestHash(b),payload:j});
  },
  launch:async(kind,_m,guard)=>{
   const config=manifest[kind==='candidate'?'candidate':'old'],base=kind==='candidate'?root:task;
   const entry=await safePath(base,config.entry),dist=await safePath(base,config.dist);
   if(!await ports.verifyPins()||!Number.isFinite(Date.parse(guard.expiresAt))||Date.now()>=Date.parse(guard.expiresAt))throw Error('FINAL_LAUNCH_PINS_OR_APPROVAL_EXPIRED');
   const child=spawn(node,[entry,'--activate-user-full','--dist',dist,'--index-sha256',config.indexSha256,...(kind==='candidate'?['--approved-local-catalog-logout-origin']:[])],{cwd:path.dirname(entry),windowsHide:true,detached:true,stdio:'ignore'});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref();
   for(let i=0;i<30;i++){const owner=await host('Probe');if(owner){if(owner.pid!==child.pid)throw Error('NEW_LAUNCH_OWNER_CONFLICT');return owner;}await new Promise(resolve=>setTimeout(resolve,100));}
   throw Error('SINGLE_LAUNCH_RECEIPT_UNCERTAIN');
  },
  smoke:async kind=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{const options={redirect:'error',cache:'no-store',signal:controller.signal};
    const page=await fetch('http://127.0.0.1:4212/',options);if(page.status!==200||manifestHash(Buffer.from(await page.arrayBuffer()))!==manifest[kind==='candidate'?'candidate':'old'].indexSha256)return false;
    for(const route of ['/api/live/auth/me','/api/live/crm/catalog/products'])if((await fetch('http://127.0.0.1:4212'+route,options)).status!==401)return false;
    return true;
   }catch(error){if(isPermissionDenial(error))throw Object.assign(Error('SMOKE_PERMISSION_DENIED_STOP'),{permissionDenied:true,code:'SMOKE_PERMISSION_DENIED_STOP'});return false}finally{clearTimeout(timer)}
  },
 };
 return createOwnedTransition(ports).run({manifest,approval,mode});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await executeOwnedTransition();console.log(JSON.stringify({state:result.state,port:4212,bind:'127.0.0.1',actualUserAcceptance:'NOT_RUN'}))}
 catch(error){console.error(JSON.stringify({status:'STOP',code:/^[A-Z0-9_]+$/.test(error.code||error.message)?error.code||error.message:'TRANSITION_FAILED_STOP'}));process.exitCode=1;}
}
