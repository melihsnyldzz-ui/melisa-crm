# Pure control flow. All filesystem/process/Windows operations are injected.
function Invoke-CrmUnifiedOrchestration {
 param([Parameter(Mandatory=$true)][hashtable]$Ports)
 $required=@('Identity','Validate','Acquire','Event','ElevateOnce','NormalUiPreflight','ReconcilePrior','StartBroker','Backend','AfterHashes','PrepareUi','ApplyUi','RecoverUi','Abort','Finish')
 foreach($name in $required){if(-not $Ports.ContainsKey($name) -or $Ports[$name] -isnot [scriptblock]){throw 'ORCHESTRATOR_PORT_REQUIRED'}}
 $stage='identity';$acquired=$false;$backend=$null;$ui=$null;$result=$null;$reconciled=$null
 try {
  $identity=& $Ports.Identity
  if($identity.sid -cne 'S-1-5-21-2170750028-1005938530-2568122015-1001' -or $identity.elevated){throw 'NORMAL_XASER_ENTRYPOINT_REQUIRED'}
  $stage='validate';$null=& $Ports.Validate
  $stage='lock';$null=& $Ports.Acquire;$acquired=$true
  $null=& $Ports.Event 'WAITING_FOR_WINDOWS_CONSENT'
  $stage='elevation';$admin=& $Ports.ElevateOnce
  if(-not $admin.ready -or -not $admin.elevated -or $admin.sid -cne $identity.sid){throw 'EXACT_ADMIN_READY_REQUIRED'}
  $stage='normal-ui-preflight';$normalUi=& $Ports.NormalUiPreflight
  if(-not $normalUi.fresh -or -not $normalUi.normal){throw 'NORMAL_UI_READ_CAPABILITY_REQUIRED_BEFORE_BACKEND'}
  $null=& $Ports.Event 'RECONCILING_KNOWN_ABORT'
  $stage='prior-reconciliation';$reconciled=& $Ports.ReconcilePrior $admin $normalUi
  if(-not $reconciled.success -or -not $reconciled.archiveVerified){throw 'BOUND_PRIOR_RECONCILIATION_RESULT_REQUIRED'}
  # Broker TTL begins after Windows consent. No copied-user-command delay.
  $stage='normal-broker';$broker=& $Ports.StartBroker $admin
  if(-not $broker.ready -or $broker.elevated -or $broker.sid -cne $identity.sid){throw 'EXACT_NORMAL_BROKER_REQUIRED'}
  $null=& $Ports.Event 'BACKEND_REQUEST'
  $stage='backend';$backend=& $Ports.Backend $admin $broker
  if(-not $backend.success){
   $state=if($backend.safeStopped){'BACKEND_STOPPED_BEFORE_CHANGE'}elseif($backend.rollbackComplete){'BACKEND_ROLLED_BACK'}else{'BACKEND_ATTENTION_REQUIRED'}
   $result=[ordered]@{state=$state;complete=$false;attentionRequired=($backend.permissionDenied -or -not($backend.safeStopped -or $backend.rollbackComplete));backend=$backend;ui=$null}
  }else{
   $stage='after-hashes';if(-not(& $Ports.AfterHashes $backend)){throw 'BACKEND_AFTER_HASH_DRIFT_STOP'}
   $null=& $Ports.Event 'BACKEND_VERIFIED_UI_PROOF'
   $stage='ui-proof';$proof=& $Ports.PrepareUi $backend
   if(-not $proof.fresh -or -not $proof.normal -or -not $proof.installedPins){throw 'FRESH_NORMAL_UI_PROOF_REQUIRED'}
   $stage='ui-apply';$ui=& $Ports.ApplyUi $proof
   if($ui.success){
    $result=[ordered]@{state='INSTALL_COMPLETE_ACCEPTANCE_PENDING';complete=$true;attentionRequired=$false;backend=$backend;ui=$ui}
   }elseif($ui.recoveryEligible){
    $null=& $Ports.Event 'KNOWN_OWNED_UI_RECOVERY'
    $stage='ui-recovery';$recovery=& $Ports.RecoverUi $proof $ui
    $result=[ordered]@{state=$(if($recovery.success){'BACKEND_APPLIED_OLD_UI_RECOVERED'}else{'UI_RECOVERY_ATTENTION_REQUIRED'});complete=$false;attentionRequired=(-not $recovery.success);backend=$backend;ui=$ui;recovery=$recovery}
   }else{
    $result=[ordered]@{state='BACKEND_APPLIED_UI_STOPPED';complete=$false;attentionRequired=$true;backend=$backend;ui=$ui}
   }
  }
 }catch{
  $code=if($_.Exception.Message -cmatch '^[A-Z0-9_]+$'){$_.Exception.Message}else{'ORCHESTRATOR_FAILED_STOP'}
  # An applied backend stays a partially installed system when UI proof fails,
  # regardless of the wording of the exception. Never unlock that state.
  $uncertain=($stage -eq 'backend' -or $stage -eq 'prior-reconciliation' -or ($null -ne $backend -and $backend.success) -or
    $code -match 'UNCERTAIN|TIMEOUT|MISSING_RECEIPT|AFTER_HASH_DRIFT|UI_RECOVERY|PERMISSION_DENIED|ACCESS_DENIED|LOCK_SETUP')
  $result=[ordered]@{state='STOP';complete=$false;attentionRequired=$uncertain;stage=$stage;code=$code;backend=$backend;ui=$ui}
 }finally{
  if($acquired){
   if($null -ne $reconciled -and $reconciled.success -and $reconciled.archiveVerified -and -not $result.complete){
    # A later failure cannot silently unlock a run that archived prior evidence.
    $result.attentionRequired=$true
   }
   try{
    if(-not $result.complete){$null=& $Ports.Abort $result}
    $null=& $Ports.Finish $result
   }catch{
    $result.complete=$false
    $result.attentionRequired=$true
    $result.state='FINALIZATION_ATTENTION_REQUIRED'
    $result.finalizationCode=if($_.Exception.Message -cmatch '^[A-Z0-9_]+$'){$_.Exception.Message}else{'FINAL_RECEIPT_OR_LOCK_REQUIRES_REVIEW'}
   }
  }
 }
 return $result
}
