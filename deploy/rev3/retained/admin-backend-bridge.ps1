param([Parameter(Mandatory=$true)][string]$RunRoot,[Parameter(Mandatory=$true)][string]$Nonce)
$ErrorActionPreference='Stop';Set-StrictMode -Version 2
. (Join-Path $PSScriptRoot 'installer-common.ps1')
. (Join-Path $PSScriptRoot 'installer-recovery.ps1')
$run=$null;$backendStarted=$false;$beforeNames=@();$parentHandle=$null;$output=$null
$phase='reconciliation'
$script:terminalControlDenial=$false
function Crm-ReadRecoveryServiceAccess {
 $probe=Join-Path $script:CrmDeploymentRoot 'query-approved-service-access.ps1'
 $LASTEXITCODE=0;$access=(& $script:CrmPs5 -NoProfile -NonInteractive -File $probe|Out-String)|ConvertFrom-Json
 if($LASTEXITCODE -ne 0){throw 'SERVICE_ACCESS_QUERY_FAILED_STOP'}
 return $access
}
function Crm-ReadRecoveryInventory($normalUi){
 $helper=Join-Path $script:CrmControlRoot 'owner-diagnostic-fix\port-owner-diagnostics.ps1'
 if((Crm-Sha $helper) -cne '893b7fe45b9330dc8d3b96992c8df88f25f116c561a06ed9cc0f6fb25fd86ab0'){throw 'OWNER_HELPER_PIN_REQUIRED'}
 . $helper
 $owners=@()
 foreach($port in @(4100,4200)){
  $proof=Get-PortOwnerEvidence -Port $port
  if(-not $proof.success){if($proof.PSObject.Properties['provider'] -and $proof.provider.accessDenied){$script:terminalControlDenial=$true};throw 'CURRENT_OWNER_METADATA_REQUIRED_NO_APPLY'}
  $owner=$proof.owner;$native=Read-NativeProcessCreatedUtc $owner.pid
  Assert-NativeProcessTime $owner.pid $native $owner.createdUtc 'CURRENT_OWNER_CREATION_CHANGED_STOP'
  if($port -eq 4100){
   if($owner.pid -ne 6968 -or $owner.parentPid -ne 31604 -or $native.ToString('o') -cne '2026-10-01T09:35:26.9240070Z'){throw 'EXACT_APPROVED_EXISTING_ERP_REQUIRED'}
   $context=Read-ProcessContext $owner.pid
   if($context.sid -cne $script:CrmSid -or $context.elevated -or (Crm-Sha (Join-Path $script:CrmAppsRoot 'api\src\server.js')) -cne 'ebff8fd92ab24533dfe3cdd4fb9c7a79bf2455b8ea5afff3beaf8eb02adebab7'){throw 'EXACT_NORMAL_ERP_SOURCE_REQUIRED'}
  }
  $owners+=@([ordered]@{port=$port;pid=$owner.pid;parentPid=$owner.parentPid;createdUtc=$native.ToString('o');binds=$owner.binds})
 }
 $key='HKLM:\SYSTEM\CurrentControlSet\Services\MelisaWhatsAppCrmGateway\Parameters'
 if((Get-ItemPropertyValue -LiteralPath $key -Name AppDirectory).TrimEnd('\') -cne (Join-Path $script:CrmAppsRoot 'whatsapp-crm-api') -or
    (Get-ItemPropertyValue -LiteralPath $key -Name Application) -cne $script:CrmNode){throw 'REGISTERED_GATEWAY_SOURCE_MISMATCH'}
 $service=Read-ControlledMetadata 'Win32_Service' "Name='MelisaWhatsAppCrmGateway'" @('ProcessId','State')
 if($service.State -cne 'Running' -or $service.ProcessId -le 0 -or $owners[1].parentPid -ne $service.ProcessId){throw 'GATEWAY_OWNER_SERVICE_MISMATCH'}
 $listeners=@(Get-NetTCPConnection -LocalPort 4212 -State Listen -ErrorAction Stop)
 $ids=@($listeners|ForEach-Object {$_.OwningProcess}|Sort-Object -Unique);$binds=@($listeners|ForEach-Object {$_.LocalAddress}|Sort-Object -Unique)
 if($ids.Count -ne 1 -or $binds.Count -ne 1 -or $binds[0] -cne '127.0.0.1'){throw 'EXACT_NORMAL_LOOPBACK_UI_REQUIRED'}
 $ui=Read-ControlledMetadata 'Win32_Process' ('ProcessId='+$ids[0]) @('ProcessId','ParentProcessId','ExecutablePath','CreationDate')
 if(-not $ui -or $ui.ExecutablePath -cne $script:CrmNode){throw 'CURRENT_UI_SOURCE_METADATA_REQUIRED'}
 $context=Read-ProcessContext $ui.ProcessId;$native=Read-NativeProcessCreatedUtc $ui.ProcessId
 Assert-NativeProcessTime $ui.ProcessId $native $ui.CreationDate 'CURRENT_UI_CREATION_CHANGED_STOP'
 if($context.sid -cne $script:CrmSid -or $context.elevated){throw 'CURRENT_UI_MUST_BE_NORMAL_XASER'}
 $current=[ordered]@{pid=[int]$ui.ProcessId;parentPid=[int]$ui.ParentProcessId;createdUtc=(Crm-Utc $ui.CreationDate).ToString('o');executablePath=$script:CrmNode;sid=$context.sid;elevated=$false;binds=@('127.0.0.1')}
 foreach($field in @('pid','parentPid','createdUtc','executablePath','sid','elevated')){if($current.$field -cne $normalUi.owner.$field){throw 'NORMAL_UI_PREFLIGHT_OWNER_CHANGED_STOP'}}
 $access=Crm-ReadRecoveryServiceAccess
 if($access.service -cne 'MelisaWhatsAppCrmGateway' -or @($access.access|Where-Object {$_.operation -in @('start','stop') -and $_.allowed}).Count -ne 2){throw 'SERVICE_START_STOP_ACCESS_REQUIRED_BEFORE_APPLY'}
 foreach($url in @('http://127.0.0.1:4100/api/health','http://127.0.0.1:4200/health')){if((Get-ControlledHttpStatus $url) -ne 200){throw 'CURRENT_RUNTIME_HEALTH_REQUIRED'}}
 return [ordered]@{verified=$true;controlAllowed=$true;observedAt=[DateTime]::UtcNow.ToString('o');owners=$owners;uiOwner=$current;serviceName='MelisaWhatsAppCrmGateway';authPost=$false;sqlExecuted=$false;runtimeActions=0}
}
function Invoke-CrmAdminPriorReconciliation([string]$run,$session,[string]$nonce,$self,$parentHandle){
 $recoveryPath=Join-Path $run 'reconciliation-request.json';$recoveryDeadline=[DateTime]::UtcNow.AddSeconds(90)
 while(-not(Test-Path -LiteralPath $recoveryPath)){
  if((Test-Path -LiteralPath (Join-Path $run 'abort.json')) -or $parentHandle.HasExited){throw 'NORMAL_COORDINATOR_EXITED_BEFORE_RECONCILIATION'}
  if([DateTime]::UtcNow -ge $recoveryDeadline){throw 'RECOVERY_REQUEST_MISSING_UNCERTAIN_STOP'}
  Start-Sleep -Milliseconds 100
 }
 $recovery=Crm-Json $recoveryPath
 $recheckRecovery={Assert-Outer;if($parentHandle.HasExited){throw 'NORMAL_COORDINATOR_ABORTED_STOP'}}
 $readPrior={param($id)Read-ControlledMetadata 'Win32_Process' ('ProcessId='+$id) @('ProcessId','CreationDate')}
 $reconciled=Invoke-CrmPriorAbortReconciliation $recovery $session $nonce $self.pid $self.sessionId $run $readPrior {param($ui)Crm-ReadRecoveryInventory $ui} $recheckRecovery
 Crm-WriteNew (Join-Path $run 'reconciliation-result.json') $reconciled
 return $reconciled
}
try {
 $self=Crm-Identity $true;$null=Crm-ValidateCandidate;$run=Crm-RunRoot $RunRoot
 $session=Crm-Json (Join-Path $run 'session.json')
 Crm-AssertSession $session $Nonce ([DateTime]::UtcNow) $self.sessionId
 $control=Join-Path $script:CrmControlRoot 'operator-admin-launch-control.candidate.ps1'
 if((Crm-Sha $control) -cne (Crm-Json (Join-Path $PSScriptRoot 'DEPLOYMENT_DEPENDENCY_PINS.json')).controlSha256){throw 'REVIEWED_ADMIN_CONTROL_HASH_CHANGED'}
 $script:terminalControlDenial=$false
 . $control
 function Assert-Outer {
  if(Test-Path -LiteralPath (Join-Path $run 'abort.json')){throw 'NORMAL_COORDINATOR_ABORTED_STOP'}
  $p=Read-ControlledMetadata 'Win32_Process' ('ProcessId='+[int]$session.outer.pid) @('ProcessId','ExecutablePath','CreationDate','SessionId')
  if(-not $p -or $p.ExecutablePath -cne $script:CrmPs5 -or $p.SessionId -ne $session.outer.sessionId){throw 'EXACT_NORMAL_OUTER_PROCESS_REQUIRED'}
  $native=Get-Process -Id ([int]$session.outer.pid) -ErrorAction Stop
  try{Crm-AssertNativeParentTime $session.outer.createdUtc $native.StartTime $p.CreationDate}finally{$native.Dispose()}
  $context=Read-ProcessContext ([int]$session.outer.pid)
  if($context.sid -cne $script:CrmSid -or $context.elevated){throw 'OUTER_NORMAL_XASER_REQUIRED'}
 }
 Assert-Outer
 $parentHandle=Get-Process -Id ([int]$session.outer.pid) -ErrorAction Stop;$null=$parentHandle.Handle
 Crm-WriteNew (Join-Path $run 'admin-ready.json') ([ordered]@{ready=$true;nonce=$Nonce;sid=$self.sid;elevated=$true;pid=$self.pid;createdUtc=$self.createdUtc;sessionId=$self.sessionId;outerPid=$session.outer.pid;observedAt=[DateTime]::UtcNow.ToString('o')})
 $reconciled=Invoke-CrmAdminPriorReconciliation $run $session $Nonce $self $parentHandle
 $phase='backend'
 # The short backend request/broker lifetimes start after reconciliation.
 $requestPath=Join-Path $run 'backend-request.json';$waitUntil=[DateTime]::UtcNow.AddSeconds(90)
 while(-not(Test-Path -LiteralPath $requestPath)){
  if((Test-Path -LiteralPath (Join-Path $run 'abort.json')) -or $parentHandle.HasExited){throw 'NORMAL_COORDINATOR_EXITED_BEFORE_APPLY'}
  if([DateTime]::UtcNow -ge $waitUntil){throw 'NORMAL_BROKER_REQUEST_TIMEOUT_STOP'}
  Start-Sleep -Milliseconds 100
 }
 $request=Crm-Json $requestPath
 $now=[DateTime]::UtcNow
 Crm-AssertBackendRequest $request $session $Nonce $PID $now
 Crm-AssertReconciliationResult $reconciled $session $Nonce $PID
 $broker=[IO.Path]::GetFullPath($request.brokerDirectory);$controlRoot=$script:CrmControlRoot
 if((Split-Path $broker -Parent) -cne $controlRoot -or (Split-Path $broker -Leaf) -notmatch '^normal-launch-\d{8}T\d{9}Z$'){throw 'EXACT_SEALED_NORMAL_BROKER_REQUIRED'}
 $null=Crm-SafePath $script:CrmDeploymentRoot ('controlled-install/'+(Split-Path $broker -Leaf))
 $ready=Crm-Json (Join-Path $broker 'ready.json')
 Crm-AssertCommitGate $session $request $Nonce $PID $self.sessionId $now $false $parentHandle.HasExited $ready
 Assert-Outer
 $beforeNames=@(Get-ChildItem -LiteralPath $controlRoot -Directory|Where-Object {$_.Name -match '^deployment-\d{8}T\d{9}Z$'}|ForEach-Object {$_.Name})
 Crm-WriteNew (Join-Path $run 'backend-invoke-intent.json') ([ordered]@{nonce=$Nonce;adminPid=$PID;workerPid=$ready.workerPid;brokerDirectory=$broker;observedAt=[DateTime]::UtcNow.ToString('o')})
 $wrapper=Join-Path $controlRoot 'deploy-first-photo-page.role-separated.candidate.ps1'
 if((Crm-Sha $wrapper) -cne (Crm-Json (Join-Path $PSScriptRoot 'DEPLOYMENT_DEPENDENCY_PINS.json')).wrapperSha256){throw 'REVIEWED_APPLY_ENTRY_HASH_CHANGED'}
 $LASTEXITCODE=0
 # Last possible authorization check follows all intent/hash/directory I/O.
 # The sealed entry performs its own fresh owner/broker checks as well.
 Assert-Outer
 Crm-AssertCommitGate $session $request $Nonce $PID $self.sessionId ([DateTime]::UtcNow) (Test-Path -LiteralPath (Join-Path $run 'abort.json')) $parentHandle.HasExited $ready
 $recheckCommit={
  Assert-Outer
  Crm-AssertReconciliationResult $reconciled $session $Nonce $PID
  Crm-AssertCommitGate $session $request $Nonce $PID $self.sessionId ([DateTime]::UtcNow) (Test-Path -LiteralPath (Join-Path $run 'abort.json')) $parentHandle.HasExited $ready
 }
 $backendStarted=$true
 & $wrapper -ApprovedBoundedOwnerMediaActivation -ApprovedLocalCatalogLogoutOrigin -Apply -ExpectedNormalParentPid ([int]$ready.workerPid) -BrokerDirectory $broker -Nonce $Nonce -RecheckCommitGate $recheckCommit | Out-Null
 $wrapperExit=$LASTEXITCODE
 $newRuns=@(Get-ChildItem -LiteralPath $controlRoot -Directory|Where-Object {$_.Name -match '^deployment-\d{8}T\d{9}Z$' -and $_.Name -notin $beforeNames})
 if($newRuns.Count -gt 1){throw 'BACKEND_RUN_AMBIGUOUS_UNCERTAIN_STOP'}
 if($newRuns.Count -eq 0){
  if(-not(Crm-BaseHashes)){throw 'BACKEND_MISSING_RECEIPT_UNCERTAIN_STOP'}
  $output=[ordered]@{success=$false;safeStopped=$true;rollbackComplete=$false;mutationStarted=$false;permissionDenied=$script:terminalControlDenial;nonce=$Nonce;code='SEALED_APPLY_STOPPED_BEFORE_CHANGE';wrapperExit=$wrapperExit}
 }else{
  $journalPath=Join-Path $newRuns[0].FullName 'result.json'
  if(-not(Test-Path -LiteralPath $journalPath)){throw 'BACKEND_MISSING_RECEIPT_UNCERTAIN_STOP'}
  $journal=Crm-Json $journalPath
  if($journal.manifestSha256 -cne $script:CrmBackendSha -or $journal.journalVersion -cne 'role-separated-v1'){throw 'BACKEND_JOURNAL_BINDING_UNCERTAIN_STOP'}
  $success=($wrapperExit -eq 0 -and $journal.smokePassed -and $journal.erpNormalReloadObserved -and $journal.gatewayRestarted -and
    @($journal.installed|Sort-Object -Unique).Count -eq 24 -and (Crm-AfterHashes))
  $rollbackComplete=($journal.rollbackFilesVerified -and -not $journal.erpNormalReloadRequired -and -not(Crm-Field $journal 'rollbackFailure') -and (Crm-BaseHashes))
  if($rollbackComplete){foreach($url in @('http://127.0.0.1:4100/api/health','http://127.0.0.1:4200/health')){if((Get-ControlledHttpStatus $url) -ne 200){$rollbackComplete=$false;break}}}
  $output=[ordered]@{success=$success;safeStopped=$false;rollbackComplete=$rollbackComplete;mutationStarted=($journal.installed.Count -gt 0);permissionDenied=(Crm-JournalDenial $journal $script:terminalControlDenial);nonce=$Nonce;backendRunDirectory=$newRuns[0].FullName;wrapperExit=$wrapperExit;installed=$journal.installed;normalErpReceipt=(Crm-Field $journal 'normalLaunchReceipt');smokePassed=$journal.smokePassed;gatewayRestarted=$journal.gatewayRestarted;failure=(Crm-Field $journal 'failure');rollbackFailure=(Crm-Field $journal 'rollbackFailure')}
 }
}catch{
 $facts=Crm-Error $_ $script:terminalControlDenial
 $preflight=$null;$exception=$_.Exception
 for($i=0;$i -lt 8 -and $exception;$i++){
  if($exception.Data.Contains('OfflinePreflight')){$preflight=$exception.Data['OfflinePreflight'];break}
  $exception=$exception.InnerException
 }
 # Invocation intent and observed source mutation are distinct facts.
 $beforeLive=($null -ne $preflight -and $preflight.beforeLiveActions -and $preflight.productionRuntimeActions -eq 0)
 $output=[ordered]@{success=$false;safeStopped=(-not $backendStarted);rollbackComplete=$false;
  backendInvoked=$backendStarted;mutationStarted= $(if($beforeLive -or -not $backendStarted){$false}else{$null});
  mutationEvidence= $(if($beforeLive){'FULL_PREFLIGHT_FAILED_BEFORE_LIVE_ACTIONS'}else{'INVOCATION_INTENT_ONLY_NOT_SOURCE_WRITE_PROOF'});
  offlinePreflight=$preflight;permissionDenied=$facts.permissionDenied;nonce=$Nonce;error=$facts;
  attentionRequired=($backendStarted -or $facts.permissionDenied)}
}finally{
 if($parentHandle){$parentHandle.Dispose()}
 if($run -and $output){$output.observedAt=[DateTime]::UtcNow.ToString('o');$name=if($phase -ceq 'reconciliation'){'reconciliation-result.json'}else{'backend-result.json'};Crm-WriteNew (Join-Path $run $name) $output}
}
if(-not $output -or -not $output.success){exit 1}
