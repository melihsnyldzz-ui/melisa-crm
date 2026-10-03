param([switch]$ApprovedBoundedOwnerMediaActivation,[switch]$ApprovedLocalCatalogLogoutOrigin,[switch]$Apply,[switch]$OfflinePreflightOnly,[scriptblock]$RecheckCommitGate,[string]$RollbackRun,[int]$ExpectedNormalParentPid,[string]$BrokerDirectory,[string]$Nonce)
$ErrorActionPreference='Stop'
$script:operatorRestoreOnly=$false
$script:lastNormalLaunchReceipt=$null
$expectedSid='S-1-5-21-2170750028-1005938530-2568122015-1001'
$packageRoot=$PSScriptRoot
$appsRoot='C:\Users\Xaser\Documents\Codex\2026-05-20\melisa-mini-erp-temiz-repoyu-bu\melisa-erp-v2\apps'
$serviceName='MelisaWhatsAppCrmGateway'
$nodePath='C:\Program Files\nodejs\node.exe'
$manifestSha='0b19eabb9f6ab73c741fe11d4b78c6e788527b6e93e919299d320762c24037f1'
$expected=@('api/src/services/crmCatalogReadSource.mjs','api/src/routes/crmCatalogReadRoutes.js','whatsapp-crm-api/src/services/catalogBridge.mjs','whatsapp-crm-api/src/services/erpSourceContract.mjs','whatsapp-crm-api/src/middleware/catalogReadBudget.mjs','api/src/workers/crmExistingStockReadWorker.mjs','whatsapp-crm-api/src/services/catalogRouter.mjs','whatsapp-crm-api/src/routes/index.js','whatsapp-crm-api/src/middleware/security.js','whatsapp-crm-api/src/app.js','whatsapp-crm-api/src/config/env.js','whatsapp-crm-api/src/controllers/conversationController.js','whatsapp-crm-api/src/middleware/messageUploadParser.js','whatsapp-crm-api/src/providers/waapiProvider.js','whatsapp-crm-api/src/services/chatwootConversationService.js','whatsapp-crm-api/src/services/chatwootInboxService.js','whatsapp-crm-api/src/services/outboundAttemptService.js','whatsapp-crm-api/src/services/sendService.js','whatsapp-crm-api/src/services/waapiChatwootBridge.js','whatsapp-crm-api/src/services/waapiJournal.js','whatsapp-crm-api/src/services/waapiWebhookService.js','whatsapp-crm-api/src/utils/mediaFormatValidation.js','whatsapp-crm-api/src/utils/messageMedia.js','whatsapp-crm-api/src/config/boundedOwnerMediaActivation.js')
function Sha([string]$file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
function Target($file){$resolved=[IO.Path]::GetFullPath((Join-Path $appsRoot $file.path));if(-not $resolved.StartsWith($appsRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'TARGET_OUTSIDE_APPROVED_APPS'};return $resolved}
function Candidate($file){Join-Path (Join-Path $packageRoot 'candidate') $file.path}
function Backup([string]$runPath,$file){Join-Path (Join-Path $runPath 'before') $file.path}
function Status([string]$url){return Get-ControlledHttpStatus $url}
function Smoke {
  $s=[ordered]@{health=Status 'http://127.0.0.1:4200/health';authMe=Status 'http://127.0.0.1:4200/auth/me';inbox=Status 'http://127.0.0.1:4200/crm/inbox';catalog=Status 'http://127.0.0.1:4200/crm/catalog/products';loginGet=Status 'http://127.0.0.1:4200/auth/login';erpHealth=Status 'http://127.0.0.1:4100/api/health';erpCatalog=Status 'http://127.0.0.1:4100/api/crm-catalog/products'}
  if($s.health -ne 200 -or $s.authMe -ne 401 -or $s.inbox -ne 401 -or $s.catalog -ne 401 -or $s.loginGet -ne 404 -or $s.erpHealth -ne 200 -or $s.erpCatalog -ne 401){throw 'ANONYMOUS_SMOKE_FAILED'};return $s
}
function Owner([int]$port,[switch]$AllowStopped){
  $helper=Join-Path $packageRoot 'owner-diagnostic-fix\port-owner-diagnostics.ps1'
  if((Sha $helper) -ne '893b7fe45b9330dc8d3b96992c8df88f25f116c561a06ed9cc0f6fb25fd86ab0'){throw 'REVIEWED_OWNER_HELPER_HASH_REQUIRED'}
  . $helper
  $result=Get-PortOwnerEvidence -Port $port -ExpectedNodePath $nodePath -AllowStopped:$AllowStopped
  if(-not $result.success){if($result.code -match 'ACCESS_DENIED'){$script:terminalControlDenial=$true};$result | ConvertTo-Json -Depth 7 | Write-Host;throw $result.code}
  $stopped=$result.PSObject.Properties['stopped']
  if($null -ne $stopped -and $stopped.Value -eq $true){return $null}
  return $result.owner
}
function Confirm-NormalErpConsole($owner){
  if($ExpectedNormalParentPid -lt 1 -or $owner.pid -ne 6968 -or $owner.parentPid -ne 31604 -or
    $owner.createdUtc.ToUniversalTime().ToString('o') -cne '2026-10-01T09:35:26.9240070Z'){throw 'EXACT_APPROVED_EXISTING_ERP_REQUIRED'}
  $ready=Assert-NormalWorkerReady
  $oldContext=Read-ProcessContext $owner.pid
  if($oldContext.sid -cne $expectedSid -or $oldContext.elevated){throw 'OLD_ERP_NORMAL_XASER_REQUIRED'}
  return [pscustomobject]@{method='explicit-approved-admin-control-normal-launch';apiDirectory=(Join-Path $appsRoot 'api');entryFile=(Join-Path $appsRoot 'api\src\server.js');listenerPid=$owner.pid;parentPid=$owner.parentPid;expectedNewNormalParentPid=$ExpectedNormalParentPid;normalWorkerCreatedUtc=$ready.workerCreatedUtc;normalWorkerSid=$ready.sid;normalWorkerElevated=$false;commandLineRead=$false;cwdRead=$false}
}
function Assert-ServiceRegistration {
  $key='HKLM:\SYSTEM\CurrentControlSet\Services\MelisaWhatsAppCrmGateway\Parameters'
  if((Get-ItemPropertyValue -LiteralPath $key -Name AppDirectory).TrimEnd('\') -ne (Join-Path $appsRoot 'whatsapp-crm-api') -or (Get-ItemPropertyValue -LiteralPath $key -Name Application) -ne $nodePath){throw 'REGISTERED_GATEWAY_SOURCE_MISMATCH'}
}
function Assert-ServiceSource {
  Assert-ServiceRegistration
  if((Get-Service -Name $serviceName -ErrorAction Stop).Status -ne 'Running'){throw 'APPROVED_GATEWAY_NOT_RUNNING'}
  $owner=Owner 4200;$service=Read-ControlledMetadata 'Win32_Service' "Name='MelisaWhatsAppCrmGateway'" @('ProcessId')
  if($service.ProcessId -le 0 -or $owner.parentPid -ne $service.ProcessId){throw 'GATEWAY_OWNER_SERVICE_MISMATCH'};return $owner
}
function Assert-Control {
  $probe=Join-Path (Split-Path $packageRoot -Parent) 'query-approved-service-access.ps1'
  $access=(& $probe | Out-String) | ConvertFrom-Json
  if($access.service -ne $serviceName -or @($access.access | Where-Object {$_.operation -in @('start','stop') -and $_.allowed}).Count -ne 2){throw 'SERVICE_START_STOP_ACCESS_REQUIRED_BEFORE_APPLY'}
}
function Assert-Binds($before,$after){if(@(Compare-Object @($before.binds) @($after.binds)).Count){throw 'LISTENER_BIND_CHANGED'}}
function Assert-SameOwner($before,$after){
  if($before.pid -ne $after.pid -or $before.parentPid -ne $after.parentPid -or $before.createdUtc -ne $after.createdUtc){throw 'OWNER_CHANGED_BEFORE_APPLY'}
  Assert-Binds $before $after
}
function Restart-Gateway($originalOwner){
  $service=Get-Service -Name $serviceName
  if($service.Status -eq 'Stopped'){Start-Service -Name $serviceName -ErrorAction Stop}else{Restart-Service -Name $serviceName -ErrorAction Stop}
  (Get-Service -Name $serviceName).WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running,[TimeSpan]::FromSeconds(30))
  for($i=0;$i -lt 10;$i++){if((Status 'http://127.0.0.1:4200/health') -eq 200){$after=Assert-ServiceSource;Assert-Binds $originalOwner $after;return $after};Start-Sleep -Seconds 1};throw 'GATEWAY_RESTART_HEALTH_FAILED'
}
function Normal-ErpReload($before,[DateTime]$afterUtc){
  return Invoke-AdminControlledNormalLaunch $before $afterUtc
}
function Restore-Files([string]$runPath,$files){
  # Complete conflict/backup checks before touching any file. Never overwrite a concurrent user edit.
  foreach($file in $files){$target=Target $file;if($file.baseSha256){if((Sha (Backup $runPath $file)) -ne $file.baseSha256){throw 'ROLLBACK_BACKUP_HASH_MISMATCH'};if((Sha $target) -notin @($file.candidateSha256,$file.baseSha256)){throw 'ROLLBACK_CONCURRENT_EDIT'}}elseif((Test-Path -LiteralPath $target) -and (Sha $target) -ne $file.candidateSha256){throw 'ROLLBACK_CONCURRENT_NEW_FILE'}}
  foreach($file in $files){$target=Target $file;if($file.baseSha256){if((Sha $target) -eq $file.baseSha256){continue};$temp=$target+'.crm-photo-restore-'+[Guid]::NewGuid().ToString('N')+'.tmp';try{Copy-Item -LiteralPath (Backup $runPath $file) -Destination $temp;if((Sha $temp) -ne $file.baseSha256){throw 'RESTORE_COPY_HASH_MISMATCH'};if((Sha $target) -ne $file.candidateSha256){throw 'ROLLBACK_CONCURRENT_EDIT'};Move-Item -LiteralPath $temp -Destination $target -Force}finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp}}}elseif(Test-Path -LiteralPath $target){if((Sha $target) -ne $file.candidateSha256){throw 'ROLLBACK_CONCURRENT_NEW_FILE'};Remove-Item -LiteralPath $target}}
  foreach($file in $files){if($file.baseSha256){if((Sha (Target $file)) -ne $file.baseSha256){throw 'RESTORE_HASH_MISMATCH'}}elseif(Test-Path -LiteralPath (Target $file)){throw 'RESTORE_NEW_FILE_REMAINS'}}
}
function Assert-BeforeLiveFileMutation {
  if(-not $RecheckCommitGate){throw 'FINAL_ORCHESTRATOR_COMMIT_GATE_REQUIRED'}
  $null=Assert-NormalWorkerReady
  & $RecheckCommitGate
}
function Install-File($file){
  $target=Target $file
  if($file.baseSha256){if((Sha $target) -ne $file.baseSha256){throw 'CONCURRENT_BASE_EDIT'}}elseif(Test-Path -LiteralPath $target){throw 'CONCURRENT_NEW_FILE'}
  $temp=$target+'.crm-first-photo-'+[Guid]::NewGuid().ToString('N')+'.tmp'
  try{Assert-BeforeLiveFileMutation;Copy-Item -LiteralPath (Candidate $file) -Destination $temp;if((Sha $temp) -ne $file.candidateSha256){throw 'COPY_HASH_MISMATCH'};if($file.baseSha256){if((Sha $target) -ne $file.baseSha256){throw 'CONCURRENT_BASE_EDIT'}}elseif(Test-Path -LiteralPath $target){throw 'CONCURRENT_NEW_FILE'};Assert-BeforeLiveFileMutation;Move-Item -LiteralPath $temp -Destination $target -Force}finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp}}
}
function Write-Journal([string]$runPath,$journal){
  $destination=Join-Path $runPath 'result.json';$temporary=Join-Path $runPath ('journal-'+[Guid]::NewGuid().ToString('N')+'.tmp')
  try{$journal | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $temporary -Encoding UTF8;Move-Item -LiteralPath $temporary -Destination $destination -Force}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function Assert-Ps5OfflineFixtures {
  $root=Split-Path (Split-Path $packageRoot -Parent) -Parent
  . (Join-Path $root 'Invoke-FullOfflinePreflight.ps1')
  return Invoke-CrmFullOfflinePreflight $root $nodePath
}
if($OfflinePreflightOnly){
  if($Apply -or $RollbackRun){throw 'OFFLINE_AND_RUNTIME_FLAGS_MUTUALLY_EXCLUSIVE'}
  try{$proof=Assert-Ps5OfflineFixtures;$proof|ConvertTo-Json -Depth 8;exit 0}
  catch{
    $data=$_.Exception.Data['OfflinePreflight']
    if($data){$data|ConvertTo-Json -Depth 8}else{[ordered]@{status='FAIL';code='OFFLINE_PREFLIGHT_SETUP_FAILED';productionRuntimeActions=0}|ConvertTo-Json}
    exit 1
  }
}
if(-not $ApprovedBoundedOwnerMediaActivation){throw 'SEPARATELY_APPROVED_BOUNDED_OWNER_MEDIA_ACTIVATION_REQUIRED'}
if(-not $ApprovedLocalCatalogLogoutOrigin){throw 'SEPARATELY_APPROVED_EXACT_LOCAL_LOGOUT_ORIGIN_REQUIRED'}
if($Apply -and $RollbackRun){throw 'MUTUALLY_EXCLUSIVE_OPERATIONS'}
$manifestPath=Join-Path $packageRoot 'FIRST_PAGE_CANDIDATE_MANIFEST.json'
if((Sha $manifestPath) -ne $manifestSha){throw 'PINNED_MANIFEST_HASH_MISMATCH'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($manifest.files.Count -ne 24 -or @(Compare-Object $expected @($manifest.files.path)).Count){throw 'EXACT_TWENTY_FOUR_FILE_ALLOWLIST_REQUIRED'}
$review=Get-Content -LiteralPath (Join-Path $packageRoot 'role-separated-deploy-review.json') -Raw | ConvertFrom-Json
if($review.codeReview -ne 'PASS' -or $review.deploymentReview -ne 'PASS' -or $review.candidateTestsPassed -ne 247 -or $review.manifestSha256 -ne $manifestSha -or $review.scriptSha256 -ne (Sha $PSCommandPath)){throw 'REVIEW_AND_TEST_GATE_REQUIRED'}
if(-not $Apply -and -not $RollbackRun){throw 'EXPLICIT_APPLY_OR_ROLLBACK_REQUIRED_NO_AUTOMATIC_PREFLIGHT'}
if($PSVersionTable.PSVersion.Major -ne 5){throw 'PS5_REQUIRED'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.Name -cne 'SEMIH\Xaser' -or $identity.User.Value -cne $expectedSid -or -not([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'APPROVED_XASER_ADMIN_CONTROLLER_REQUIRED'}
$control=Join-Path $packageRoot 'operator-admin-launch-control.candidate.ps1';$worker=Join-Path $packageRoot 'operator-normal-launch-worker.candidate.ps1'
if((Sha $control) -cne '272d1a6ee5991b928bafecd4103fdd159e28858f38408ed5b1f74b30d533b334' -or (Sha $worker) -cne '99d5255397055386704fdeaf72ec82cb0761b5cdea557184593f48817459600b' -or $Nonce -notmatch '^[a-f0-9]{64}$'){throw 'ROLE_SEPARATION_PINS_REQUIRED'}
. $control
$script:operatorRestoreOnly=[bool]$RollbackRun
$script:terminalControlDenial=$false
$script:lastNormalLaunchRequest=$null
$null=Assert-NormalWorkerReady
$offlineProof=Assert-Ps5OfflineFixtures # Same full package preflight as OfflinePreflightOnly.
foreach($file in $manifest.files){if((Sha (Candidate $file)) -ne $file.candidateSha256){throw 'CANDIDATE_HASH_MISMATCH'};& $nodePath --check (Candidate $file);if($LASTEXITCODE -ne 0){throw 'CANDIDATE_SYNTAX_FAILED'}}
if($RollbackRun){
  $resolved=(Resolve-Path -LiteralPath $RollbackRun).Path
  if((Split-Path $resolved -Parent) -ne [IO.Path]::GetFullPath($packageRoot) -or (Split-Path $resolved -Leaf) -notmatch '^deployment-[0-9]{8}T[0-9]{9}Z$'){throw 'ROLLBACK_RUN_OUTSIDE_PACKAGE'}
  $journal=Get-Content -LiteralPath (Join-Path $resolved 'result.json') -Raw | ConvertFrom-Json
  if($journal.journalVersion -cne 'role-separated-v1'){throw 'ROLLBACK_REVIEWED_JOURNAL_VERSION_REQUIRED'}
  Assert-PreviousWorkerExited $journal
  $recover=@($journal.installed);if($journal.pendingFile){$recover+=$journal.pendingFile};$recover=@($recover | Sort-Object -Unique)
  if($journal.manifestSha256 -ne $manifestSha -or $recover.Count -eq 0 -or @($recover | Where-Object {$_ -notin $expected}).Count -or @($journal.installed | Sort-Object -Unique).Count -ne @($journal.installed).Count){throw 'ROLLBACK_JOURNAL_SCOPE_MISMATCH'}
  foreach($bindings in @($journal.erpBindsBefore,$journal.gatewayBindsBefore)){if(@($bindings).Count -lt 1 -or @($bindings).Count -gt 2){throw 'ROLLBACK_BIND_EVIDENCE_REQUIRED'};foreach($address in $bindings){$parsedIp=$null;if($address -isnot [string] -or -not [Net.IPAddress]::TryParse($address,[ref]$parsedIp)){throw 'ROLLBACK_BIND_EVIDENCE_REQUIRED'}}}
  # Recovery permits a stopped listener, never masks access denial, and does not require healthy APIs.
  Assert-ServiceRegistration;Assert-Control
  $runPath=$resolved;$erpBefore=Resolve-RecordedRollbackOwner $journal (Owner 4100 -AllowStopped);$gatewayBefore=Owner 4200 -AllowStopped
  $service=Read-ControlledMetadata 'Win32_Service' "Name='MelisaWhatsAppCrmGateway'" @('ProcessId')
  if($gatewayBefore -and ($service.ProcessId -le 0 -or $gatewayBefore.parentPid -ne $service.ProcessId)){throw 'ROLLBACK_GATEWAY_OWNER_MISMATCH'}
  if(-not $erpBefore){$erpBefore=[pscustomobject]@{pid=0;binds=@($journal.erpBindsBefore)}}
  if(-not $gatewayBefore){$gatewayBefore=[pscustomobject]@{pid=0;binds=@($journal.gatewayBindsBefore)}}
  Assert-Binds ([pscustomobject]@{binds=@($journal.erpBindsBefore)}) $erpBefore;Assert-Binds ([pscustomobject]@{binds=@($journal.gatewayBindsBefore)}) $gatewayBefore
  $files=@($manifest.files | Where-Object {$_.path -in $recover});Restore-Files $resolved $files;$journal.rollbackFilesVerified=$true;Write-Journal $resolved $journal;$restoreUtc=[DateTime]::UtcNow
  $script:operatorRestoreOnly=$true;$runPath=$resolved;$erpAfter=Normal-ErpReload $erpBefore $restoreUtc;$gatewayAfter=Restart-Gateway $gatewayBefore;$statuses=Smoke
  $journal.normalRollbackObserved=$true;$journal.normalRollbackReceipt=$script:lastNormalLaunchReceipt;$journal.rollbackStatuses=$statuses;Write-Journal $resolved $journal
  Control-Write (Join-Path $BrokerDirectory 'complete.json') ([ordered]@{nonce=$Nonce;runDirectory=$runPath;completedAt=[DateTime]::UtcNow.ToString('o');rollback=$true})
  [ordered]@{rollbackFilesVerified=$true;erpNormalReloadObserved=$true;gatewayRestarted=$true;statuses=$statuses;otherServiceChanged=$false;credentialsChanged=$false;authPostPerformed=$false;realProtectedAcceptance=$false} | ConvertTo-Json -Depth 5;exit 0
}
$erpBefore=Owner 4100;$gatewayBefore=Assert-ServiceSource;$baseline=Smoke
foreach($file in $manifest.files){if($file.baseSha256){if((Sha (Target $file)) -ne $file.baseSha256){throw 'LIVE_BASE_CHANGED'}}elseif(Test-Path -LiteralPath (Target $file)){throw 'NEW_FILE_ALREADY_EXISTS'}}
if(-not $Apply){[ordered]@{ready=$true;changed=$false;files=6;erpOwner=$erpBefore.pid;gatewayOwner=$gatewayBefore.pid;statuses=$baseline;normalErpConsoleReloadRequired=$true;credentialsChanged=$false;authPostPerformed=$false} | ConvertTo-Json -Depth 5;exit 0}
Assert-Control # All access/owner/review/base checks happen before backups or production source writes.
if(-not $RecheckCommitGate){throw 'FINAL_ORCHESTRATOR_COMMIT_GATE_REQUIRED'};
$null=Assert-NormalWorkerReady; & $RecheckCommitGate
$erpConsoleEvidence=Confirm-NormalErpConsole $erpBefore
Assert-SameOwner $erpBefore (Owner 4100);Assert-SameOwner $gatewayBefore (Assert-ServiceSource)
$runPath=Join-Path $packageRoot ('deployment-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'));New-Item -ItemType Directory -Path $runPath | Out-Null
$installed=[System.Collections.Generic.List[object]]::new()
$journal=[ordered]@{journalVersion='role-separated-v1';normalBrokerDirectory=$BrokerDirectory;launchControl=$null;rollbackLaunchControl=$null;rollbackHistory=@();normalRollbackObserved=$false;normalRollbackReceipt=$null;rollbackStatuses=$null;manifestSha256=$manifestSha;startedAt=[DateTime]::UtcNow.ToString('o');installed=@();pendingFile=$null;erpOwnerBefore=$erpBefore.pid;erpConsoleEvidence=$erpConsoleEvidence;erpBindsBefore=@($erpBefore.binds);gatewayBindsBefore=@($gatewayBefore.binds);erpNormalReloadObserved=$false;gatewayRestartAttempted=$false;gatewayRestarted=$false;smokePassed=$false;rollbackAttempted=$false;rollbackFilesVerified=$false;erpNormalReloadRequired=$false;otherServiceChanged=$false;credentialsChanged=$false;envOrNetworkConfigurationChanged=$false;sourceContractChanged=$true;authPostPerformed=$false;realProtectedAcceptance=$false}
foreach($file in $manifest.files | Where-Object {$_.baseSha256}){$backup=Backup $runPath $file;New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null;Copy-Item -LiteralPath (Target $file) -Destination $backup;if((Sha $backup) -ne $file.baseSha256){throw 'FRESH_BACKUP_HASH_MISMATCH'}}
try{
  Write-Journal $runPath $journal # Durable before the first live copy, including any pending atomic move.
  foreach($file in $manifest.files | Where-Object {$_.path.StartsWith('api/')}){$journal.pendingFile=$file.path;Write-Journal $runPath $journal;Install-File $file;$installed.Add($file);$journal.installed+=$file.path;$journal.pendingFile=$null;Write-Journal $runPath $journal}
  $erpInstalledUtc=[DateTime]::UtcNow;$erpAfter=Normal-ErpReload $erpBefore $erpInstalledUtc;$journal.erpNormalReloadObserved=$true;$journal.erpOwnerAfter=$erpAfter.pid;$journal.normalLaunchReceipt=$script:lastNormalLaunchReceipt
  Write-Journal $runPath $journal
  foreach($file in $manifest.files | Where-Object {$_.path.StartsWith('whatsapp-crm-api/')}){$journal.pendingFile=$file.path;Write-Journal $runPath $journal;Install-File $file;$installed.Add($file);$journal.installed+=$file.path;$journal.pendingFile=$null;Write-Journal $runPath $journal}
  foreach($file in $manifest.files){if((Sha (Target $file)) -ne $file.candidateSha256){throw 'INSTALLED_HASH_MISMATCH'}}
  $journal.gatewayRestartAttempted=$true;Write-Journal $runPath $journal;$gatewayAfter=Restart-Gateway $gatewayBefore;$journal.gatewayRestarted=$true;$journal.gatewayOwnerAfter=$gatewayAfter.pid;$journal.statuses=Smoke;$journal.smokePassed=$true
}catch{
  $journal.failure=if($_.Exception.Message -match '^[A-Z0-9_]+$'){$_.Exception.Message}else{'CONTROLLED_DEPLOYMENT_FAILED'}
  $recover=@($installed);if($journal.pendingFile){$recover+=@($manifest.files | Where-Object {$_.path -eq $journal.pendingFile -and $_.path -notin $journal.installed})}
  if($recover.Count){$journal.rollbackAttempted=$true;try{Restore-Files $runPath $recover;$journal.rollbackFilesVerified=$true
      $journal.erpNormalReloadRequired=@($recover | Where-Object {$_.path.StartsWith('api/')}).Count -gt 0;Write-Journal $runPath $journal
      if($journal.erpNormalReloadRequired){
        if($script:terminalControlDenial){throw 'CONTROL_DENIAL_REQUIRES_SEPARATE_AUTHORIZED_RECOVERY'}
        $rollbackOwner=Owner 4100 -AllowStopped
        if($rollbackOwner -and $rollbackOwner.pid -eq $erpBefore.pid){Assert-SameOwner $erpBefore $rollbackOwner;$journal.erpNormalReloadRequired=$false}
        else{
          if(-not $script:lastNormalLaunchReceipt){throw 'ROLLBACK_NORMAL_LAUNCH_RECEIPT_REQUIRED'}
          if(-not $rollbackOwner){$rollbackOwner=[pscustomobject]@{pid=0;binds=@($erpBefore.binds)}}
          $script:operatorRestoreOnly=$true;$null=Normal-ErpReload $rollbackOwner ([DateTime]::UtcNow)
          $journal.erpNormalReloadRequired=$false;$journal.normalRollbackObserved=$true;$journal.normalRollbackReceipt=$script:lastNormalLaunchReceipt
        }
      }
      if($journal.gatewayRestartAttempted){$null=Restart-Gateway $gatewayBefore}}catch{$journal.rollbackFailure='AUTHORIZED_HOST_ATTENTION_REQUIRED'}}
}finally{$journal.terminalControlDenial=$script:terminalControlDenial;$journal.finishedAt=[DateTime]::UtcNow.ToString('o');Write-Journal $runPath $journal}
if($journal.smokePassed -or ($journal.rollbackFilesVerified -and -not $journal.erpNormalReloadRequired)){
  Control-Write (Join-Path $BrokerDirectory 'complete.json') ([ordered]@{nonce=$Nonce;runDirectory=$runPath;completedAt=[DateTime]::UtcNow.ToString('o');smokePassed=$journal.smokePassed;rollback=$journal.rollbackFilesVerified})
}
$journal | ConvertTo-Json -Depth 9
if(-not $journal.smokePassed){exit 1}
