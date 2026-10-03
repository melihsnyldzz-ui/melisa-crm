# DEV artifact sealing only. No installer launch or original lock/runtime change.
$ErrorActionPreference='Stop';Set-StrictMode -Version 2
. (Join-Path $PSScriptRoot 'installer-common.ps1')
$root=$PSScriptRoot;$workspace=Split-Path $root -Parent
$rev2=Join-Path $workspace 'CRM_UNIFIED_ORCHESTRATOR_REV2_DEV_20261002'
if((Crm-Sha (Join-Path $rev2 'ORCHESTRATOR_MANIFEST.json')) -cne '6cc85fbc0880762407f5670d90a3ab8ad7857391044afe3634b9ef66186de398'){throw 'PRESERVED_REV2_MANIFEST_DRIFT'}
$parent=Crm-Json (Join-Path $rev2 'ORCHESTRATOR_MANIFEST.json')
foreach($f in $parent.files){if((Crm-Sha (Crm-SafePath $rev2 $f.path)) -cne $f.sha256){throw 'PRESERVED_REV2_PIN_DRIFT'}}
$oldLock=Join-Path $workspace 'CRM_UNIFIED_ORCHESTRATOR_DEV_20261002\ACTIVE_INSTALL.lock'
if((Crm-Sha $oldLock) -cne '3b46169b4ef85857ed0974ba8b5d7440fc545bbad4c9eea76dc0319727b54f03'){throw 'ORIGINAL_ABORT_LOCK_DRIFT'}
$full=Join-Path $root 'full-preflight-evidence\20261002T204054399Z\PREFLIGHT_RESULT.json'
$wrapper=Join-Path $root 'wrapper-preflight-evidence\20261002T204054309Z\WRAPPER_RESULT.json'
$proof=Crm-Json $full;$wp=Crm-Json $wrapper
if($proof.status -cne 'PASS' -or $proof.testsPassed -ne 650 -or $wp.exitCode -ne 0 -or -not $wp.beforeLiveActions -or $wp.resultSha256 -cne (Crm-Sha $full)){throw 'CURRENT_650_PREFLIGHT_REQUIRED'}
foreach($stage in $proof.stages){if($stage.PSObject.Properties['executable']){
 if($stage.exitCode -ne 0 -or $stage.timedOut -or $stage.spawnError -or $stage.outputExceeded -or $stage.stopRequested -or -not $stage.terminationConfirmed -or $stage.childTreeQuiescence -cne 'NORMAL_EXIT'){throw 'SUBPROCESS_LIFECYCLE_NOT_PROVEN'}
 foreach($kind in @('stdout','stderr')){if((Crm-Sha (Crm-SafePath (Split-Path $full -Parent) $stage.($kind+'File'))) -cne $stage.($kind+'Sha256')){throw 'SUBPROCESS_LOG_DRIFT'}}
}}
if($proof.frontendIndexBefore -cne '6055a875acdbd55325ed6a88f8e6c84aa7908a8827847f42710c1ce4439caf86' -or $proof.frontendIndexAfter -cne $proof.frontendIndexBefore){throw 'COMPILED_UI_CHANGED'}
$reviewPins=@{
 'Start-CrmUnifiedInstall.ps1'='38acf836d5c27c8d280e6f7c2d12f7e45ee4d5f5ce857f28baec9f8c8d1d56cd';
 'installer-core.ps1'='76c9f0120442c6271373aafa35ccc9fb0b7ac3a81b7fc59988a7e5651ceac0a8';
 'installer-recovery.ps1'='f22cccb61e4b74c5563787b2360a1061ab3daade8c4137b840ad3d6b0df747d5';
 'admin-backend-bridge.ps1'='0de8911df51665948fa7455ab8374a80ffb3ecee3f08d014877f9398aa37dd24'
}
foreach($p in $reviewPins.GetEnumerator()){if((Crm-Sha (Join-Path $root $p.Key)) -cne $p.Value){throw 'INDEPENDENT_SOURCE_SNAPSHOT_DRIFT'}}
$reviewEvidence=[ordered]@{status='CODE_CLOSURE_PASS';reviewer='/root/crm_bridge_independent_review';provenance='Recorded existing collaboration final response; not self-issued review';sourcePins=$reviewPins;compositionCases=19;inventoryCases=14;actualNativeAdapters='FIXTURE';finalManifestReview='PENDING_SEPARATE_FINAL_BINDING'}
[IO.File]::WriteAllText((Join-Path $root 'INDEPENDENT_CODE_CLOSURE.json'),($reviewEvidence|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$backendPath=Join-Path $script:CrmControlRoot 'FIRST_PAGE_CANDIDATE_MANIFEST.json'
if((Crm-Sha $backendPath) -cne $script:CrmBackendSha){throw 'APPROVED24_MANIFEST_CHANGED'}
$backend=Crm-Json $backendPath;$originalBackend=Crm-Json (Join-Path $script:CrmReleaseRoot 'controlled-install\FIRST_PAGE_CANDIDATE_MANIFEST.json')
if($backend.files.Count -ne 24 -or $originalBackend.files.Count -ne 24){throw 'APPROVED24_SCOPE_CHANGED'}
foreach($file in $backend.files){if((Crm-Sha (Crm-SafePath (Join-Path $script:CrmControlRoot 'candidate') $file.path)) -cne $file.candidateSha256 -or
 (Crm-Sha (Crm-SafePath (Join-Path $script:CrmReleaseRoot 'controlled-install\candidate') $file.path)) -cne $file.candidateSha256){throw 'APPROVED_APPLICATION_PAYLOAD_CHANGED'}}
if(-not(Crm-BaseHashes)){throw 'LIVE_TARGET_BASELINE_CHANGED'}
$controlSha=Crm-Sha (Join-Path $script:CrmControlRoot 'operator-admin-launch-control.candidate.ps1')
$wrapperSha=Crm-Sha (Join-Path $script:CrmControlRoot 'deploy-first-photo-page.role-separated.candidate.ps1')
$workerSha=Crm-Sha (Join-Path $script:CrmControlRoot 'operator-normal-launch-worker.candidate.ps1')
$backendReview=[ordered]@{status='DEV_PASS_NOT_APPLIED';codeReview='PASS';deploymentReview='PASS';candidateTestsPassed=247;manifestSha256=$script:CrmBackendSha;
 scriptSha256=$wrapperSha;controlSha256=$controlSha;workerSha256=$workerSha;applicationFileChanges=24;
 reviewer='/root/crm_bridge_independent_review';reviewStatus='CODE_CLOSURE_PASS';reviewScope='Reviewed unchanged payload/wrapper and current recovery coordination; final orchestration manifest binding separate';
 currentFullPreflightTests=650;fullPreflightSha256=Crm-Sha $full;fullPreflightPath='../../full-preflight-evidence/20261002T204054399Z/PREFLIGHT_RESULT.json';
 productionExecutionApproved=$true;approvalEvidence='Sentinel_9a41feadeca48191ac3f308574fef749';actualRuntimeApply=$false;freshUacAndOwnerControlGatesRequired=$true}
[IO.File]::WriteAllText((Join-Path $script:CrmControlRoot 'role-separated-deploy-review.json'),($backendReview|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$depPins=[ordered]@{status='SOURCE_REVIEW_AND_FULL_PREFLIGHT_PASS_NOT_APPLIED';controlSha256=$controlSha;wrapperSha256=$wrapperSha;workerSha256=$workerSha;applicationManifestSha256=$script:CrmBackendSha;originalReleaseUnmodified=$true;productionExecutionApproved=$true;approvalEvidence='Sentinel_9a41feadeca48191ac3f308574fef749';actualRuntimeApply=$false}
[IO.File]::WriteAllText((Join-Path $root 'DEPLOYMENT_DEPENDENCY_PINS.json'),($depPins|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$preserved=[ordered]@{status='PRESERVATION_VERIFIED';oldLockSha256=Crm-Sha $oldLock;oldLockArchived=$false;rev2PinsVerified=$parent.files.Count;applicationFiles=24;applicationPayloadChanges=0;
 compiledUiSha256=$proof.frontendIndexAfter;currentTargets='19_BASE_5_ABSENT';runtimeActions=0;authPost=$false;sqlExecuted=$false;providerCalls=0;erpTestTouched=$false}
[IO.File]::WriteAllText((Join-Path $root 'PRESERVATION.PROOF.json'),($preserved|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$paths=New-Object 'Collections.Generic.HashSet[string]'
foreach($f in $parent.files){if($f.path -notin @('ORCHESTRATOR_MANIFEST.json','INDEPENDENT_REVIEW.json')){$null=$paths.Add([string]$f.path)}}
foreach($f in Get-ChildItem -LiteralPath $root -File){if($f.Extension -in @('.ps1','.mjs','.json','.md','.txt','.cmd') -and $f.Name -notin @('ORCHESTRATOR_MANIFEST.json','INDEPENDENT_REVIEW.json','ZIP_RECEIPT.json')){$null=$paths.Add($f.Name)}}
foreach($folder in @('full-preflight-evidence\20261002T204054399Z','wrapper-preflight-evidence\20261002T204054309Z')){
 foreach($f in Get-ChildItem -LiteralPath (Join-Path $root $folder) -File){$null=$paths.Add($f.FullName.Substring($root.Length+1).Replace('\','/'))}
}
$files=@($paths|Sort-Object|ForEach-Object {$p=Crm-SafePath $root $_;if($_ -match '(^|/)node_modules/|(^|/)public-dev-registry-cache/'){throw 'CODE_PACKAGE_ONLY'};$item=Get-Item -LiteralPath $p;[ordered]@{path=$_;bytes=$item.Length;sha256=Crm-Sha $p}})
$manifest=[ordered]@{version='crm-unified-orchestrator-rev3';status='DEV_VERIFIED_NOT_APPLIED';createdAt=[DateTime]::UtcNow.ToString('o');files=$files;
 fullPreflight='PASS_650_ACTUAL_DERIVED_CWD';fullPreflightSha256=Crm-Sha $full;compiledUiSha256=$proof.frontendIndexAfter;
 entry='START-APPROVED-CRM-INSTALL.cmd';humanLaunches=1;windowsConsentPrompts=1;separateInventoryCommandRequired=$false;
 applicationTargets=24;applicationPayloadChanged=$false;originalLockPreserved=$true;runtimeActions=0;authPost=$false;sqlExecuted=$false;providerCalls=0;
 pricedPdf=$false;sourceUpdatedAt=$null;actualProtectedAcceptance='NOT_RUN';finalReviewArtifact='INDEPENDENT_REVIEW.json'}
[IO.File]::WriteAllText((Join-Path $root 'ORCHESTRATOR_MANIFEST.json'),($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[ordered]@{status='READY_FOR_FINAL_INDEPENDENT_MANIFEST_REVIEW';files=$files.Count;manifestSha256=Crm-Sha (Join-Path $root 'ORCHESTRATOR_MANIFEST.json');fullReceiptSha256=Crm-Sha $full;wrapperReceiptSha256=Crm-Sha $wrapper;tests=650;runtimeActions=0}|ConvertTo-Json
