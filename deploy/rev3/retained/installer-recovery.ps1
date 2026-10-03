# One existing installer phase. Functions only; import has no host/runtime action.
$script:CrmPriorCanonicalRoot='C:\Users\Xaser\Documents\Codex\2026-09-30\task-3\CRM_UNIFIED_ORCHESTRATOR_DEV_20261002'
$script:CrmPriorRoot=$script:CrmPriorCanonicalRoot
function Crm-PriorAbortSnapshot {
 $pins=Crm-Json (Join-Path $script:CrmCandidateRoot 'PRIOR_ABORT_PINS.json')
 if($pins.version -cne 'exact-known-abort-v1' -or $pins.priorRoot -cne $script:CrmPriorCanonicalRoot -or
    $pins.oldRun -cne 'run-20261002T184156594Z-0e3e5e6a' -or $pins.files.Count -ne 7){throw 'EXACT_KNOWN_ABORT_PINS_REQUIRED'}
 foreach($file in $pins.files){$p=Crm-SafePath $script:CrmPriorRoot $file.path;if(-not(Test-Path -LiteralPath $p) -or (Crm-Sha $p) -cne $file.sha256){throw 'PRIOR_ABORT_EVIDENCE_MISSING_OR_DRIFT_STOP'}}
 $run=Join-Path $script:CrmPriorRoot ('runs\'+$pins.oldRun)
 $lock=Crm-Json (Join-Path $script:CrmPriorRoot 'ACTIVE_INSTALL.lock')
 $session=Crm-Json (Join-Path $run 'session.json');$admin=Crm-Json (Join-Path $run 'admin-ready.json')
 $request=Crm-Json (Join-Path $run 'backend-request.json');$result=Crm-Json (Join-Path $run 'RESULT.json');$abort=Crm-Json (Join-Path $run 'abort.json')
 $ready=Crm-Json (Crm-SafePath $script:CrmPriorRoot 'deployment-dependency/controlled-install/normal-launch-20261002T184210225Z/ready.json')
 $canonicalRun=Join-Path $script:CrmPriorCanonicalRoot ('runs\'+$pins.oldRun)
 if($lock.runRoot -cne $canonicalRun -or $lock.nonce -cnotmatch '^[a-f0-9]{64}$' -or
    $session.nonce -cne $lock.nonce -or $admin.nonce -cne $lock.nonce -or $request.nonce -cne $lock.nonce -or
    $result.backend.nonce -cne $lock.nonce -or $abort.nonce -cne $lock.nonce -or $ready.nonce -cne $lock.nonce -or
    $result.state -cne 'BACKEND_ATTENTION_REQUIRED' -or $result.complete -or $null -ne $result.ui -or
    -not $abort.forbidAnyNewBackendInvocation -or $result.backend.error.code -cne 'UNIFIED_MEDIA_OFFLINE_TESTS_FAILED' -or
    $request.outerPid -ne $lock.outer.pid -or $request.adminPid -ne $admin.pid -or $request.workerPid -ne $ready.workerPid -or
    $lock.outer.sid -cne $script:CrmSid -or $lock.outer.elevated -or $ready.sid -cne $script:CrmSid -or $ready.elevated){throw 'EXACT_PRIOR_ABORT_BINDING_REQUIRED'}
 if((Crm-Sha (Join-Path $script:CrmPriorRoot 'ACTIVE_INSTALL.lock')) -cne $pins.lockSha256){throw 'PRIOR_LOCK_HASH_DRIFT_STOP'}
 return [ordered]@{oldRun=$pins.oldRun;oldLockSha256=$pins.lockSha256;pinSha256=Crm-Sha (Join-Path $script:CrmCandidateRoot 'PRIOR_ABORT_PINS.json');
  records=@(@{kind='outer';pid=$lock.outer.pid;createdUtc=$lock.outer.createdUtc},@{kind='admin';pid=$admin.pid;createdUtc=$admin.createdUtc},@{kind='broker';pid=$ready.workerPid;createdUtc=$ready.workerCreatedUtc});
  requestExpiresAt=$request.expiresAt;brokerExpiresAt=$ready.expiresAt}
}
function Crm-AssertRecoveryRequest($request,$session,[string]$nonce,[int]$adminPid,[DateTime]$now,[int]$sessionId){
 Crm-AssertSession $session $nonce $now $sessionId
 $issued=Crm-Utc $request.issuedAt;$expires=Crm-Utc $request.expiresAt
 if($request.nonce -cne $nonce -or $request.outerPid -ne $session.outer.pid -or $request.adminPid -ne $adminPid -or
    $request.priorRun -cne 'run-20261002T184156594Z-0e3e5e6a' -or $issued -gt $now -or $expires -le $now -or
    $expires -le $issued -or ($expires-$issued).TotalSeconds -gt 90){throw 'FRESH_BOUND_RECOVERY_REQUEST_REQUIRED'}
 $observed=Crm-Utc $request.normalUi.observedAt
 if($observed -gt $now -or ($now-$observed).TotalSeconds -gt 30 -or $request.normalUi.owner.sid -cne $script:CrmSid -or
    $request.normalUi.owner.elevated -or $request.normalUi.owner.executablePath -cne $script:CrmNode -or
    ($request.normalUi.owner.binds -join ',') -cne '127.0.0.1'){throw 'FRESH_NORMAL_UI_PREFLIGHT_REQUIRED'}
}
function Crm-AssertPriorQuiescent($snapshot,[scriptblock]$ReadProcess,[DateTime]$now){
 if((Crm-Utc $snapshot.requestExpiresAt) -ge $now -or (Crm-Utc $snapshot.brokerExpiresAt) -ge $now){throw 'PRIOR_REQUEST_OR_BROKER_STILL_ACTIVE_STOP'}
 foreach($record in $snapshot.records){
  $found=@(& $ReadProcess ([int]$record.pid)|Where-Object {$null -ne $_})
  if($found.Count -gt 1){throw 'PRIOR_PROCESS_AMBIGUOUS_STOP'}
  if($found.Count){$creation=Crm-Field $found[0] 'CreationDate';if($null -eq $creation){throw 'PRIOR_PROCESS_CREATION_REQUIRED_STOP'};$created=Crm-Utc $creation;$wanted=Crm-Utc $record.createdUtc
   if(($created.Ticks-($created.Ticks%10)) -eq ($wanted.Ticks-($wanted.Ticks%10))){throw 'PRIOR_RECORDED_PROCESS_STILL_ACTIVE_STOP'}
  }
 }
 $oldControl=Crm-SafePath $script:CrmPriorRoot 'deployment-dependency/controlled-install'
 if(@(Get-ChildItem -LiteralPath $oldControl -Directory|Where-Object {$_.Name -match '^deployment-\d{8}T\d{9}Z$'}).Count){throw 'PRIOR_DEPLOYMENT_JOURNAL_REQUIRES_REVIEW'}
 foreach($name in @('TRANSITION_MANIFEST.APPROVED.json','TRANSITION_APPROVAL.json','TRANSITION.lock')){
  if(Test-Path -LiteralPath (Crm-SafePath $script:CrmReleaseRoot $name)){throw 'PRIOR_UI_OPERATION_REQUIRES_REVIEW'}
 }
 if(@(Get-ChildItem -LiteralPath $script:CrmReleaseRoot -File|Where-Object {$_.Name -match '^TRANSITION_JOURNAL\.\d{6}\.json$'}).Count){throw 'PRIOR_UI_OPERATION_REQUIRES_REVIEW'}
 if(-not(Crm-BaseHashes)){throw 'TARGET_BASE_CHANGED_OR_ALREADY_INSTALLED_STOP'}
}
function Invoke-CrmPriorAbortReconciliation($request,$session,[string]$nonce,[int]$adminPid,[int]$sessionId,[string]$run,
 [scriptblock]$ReadProcess,[scriptblock]$ReadInventory,[scriptblock]$Recheck){
 $now=[DateTime]::UtcNow;Crm-AssertRecoveryRequest $request $session $nonce $adminPid $now $sessionId
 $snapshot=Crm-PriorAbortSnapshot
 if($request.priorPinSha256 -cne $snapshot.pinSha256 -or $request.oldLockSha256 -cne $snapshot.oldLockSha256){throw 'RECOVERY_PRIOR_SNAPSHOT_CHANGED_STOP'}
 Crm-AssertPriorQuiescent $snapshot $ReadProcess $now
 $inventory=& $ReadInventory $request.normalUi
 if(-not $inventory.verified -or -not $inventory.controlAllowed){throw 'CURRENT_RUNTIME_AND_CONTROL_PROOF_REQUIRED'}
 $observed=Crm-Utc $inventory.observedAt
 if($observed -gt [DateTime]::UtcNow -or ([DateTime]::UtcNow-$observed).TotalSeconds -gt 30){throw 'FRESH_ADMIN_RECOVERY_INVENTORY_REQUIRED'}
 $source=Crm-SafePath $script:CrmPriorRoot 'ACTIVE_INSTALL.lock'
 $relative='ACTIVE_INSTALL.archived-'+$snapshot.oldRun+'.lock';$archive=Crm-SafePath $script:CrmPriorRoot $relative
 if(Test-Path -LiteralPath $archive){throw 'PRIOR_ARCHIVE_ALREADY_EXISTS_STOP'}
 $intent=[ordered]@{version='exact-prior-abort-reconciliation-v1';nonce=$nonce;outerPid=$session.outer.pid;adminPid=$adminPid;
  oldRun=$snapshot.oldRun;oldLockSha256=$snapshot.oldLockSha256;archiveRelativePath=$relative;observedAt=$inventory.observedAt;inventory=$inventory;reversible=$true;oldRunRemainsAborted=$true}
 Crm-WriteNew (Join-Path $run 'prior-lock-archive-intent.json') $intent
 # No old-run action occurs between these final checks and the atomic rename.
 & $Recheck
 Crm-AssertRecoveryRequest $request $session $nonce $adminPid ([DateTime]::UtcNow) $sessionId
 $again=Crm-PriorAbortSnapshot;Crm-AssertPriorQuiescent $again $ReadProcess ([DateTime]::UtcNow)
 $latest=& $ReadInventory $request.normalUi
 if(-not $latest.verified -or -not $latest.controlAllowed -or
    (($latest.owners|ConvertTo-Json -Depth 6 -Compress) -cne ($inventory.owners|ConvertTo-Json -Depth 6 -Compress)) -or
    (($latest.uiOwner|ConvertTo-Json -Depth 6 -Compress) -cne ($inventory.uiOwner|ConvertTo-Json -Depth 6 -Compress))){throw 'RECOVERY_RUNTIME_CHANGED_BEFORE_ARCHIVE_STOP'}
 & $Recheck
 Crm-AssertRecoveryRequest $request $session $nonce $adminPid ([DateTime]::UtcNow) $sessionId
 if($again.oldLockSha256 -cne $snapshot.oldLockSha256 -or (Crm-Sha $source) -cne $snapshot.oldLockSha256 -or (Test-Path -LiteralPath $archive)){throw 'PRIOR_LOCK_CONCURRENT_CHANGE_STOP'}
 # This is the last gate, after all hash/path I/O and immediately before Move.
 & $Recheck
 Crm-AssertRecoveryRequest $request $session $nonce $adminPid ([DateTime]::UtcNow) $sessionId
 # Exact same-directory atomic rename only. Never delete, overwrite, or resume.
 [IO.File]::Move($source,$archive)
 if((Test-Path -LiteralPath $source) -or (Crm-Sha $archive) -cne $snapshot.oldLockSha256){throw 'PRIOR_LOCK_ARCHIVE_OUTCOME_UNCERTAIN_STOP'}
 $result=[ordered]@{success=$true;nonce=$nonce;outerPid=$session.outer.pid;adminPid=$adminPid;oldRun=$snapshot.oldRun;
  oldLockSha256=$snapshot.oldLockSha256;archiveRelativePath=$relative;archiveVerified=$true;inventory=$inventory;
  observedAt=[DateTime]::UtcNow.ToString('o');sourceWrites=0;runtimeActions=0;oldRunRemainsAborted=$true}
 Crm-WriteNew (Join-Path $run 'prior-lock-archive-result.json') $result
 return $result
}
function Crm-AssertReconciliationResult($result,$session,[string]$nonce,[int]$adminPid){
 if(-not $result.success -or -not $result.archiveVerified -or $result.nonce -cne $nonce -or
    $result.outerPid -ne $session.outer.pid -or $result.adminPid -ne $adminPid -or
    $result.oldRun -cne 'run-20261002T184156594Z-0e3e5e6a' -or $result.sourceWrites -ne 0 -or $result.runtimeActions -ne 0 -or
    $result.oldLockSha256 -cne (Crm-Json (Join-Path $script:CrmCandidateRoot 'PRIOR_ABORT_PINS.json')).lockSha256){throw 'BOUND_PRIOR_RECONCILIATION_RESULT_REQUIRED'}
 $archive=Crm-SafePath $script:CrmPriorRoot ('ACTIVE_INSTALL.archived-'+$result.oldRun+'.lock')
 if($result.archiveRelativePath -cne (Split-Path $archive -Leaf) -or (Test-Path -LiteralPath (Crm-SafePath $script:CrmPriorRoot 'ACTIVE_INSTALL.lock')) -or
    -not(Test-Path -LiteralPath $archive) -or (Crm-Sha $archive) -cne $result.oldLockSha256){throw 'PRIOR_ARCHIVE_PROOF_CHANGED_STOP'}
}
