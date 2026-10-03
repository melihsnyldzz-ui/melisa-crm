# Function declarations only. Import does not inspect runtime or launch anything.
$script:CrmCandidateRoot=$PSScriptRoot
$script:CrmReleaseRoot='C:\Users\Xaser\Documents\Codex\2026-09-30\task-3\CRM_UNIFIED_MEDIA_RELEASE_DEV_20261002'
$script:CrmDeploymentRoot=Join-Path $PSScriptRoot 'deployment-dependency'
$script:CrmControlRoot=Join-Path $script:CrmDeploymentRoot 'controlled-install'
$script:CrmAppsRoot='C:\Users\Xaser\Documents\Codex\2026-05-20\melisa-mini-erp-temiz-repoyu-bu\melisa-erp-v2\apps'
$script:CrmSid='S-1-5-21-2170750028-1005938530-2568122015-1001'
$script:CrmPs5='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$script:CrmNode='C:\Program Files\nodejs\node.exe'
$script:CrmReleaseSha='b2ee0f3bd50391e6310397ae80fd280c82dfb123777ff32a2a3815252ed0aba0'
$script:CrmBackendSha='0b19eabb9f6ab73c741fe11d4b78c6e788527b6e93e919299d320762c24037f1'
function Crm-Sha([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()}
function Crm-AssertPreviousRunReconciled {
 $previous='C:\Users\Xaser\Documents\Codex\2026-09-30\task-3\CRM_UNIFIED_ORCHESTRATOR_DEV_20261002\ACTIVE_INSTALL.lock'
 if(Test-Path -LiteralPath $previous){throw 'PREVIOUS_ABORTED_RUN_RECONCILIATION_REQUIRED_NO_APPLY'}
}
function Crm-Json([string]$path){Get-Content -LiteralPath $path -Raw -ErrorAction Stop|ConvertFrom-Json}
function Crm-Utc($value){
 if($value -is [DateTime]){return $value.ToUniversalTime()}
 return [DateTimeOffset]::Parse([string]$value,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime
}
function Crm-AssertSession($session,[string]$nonce,[DateTime]$now,[int]$sessionId){
 $issued=Crm-Utc $session.issuedAt;$expires=Crm-Utc $session.expiresAt
 if($nonce -cnotmatch '^[a-f0-9]{64}$' -or $session.nonce -cne $nonce -or
    $session.outer.sid -cne $script:CrmSid -or $session.outer.elevated -or
    $session.outer.pid -le 0 -or $session.outer.sessionId -ne $sessionId -or
    $issued -gt $now -or $expires -le $now -or $expires -le $issued -or
    ($expires-$issued).TotalSeconds -gt 900){throw 'EXACT_ACTIVE_ADMIN_SESSION_REQUIRED'}
 $null=Crm-Utc $session.outer.createdUtc
}
function Crm-AssertBackendRequest($request,$session,[string]$nonce,[int]$adminPid,[DateTime]$now){
 $issued=Crm-Utc $request.issuedAt;$expires=Crm-Utc $request.expiresAt
 if($request.nonce -cne $nonce -or $request.adminPid -ne $adminPid -or
    $request.outerPid -ne $session.outer.pid -or $request.workerPid -le 0 -or
    $issued -gt $now -or $expires -le $now -or $expires -le $issued -or
    ($expires-$issued).TotalSeconds -gt 90){throw 'FRESH_BOUND_BACKEND_REQUEST_REQUIRED'}
}
function Crm-AssertNativeParentTime($expected,$native,$cim){
 $want=Crm-Utc $expected;$exact=Crm-Utc $native;$metadata=Crm-Utc $cim
 # Native StartTime has 100ns ticks; CIM DMTF only has microseconds.
 # Keep full native equality. Only the CIM cross-check uses microsecond floor.
 if($exact.Ticks -ne $want.Ticks -or
    ($exact.Ticks-($exact.Ticks%10)) -ne ($metadata.Ticks-($metadata.Ticks%10))){
  throw 'EXACT_NORMAL_PARENT_CREATION_REQUIRED'
 }
}
function Crm-AssertCommitGate($session,$request,[string]$nonce,[int]$adminPid,[int]$sessionId,
 [DateTime]$now,[bool]$aborted,[bool]$parentExited,$ready){
 if($aborted -or $parentExited){throw 'NORMAL_COORDINATOR_ABORTED_STOP'}
 Crm-AssertSession $session $nonce $now $sessionId
 Crm-AssertBackendRequest $request $session $nonce $adminPid $now
 $issued=Crm-Utc $ready.createdAt;$expires=Crm-Utc $ready.expiresAt
 if($ready.nonce -cne $nonce -or $ready.workerPid -ne $request.workerPid -or $ready.elevated -or
    $ready.sid -cne $script:CrmSid -or $ready.manifestSha256 -cne $script:CrmBackendSha -or
    $ready.entrySha256 -cne 'ebff8fd92ab24533dfe3cdd4fb9c7a79bf2455b8ea5afff3beaf8eb02adebab7' -or $ready.restoreOnly -or
    $issued -gt $now -or $expires -le $now -or $expires -le $issued -or
    ($expires-$issued).TotalSeconds -gt 240){throw 'EXACT_UNEXPIRED_NORMAL_BROKER_REQUIRED'}
}
function Crm-JournalDenial($journal,[bool]$terminalControlDenial){
 # The sealed controller can sanitize a native process-context error before
 # recording it. Preserve a terminal flag; an ambiguous context failure also
 # requires attention, without claiming that its native cause was observed.
 return ($terminalControlDenial -or (Crm-Field $journal 'terminalControlDenial' $false) -or
  ((Crm-Field $journal 'failure' '') -match 'ACCESS_DENIED|PERMISSION_DENIED|PROCESS_CONTEXT_QUERY_FAILED|CONTROL_DENIAL'))
}
function Crm-Identity([bool]$Admin){
 if($PSVersionTable.PSVersion.Major -ne 5){throw 'WINDOWS_POWERSHELL_5_REQUIRED'}
 $i=[Security.Principal.WindowsIdentity]::GetCurrent();$p=[Security.Principal.WindowsPrincipal]::new($i)
 $elevated=$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 if($i.Name -cne 'SEMIH\Xaser' -or $i.User.Value -cne $script:CrmSid -or $elevated -ne $Admin){throw 'EXACT_XASER_ROLE_REQUIRED'}
 $own=Get-Process -Id $PID -ErrorAction Stop
 return [pscustomobject]@{sid=$i.User.Value;elevated=$elevated;pid=$PID;createdUtc=$own.StartTime.ToUniversalTime().ToString('o');sessionId=$own.SessionId}
}
function Crm-SafePath([string]$base,[string]$relative){
 if($relative -match '(^|[\\/])(\.\.?(?:[\\/]|$)|\.env(?:\.|$)|\.npmrc(?:\.|[\\/]|$)|credentials(?:\.|[\\/]|$))' -or $relative.Contains(':') -or [IO.Path]::IsPathRooted($relative)){throw 'EXACT_NONSECRET_RELATIVE_PATH_REQUIRED'}
 $base=[IO.Path]::GetFullPath($base).TrimEnd('\');$target=[IO.Path]::GetFullPath((Join-Path $base $relative))
 if(-not $target.StartsWith($base+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'RELATIVE_PATH_OUTSIDE_FIXED_ROOT'}
 $walk=$base
 if((Get-Item -LiteralPath $base -Force -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'ROOT_REPARSE_REJECTED'}
 foreach($part in ($relative -split '[\\/]')){$walk=Join-Path $walk $part;if(Test-Path -LiteralPath $walk){if((Get-Item -LiteralPath $walk -Force -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PATH_REPARSE_REJECTED'}}}
 return $target
}
function Crm-WriteNew([string]$path,$object){
 if(Test-Path -LiteralPath $path){throw 'SINGLE_USE_RECEIPT_ALREADY_EXISTS'}
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($object|ConvertTo-Json -Depth 14))
 $temporary=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 $h=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$h.Write($bytes,0,$bytes.Length);$h.Flush($true)}finally{$h.Dispose()}
 try{[IO.File]::Move($temporary,$path)}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function Crm-Nonce {
 $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
 return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
}
function Crm-Error($record,[bool]$terminalControlDenial=$false){
 $code=if($record.Exception.Message -cmatch '^[A-Z0-9_]+$'){$record.Exception.Message}else{'SANITIZED_WINDOWS_OPERATION_FAILED'}
 $native=$null;$denied=($terminalControlDenial -or $record.CategoryInfo.Category -eq 'PermissionDenied');$e=$record.Exception
 for($n=0;$n -lt 8 -and $e;$n++){if($e -is [ComponentModel.Win32Exception]){$native=$e.NativeErrorCode;if($native -eq 5){$denied=$true}};if($e -is [UnauthorizedAccessException]){$denied=$true};$e=$e.InnerException}
 return [ordered]@{code=$code;exceptionType=$record.Exception.GetType().FullName;hresult=$record.Exception.HResult;nativeCode=$native;permissionDenied=$denied;terminalControlDenial=$terminalControlDenial;rawMessageLogged=$false;userRefusalProven=$false}
}
function Crm-Field($object,[string]$name,$default=$null){
 if($null -eq $object){return $default}
 if($object -is [Collections.IDictionary]){if($object.Contains($name)){return $object[$name]};return $default}
 $property=$object.PSObject.Properties[$name];if($null -eq $property){return $default};return $property.Value
}
function Crm-BaseHashes {
 $manifest=Crm-Json (Join-Path $script:CrmReleaseRoot 'controlled-install\FIRST_PAGE_CANDIDATE_MANIFEST.json')
 foreach($file in $manifest.files){$target=Crm-SafePath $script:CrmAppsRoot $file.path
  if($file.baseSha256){if(-not(Test-Path -LiteralPath $target) -or (Crm-Sha $target) -cne $file.baseSha256){return $false}}
  elseif(Test-Path -LiteralPath $target){return $false}
 };return $true
}
function Crm-ValidateCandidate {
 $manifestPath=Join-Path $script:CrmCandidateRoot 'ORCHESTRATOR_MANIFEST.json'
 $manifest=Crm-Json $manifestPath
 foreach($file in $manifest.files){if((Crm-Sha (Crm-SafePath $script:CrmCandidateRoot $file.path)) -cne $file.sha256){throw 'ORCHESTRATOR_FILE_DRIFT_STOP'}}
 $review=Crm-Json (Join-Path $script:CrmCandidateRoot 'INDEPENDENT_REVIEW.json')
 if($review.status -cne 'DEV_PASS' -or $review.manifestSha256 -cne (Crm-Sha $manifestPath)){throw 'INDEPENDENT_ORCHESTRATOR_REVIEW_REQUIRED'}
 if((Crm-Sha (Join-Path $script:CrmReleaseRoot 'RELEASE_MANIFEST.json')) -cne $script:CrmReleaseSha){throw 'SEALED_RELEASE_MANIFEST_CHANGED'}
 $release=Crm-Json (Join-Path $script:CrmReleaseRoot 'RELEASE_MANIFEST.json')
 foreach($file in $release.files){if((Crm-Sha (Crm-SafePath $script:CrmReleaseRoot $file.file)) -cne $file.sha256){throw 'SEALED_RELEASE_FILE_DRIFT_STOP'}}
 return $manifest
}
function Crm-RunRoot([string]$path){
 $p=[IO.Path]::GetFullPath($path);$parent=Join-Path $script:CrmCandidateRoot 'runs'
 if((Split-Path $p -Parent) -cne $parent -or (Split-Path $p -Leaf) -notmatch '^run-\d{8}T\d{9}Z-[a-f0-9]{8}$'){throw 'FIXED_ORCHESTRATION_RUN_REQUIRED'}
 $null=Crm-SafePath $script:CrmCandidateRoot ('runs/'+(Split-Path $p -Leaf))
 return $p
}
function Crm-AfterHashes {
 $manifest=Crm-Json (Join-Path $script:CrmReleaseRoot 'controlled-install\FIRST_PAGE_CANDIDATE_MANIFEST.json')
 if((Crm-Sha (Join-Path $script:CrmReleaseRoot 'controlled-install\FIRST_PAGE_CANDIDATE_MANIFEST.json')) -cne $script:CrmBackendSha -or $manifest.files.Count -ne 24){throw 'EXACT_BACKEND_MANIFEST_REQUIRED'}
 foreach($file in $manifest.files){$target=Crm-SafePath $script:CrmAppsRoot $file.path;if(-not(Test-Path -LiteralPath $target) -or (Crm-Sha $target) -cne $file.candidateSha256){return $false}}
 return $true
}
function Crm-UiHost([string]$action){
 if($action -notin @('Identity','Probe')){throw 'READONLY_UI_HOST_ACTION_REQUIRED'}
 $helper=Join-Path $script:CrmReleaseRoot 'owned-host-metadata.ps1'
 if((Crm-Sha $helper) -cne 'cce1cec0793445ced1dae0ca7243c47ac830bfcfc4f723f4f27f9c70b1b18c54'){throw 'SEALED_UI_HOST_HASH_CHANGED'}
 $LASTEXITCODE=0
 $text=(& $script:CrmPs5 -NoProfile -NonInteractive -File $helper -Action $action -ApprovedOwned4212Runtime|Out-String)
 $result=$text|ConvertFrom-Json
 if($LASTEXITCODE -ne 0 -or -not $result.success){if($result.permissionDenied){throw 'UI_PERMISSION_DENIED_STOP'};throw 'UI_NORMAL_METADATA_FAILED_STOP'}
 return $result
}
