import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),workspace=path.dirname(root);
const prior=path.join(workspace,'CRM_UNIFIED_ORCHESTRATOR_DEV_20261002');
const run=path.join(prior,'runs/run-20261002T184156594Z-0e3e5e6a');
const sha=b=>createHash('sha256').update(b).digest('hex');
const evidence=[];
for(const name of ['RESULT.json','backend-result.json','abort.json']){
 const bytes=await readFile(path.join(run,name));evidence.push({file:name,sha256:sha(bytes)});
}
const result=JSON.parse(await readFile(path.join(run,'RESULT.json'),'utf8'));
const backend=JSON.parse(await readFile(path.join(run,'backend-result.json'),'utf8'));
const lockSha=sha(await readFile(path.join(prior,'ACTIVE_INSTALL.lock')));
const manifest=JSON.parse(await readFile(path.join(root,'deployment-dependency/controlled-install/FIRST_PAGE_CANDIDATE_MANIFEST.json'),'utf8'));
const apps='C:\\Users\\Xaser\\Documents\\Codex\\2026-05-20\\melisa-mini-erp-temiz-repoyu-bu\\melisa-erp-v2\\apps';
const targets=[];
for(const file of manifest.files){
 const target=path.join(apps,file.path);let current=null;
 try{current=sha(await readFile(target))}catch(error){if(error.code!=='ENOENT')throw error}
 const state=!current&&!file.baseSha256?'EXPECTED_ABSENT':current===file.baseSha256?'BASE_MATCH':current===file.candidateSha256?'CANDIDATE_MATCH':'DRIFT';
 targets.push({path:file.path,state});
}
const proof={observedAt:new Date().toISOString(),priorRun:path.relative(workspace,run),priorState:result.state,
 priorComplete:result.complete,priorAttentionRequired:result.attentionRequired,priorBackendCode:backend.error?.code||backend.code,
 priorMutationFlagMeaning:'Invocation intent; not evidence of source installation',lockPreserved:true,lockSha256:lockSha,
 evidence,targets,baseMatches:targets.filter(t=>t.state==='BASE_MATCH').length,
 absentMatches:targets.filter(t=>t.state==='EXPECTED_ABSENT').length,
 candidateMatches:targets.filter(t=>t.state==='CANDIDATE_MATCH').length,drift:targets.filter(t=>t.state==='DRIFT').length,
 currentProcessExitProof:'NOT_QUERIED_NO_RETRY',actualInstallerRerun:false,
 productionRuntimeActions:0,authPost:false,sqlExecuted:false,providerCalls:0};
await writeFile(path.join(root,'ABORTED_RUN_PRESERVED_PROOF-CORRECTED.json'),JSON.stringify(proof,null,2),{flag:'wx'});
console.log(JSON.stringify({priorCode:proof.priorBackendCode,lockPreserved:true,baseMatches:proof.baseMatches,
 absentMatches:proof.absentMatches,candidateMatches:proof.candidateMatches,drift:proof.drift}));
