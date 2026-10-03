param([switch]$ApplyApprovedCrmRelease)
$ErrorActionPreference='Stop';Set-StrictMode -Version 2
. (Join-Path $PSScriptRoot 'installer-common.ps1')
. (Join-Path $PSScriptRoot 'installer-core.ps1')
. (Join-Path $PSScriptRoot 'installer-recovery.ps1')
if(-not $ApplyApprovedCrmRelease){
 [ordered]@{mode='PLAN_ONLY';runtimeActions=0;entry='START-APPROVED-CRM-INSTALL.cmd';requiredRole='normal SEMIH\Xaser';consent='one Windows RunAs/UAC';backendFiles=24;runtimeTargets=@(4100,4200,4212);independentReview=(Crm-Json (Join-Path $PSScriptRoot 'INDEPENDENT_REVIEW.json')).status}|ConvertTo-Json
 exit 0
}
$script:CrmState=@{run=$null;nonce=$null;outer=$null;lockHandle=$null;lockSha=$null;eventSequence=0;worker=$null;broker=$null;uiProof=$null;prior=$null}
function Wait-CrmReceipt([string]$path,[int]$seconds,[string]$code){
 $deadline=[DateTime]::UtcNow.AddSeconds($seconds)
 while(-not(Test-Path -LiteralPath $path)){
  if([DateTime]::UtcNow -ge $deadline){throw $code}
  Start-Sleep -Milliseconds 100
 }
 return Crm-Json $path
}
function Crm-InvokeUi([string]$mode){
 $argument=if($mode -eq 'Apply'){'--apply-owned-4212'}else{'--recover-owned-4212'}
 # Process API avoids PS5 NativeCommandError converting the fixed CLI's JSON stderr
 # into an exception before its journal/recovery state can be inspected.
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$script:CrmNode
 $info.Arguments='"'+(Join-Path $script:CrmReleaseRoot 'owned-local-transition.mjs')+'" '+$argument+' --approved-exact-local-logout-origin'
 $info.WorkingDirectory=$script:CrmReleaseRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info
 $null=$child.Start();$stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
 if(-not $child.WaitForExit(120000)){throw 'UI_CONTROL_TIMEOUT_UNCERTAIN_STOP'}
 $exit=$child.ExitCode;$text=$stdout.Result+$stderr.Result;$child.Dispose()
 try{$report=$text|ConvertFrom-Json}catch{throw 'UI_MISSING_RECEIPT_UNCERTAIN_STOP'}
 $journalNames=@(Get-ChildItem -LiteralPath $script:CrmReleaseRoot -File|Where-Object {$_.Name -match '^TRANSITION_JOURNAL\.\d{6}\.json$'}|Sort-Object Name)
 $journal=if($journalNames.Count){(Crm-Json $journalNames[-1].FullName).payload}else{$null}
 $wanted=if($mode -eq 'Apply'){'APPLIED_4212'}else{'RECOVERED_OLD_4212'}
 $success=($exit -eq 0 -and (Crm-Field $report 'state') -ceq $wanted -and (Crm-Field $journal 'state') -ceq $wanted)
 $state=Crm-Field $journal 'state' ''
 $code=Crm-Field $journal 'errorCode' (Crm-Field $report 'code' '')
 $eligible=($mode -eq 'Apply' -and -not $success -and $state -ceq 'STOPPED_REVIEW_REQUIRED' -and
  $null -ne (Crm-Field $journal 'launchReceipt') -and $code -notmatch 'PERMISSION|UNCERTAIN|CONCURRENT|CHANGED|DRIFT')
 return [ordered]@{success=$success;state=$state;code=$code;journal=$journal;recoveryEligible=$eligible;attentionRequired=(-not $success -and ($null -ne (Crm-Field $journal 'stopIntent')))}
}
function Crm-ReplaceOwnApproval($object,[string]$expectedSha){
 $path=Join-Path $script:CrmReleaseRoot 'TRANSITION_APPROVAL.json'
 if((Crm-Sha $path) -cne $expectedSha){throw 'CONCURRENT_UI_APPROVAL_EDIT_STOP'}
 $temporary=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 $before=$path+'.replaced-'+[Guid]::NewGuid().ToString('N')+'.json'
 Crm-WriteNew $temporary $object
 try{
  if((Crm-Sha $path) -cne $expectedSha -or (Test-Path -LiteralPath $before)){throw 'CONCURRENT_UI_APPROVAL_EDIT_STOP'}
  # PS5 marshals a null string argument as an empty backup path. Use a unique
  # real before-image, preserving the consumed approval as audit evidence.
  [IO.File]::Replace($temporary,$path,$before)
  if((Crm-Sha $before) -cne $expectedSha){throw 'UI_APPROVAL_REPLACEMENT_BACKUP_CHANGED_STOP'}
 }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
$ports=@{
 Identity={ $script:CrmState.outer=Crm-Identity $false;return $script:CrmState.outer }
 Validate={
  # The earlier actual aborted run is evidence, never an expendable stale lock.
  $script:CrmState.prior=Crm-PriorAbortSnapshot
  $null=Crm-ValidateCandidate
  if(-not(Crm-BaseHashes)){throw 'TARGET_BASE_CHANGED_OR_ALREADY_INSTALLED_STOP'}
  foreach($name in @('TRANSITION_MANIFEST.APPROVED.json','TRANSITION_APPROVAL.json','TRANSITION.lock')){
   if(Test-Path -LiteralPath (Join-Path $script:CrmReleaseRoot $name)){throw 'PREVIOUS_UI_OPERATION_REQUIRES_RECONCILIATION'}
  }
  if(@(Get-ChildItem -LiteralPath $script:CrmReleaseRoot -File|Where-Object {$_.Name -match '^TRANSITION_JOURNAL\.\d{6}\.json$'}).Count){throw 'PREVIOUS_UI_OPERATION_REQUIRES_RECONCILIATION'}
 }
 Acquire={
  $lockPath=Join-Path $PSScriptRoot 'ACTIVE_INSTALL.lock'
  try{$script:CrmState.lockHandle=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)}catch{throw 'ORCHESTRATOR_ALREADY_ACTIVE_STOP'}
  try{
  $nonce=Crm-Nonce;$script:CrmState.nonce=$nonce
  $runName='run-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+$nonce.Substring(0,8)
  $runs=Join-Path $PSScriptRoot 'runs';if(-not(Test-Path -LiteralPath $runs)){New-Item -ItemType Directory -Path $runs|Out-Null}
  $run=Join-Path $runs $runName;New-Item -ItemType Directory -Path $run|Out-Null;$script:CrmState.run=$run
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes((@{outer=$script:CrmState.outer;runRoot=$run;nonce=$nonce}|ConvertTo-Json -Depth 6))
  $script:CrmState.lockHandle.Write($bytes,0,$bytes.Length);$script:CrmState.lockHandle.Flush($true)
  # Get-FileHash cannot reopen a file while this write handle is held.
  # Pin the exact bytes we durably wrote; Finish verifies the file after close.
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{$script:CrmState.lockSha=([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
  $now=[DateTime]::UtcNow
  Crm-WriteNew (Join-Path $run 'session.json') ([ordered]@{nonce=$nonce;outer=$script:CrmState.outer;issuedAt=$now.ToString('o');expiresAt=$now.AddMinutes(15).ToString('o');approvedScope='24 backend + normal4100/4200/owned4212';approvalEvidence='Sentinel_9a41feadeca48191ac3f308574fef749';normalErpIdentityPreserved=$true;authOrProviderTestsAutomatic=$false})
  }catch{
   # Keep the owned but incomplete lock for reconciliation. Never delete a
   # duplicate lock or proceed to UAC after a partial acquisition.
   $script:CrmState.lockHandle.Dispose();$script:CrmState.lockHandle=$null
   throw 'LOCK_SETUP_ATTENTION_REQUIRED'
  }
 }
 Event={param($state)
  $script:CrmState.eventSequence++
  Crm-WriteNew (Join-Path $script:CrmState.run ('event-'+$script:CrmState.eventSequence.ToString('D6')+'.json')) (@{state=$state;observedAt=[DateTime]::UtcNow.ToString('o')})
  Write-Host ('CRM: '+$state)
 }
 ElevateOnce={
  $helper=Join-Path $PSScriptRoot 'request-windows-consent.ps1'
  $args=@('-NoProfile','-NonInteractive','-File',('"'+$helper+'"'),'-RunRoot',('"'+$script:CrmState.run+'"'),'-Nonce',$script:CrmState.nonce)
  $child=Start-Process -FilePath $script:CrmPs5 -ArgumentList $args -WindowStyle Hidden -PassThru
  $result=Wait-CrmReceipt (Join-Path $script:CrmState.run 'consent-launch-result.json') 600 'WINDOWS_CONSENT_TIMEOUT_UNCERTAIN_STOP'
  if($result.nonce -cne $script:CrmState.nonce){throw 'CONSENT_RECEIPT_BINDING_STOP'}
  if($result.status -cne 'ADMIN_PROCESS_LAUNCH_RETURNED'){
   if((Crm-Field $result.error 'permissionDenied' $false)){throw 'WINDOWS_ELEVATION_PERMISSION_DENIED_STOP'}
   throw 'WINDOWS_ELEVATION_NOT_COMPLETED'
  }
  $ready=Wait-CrmReceipt (Join-Path $script:CrmState.run 'admin-ready.json') 30 'ADMIN_READY_MISSING_RECEIPT_UNCERTAIN_STOP'
  if($ready.nonce -cne $script:CrmState.nonce -or $ready.pid -ne $result.pid -or $ready.outerPid -ne $PID){throw 'ADMIN_READY_BINDING_STOP'}
  return $ready
 }
 NormalUiPreflight={
  $identity=Crm-UiHost 'Identity';$probe=Crm-UiHost 'Probe'
  $age=([DateTime]::UtcNow-(Crm-Utc $probe.observedAt)).TotalSeconds
  if($identity.result.sid -cne $script:CrmSid -or $identity.result.elevated -or -not $probe.result -or
     $age -lt 0 -or $age -gt 30 -or $probe.result.sid -cne $script:CrmSid -or $probe.result.elevated -or
     $probe.result.executablePath -cne $script:CrmNode -or ($probe.result.binds -join ',') -cne '127.0.0.1'){throw 'NORMAL_UI_READ_CAPABILITY_REQUIRED_BEFORE_BACKEND'}
  return @{fresh=$true;normal=$true;observedAt=$probe.observedAt;owner=$probe.result}
 }
 ReconcilePrior={param($admin,$normalUi)
  $now=[DateTime]::UtcNow;$prior=$script:CrmState.prior
  $session=Crm-Json (Join-Path $script:CrmState.run 'session.json')
  Crm-WriteNew (Join-Path $script:CrmState.run 'reconciliation-request.json') ([ordered]@{nonce=$script:CrmState.nonce;outerPid=$PID;adminPid=$admin.pid;
   priorRun=$prior.oldRun;priorPinSha256=$prior.pinSha256;oldLockSha256=$prior.oldLockSha256;normalUi=$normalUi;
   issuedAt=$now.ToString('o');expiresAt=$now.AddSeconds(90).ToString('o')})
  $result=Wait-CrmReceipt (Join-Path $script:CrmState.run 'reconciliation-result.json') 90 'RECOVERY_RESULT_MISSING_UNCERTAIN_STOP'
  Crm-AssertReconciliationResult $result $session $script:CrmState.nonce $admin.pid
  return $result
 }
 StartBroker={param($admin)
  Crm-AssertSession (Crm-Json (Join-Path $script:CrmState.run 'session.json')) $script:CrmState.nonce ([DateTime]::UtcNow) $script:CrmState.outer.sessionId
  $root=$script:CrmControlRoot
  $broker=Join-Path $root ('normal-launch-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
  New-Item -ItemType Directory -Path $broker|Out-Null;$script:CrmState.broker=$broker
  $workerPath=Join-Path $root 'operator-normal-launch-worker.candidate.ps1'
  if((Crm-Sha $workerPath) -cne '99d5255397055386704fdeaf72ec82cb0761b5cdea557184593f48817459600b'){throw 'SEALED_NORMAL_WORKER_HASH_CHANGED'}
  $args=@('-NoProfile','-NonInteractive','-File',('"'+$workerPath+'"'),'-BrokerDirectory',('"'+$broker+'"'),'-Nonce',$script:CrmState.nonce)
  $child=Start-Process -FilePath $script:CrmPs5 -ArgumentList $args -WindowStyle Hidden -PassThru;$script:CrmState.worker=$child
  $ready=Wait-CrmReceipt (Join-Path $broker 'ready.json') 15 'NORMAL_BROKER_READY_TIMEOUT_STOP'
  if($ready.workerPid -ne $child.Id -or $ready.nonce -cne $script:CrmState.nonce -or $ready.elevated -or $ready.sid -cne $script:CrmSid -or (Crm-Utc $ready.expiresAt) -le [DateTime]::UtcNow){throw 'NORMAL_BROKER_BINDING_STOP'}
  return [pscustomobject]@{ready=$true;sid=$ready.sid;elevated=$false;workerPid=$ready.workerPid;directory=$broker}
 }
 Backend={param($admin,$broker)
  $now=[DateTime]::UtcNow
  Crm-WriteNew (Join-Path $script:CrmState.run 'backend-request.json') ([ordered]@{nonce=$script:CrmState.nonce;adminPid=$admin.pid;outerPid=$PID;workerPid=$broker.workerPid;brokerDirectory=$broker.directory;issuedAt=$now.ToString('o');expiresAt=$now.AddSeconds(90).ToString('o')})
  $result=Wait-CrmReceipt (Join-Path $script:CrmState.run 'backend-result.json') 180 'BACKEND_RESULT_TIMEOUT_UNCERTAIN_STOP'
  if($result.nonce -cne $script:CrmState.nonce){throw 'BACKEND_RESULT_BINDING_UNCERTAIN_STOP'}
  return $result
 }
 AfterHashes={param($backend);return Crm-AfterHashes}
 PrepareUi={param($backend)
  if(-not(Crm-AfterHashes)){throw 'BACKEND_AFTER_HASH_DRIFT_STOP'}
  $identity=Crm-UiHost 'Identity';$probe=Crm-UiHost 'Probe'
  if($identity.result.sid -cne $script:CrmSid -or $identity.result.elevated){throw 'UI_NORMAL_XASER_REQUIRED'}
  if(-not $probe.result){throw 'EXISTING_NORMAL_UI_OWNER_REQUIRED'}
  $age=([DateTime]::UtcNow-(Crm-Utc $probe.observedAt)).TotalSeconds
  if($age -lt 0 -or $age -gt 30){throw 'FRESH_UI_OWNER_OBSERVATION_REQUIRED'}
  $manifest=Crm-Json (Join-Path $script:CrmReleaseRoot 'TRANSITION_MANIFEST.TEMPLATE.json')
  $manifest.oldOwner=$probe.result;$manifest.freshOwnerStatus='VERIFIED'
  $manifestPath=Join-Path $script:CrmReleaseRoot 'TRANSITION_MANIFEST.APPROVED.json'
  Crm-WriteNew $manifestPath $manifest
  $approval=Crm-Json (Join-Path $script:CrmReleaseRoot 'TRANSITION_APPROVAL.TEMPLATE.json')
  $now=[DateTime]::UtcNow;$approval.mode='Apply';$approval.manifestSha256=Crm-Sha $manifestPath
  $approval.localLogoutOriginApproved=$true;$approval.nonce=Crm-Nonce
  $approval.issuedAt=$now.ToString('o');$approval.expiresAt=$now.AddSeconds(90).ToString('o')
  $approval.ownerObservedAt=$probe.observedAt;$approval.owner=$probe.result
  $approvalPath=Join-Path $script:CrmReleaseRoot 'TRANSITION_APPROVAL.json'
  Crm-WriteNew $approvalPath $approval
  $proof=[pscustomobject]@{fresh=$true;normal=($identity.result.sid -ceq $script:CrmSid -and -not $identity.result.elevated);installedPins=$true;manifestSha=$approval.manifestSha256;approvalSha=(Crm-Sha $approvalPath)}
  $script:CrmState.uiProof=$proof;return $proof
 }
 ApplyUi={param($proof);return Crm-InvokeUi 'Apply'}
 RecoverUi={param($proof,$failed)
  if(-not $failed.recoveryEligible -or -not(Crm-AfterHashes)){throw 'UI_RECOVERY_SCOPE_STOP'}
  $probe=Crm-UiHost 'Probe';$owner=$probe.result;$receipt=$failed.journal.launchReceipt
  $age=([DateTime]::UtcNow-(Crm-Utc $probe.observedAt)).TotalSeconds
  if($age -lt 0 -or $age -gt 30){throw 'FRESH_UI_RECOVERY_OWNER_REQUIRED'}
  foreach($key in @('pid','parentPid','createdUtc','executablePath','sid','elevated')){if((Crm-Field $owner $key) -cne (Crm-Field $receipt $key)){throw 'UI_RECOVERY_OWNER_CHANGED_STOP'}}
  if(($owner.binds -join ',') -cne ($receipt.binds -join ',')){throw 'UI_RECOVERY_BIND_CHANGED_STOP'}
  if((Crm-Sha (Join-Path $script:CrmReleaseRoot 'TRANSITION_MANIFEST.APPROVED.json')) -cne $proof.manifestSha){throw 'CONCURRENT_UI_MANIFEST_EDIT_STOP'}
  $approval=Crm-Json (Join-Path $script:CrmReleaseRoot 'TRANSITION_APPROVAL.TEMPLATE.json')
  $now=[DateTime]::UtcNow;$approval.mode='Recover';$approval.manifestSha256=$proof.manifestSha;$approval.localLogoutOriginApproved=$true;$approval.nonce=Crm-Nonce
  $approval.issuedAt=$now.ToString('o');$approval.expiresAt=$now.AddSeconds(90).ToString('o');$approval.ownerObservedAt=$probe.observedAt;$approval.owner=$owner
  Crm-ReplaceOwnApproval $approval $proof.approvalSha
  return Crm-InvokeUi 'Recover'
 }
 Abort={param($result)
  Crm-WriteNew (Join-Path $script:CrmState.run 'abort.json') ([ordered]@{nonce=$script:CrmState.nonce;state=$result.state;stage=(Crm-Field $result 'stage');observedAt=[DateTime]::UtcNow.ToString('o');forbidAnyNewBackendInvocation=$true})
 }
 Finish={param($result)
  if($script:CrmState.lockHandle){$script:CrmState.lockHandle.Dispose()}
  if(-not $result.attentionRequired){
   $lockPath=Join-Path $PSScriptRoot 'ACTIVE_INSTALL.lock'
   try{
    if((Crm-Sha $lockPath) -cne $script:CrmState.lockSha){throw 'CONCURRENT_ORCHESTRATOR_LOCK_EDIT_STOP'}
    # A durable intent precedes releasing the lock. A cleanup failure changes
    # the final result, rather than leaving a false complete=true receipt.
    Crm-WriteNew (Join-Path $script:CrmState.run 'COMPLETION_INTENT.json') $result
    Remove-Item -LiteralPath $lockPath -ErrorAction Stop
   }catch{
    $result.complete=$false;$result.attentionRequired=$true;$result.state='FINALIZATION_ATTENTION_REQUIRED'
    $result.finalizationCode=(Crm-Error $_).code
   }
  }
  Crm-WriteNew (Join-Path $script:CrmState.run 'RESULT.json') $result
 }
}
$result=Invoke-CrmUnifiedOrchestration $ports
$result|ConvertTo-Json -Depth 10
if(-not $result.complete){exit 1}
