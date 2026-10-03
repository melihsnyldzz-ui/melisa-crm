param([Parameter(Mandatory=$true)][string]$BrokerDirectory,[Parameter(Mandatory=$true)][string]$Nonce,[switch]$RestoreOnly)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$packageRoot=$PSScriptRoot
$appsRoot='C:\Users\Xaser\Documents\Codex\2026-05-20\melisa-mini-erp-temiz-repoyu-bu\melisa-erp-v2\apps'
$nodePath='C:\Program Files\nodejs\node.exe'
$apiDirectory=Join-Path $appsRoot 'api'
$entryFile=Join-Path $apiDirectory 'src\server.js'
$manifestSha='0b19eabb9f6ab73c741fe11d4b78c6e788527b6e93e919299d320762c24037f1'
$expectedSid='S-1-5-21-2170750028-1005938530-2568122015-1001'
$script:brokerValidated=$false
function Worker-Sha([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Test-WorkerStoppedPortErrors($records){
  foreach($record in @($records)){
    if($record.CategoryInfo.Category -ne 'ObjectNotFound' -or $record.FullyQualifiedErrorId -notmatch '^CmdletizationQuery_NotFound(?:,|$)' -or
      $record.InvocationInfo.MyCommand.Name -cne 'Get-NetTCPConnection'){return $false}
  }
  return $true
}
function Worker-Write([string]$path,$value){
  if(Test-Path -LiteralPath $path){throw 'HANDSHAKE_FILE_ALREADY_EXISTS'}
  $temporary=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  try{$value|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $temporary -Encoding UTF8;Move-Item -LiteralPath $temporary -Destination $path}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function Assert-WorkerRequest($request,[string]$phase,[int]$sequence,[DateTime]$now){
  if($request.nonce -cne $Nonce -or $request.phase -cne $phase -or $request.sequence -ne $sequence -or $request.workerPid -ne $PID -or
    $request.workerCreatedUtc -cne $script:workerCreatedUtc -or $request.manifestSha256 -cne $manifestSha -or $request.entrySha256 -cne $script:entrySha){throw 'WORKER_REQUEST_BINDING_MISMATCH'}
  $issued=[DateTime]::Parse($request.issuedAt).ToUniversalTime();$expires=[DateTime]::Parse($request.expiresAt).ToUniversalTime()
  if($issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalSeconds -gt 90 -or ($now-$issued).TotalSeconds -gt 90){throw 'WORKER_REQUEST_EXPIRED'}
  $run=[IO.Path]::GetFullPath($request.runDirectory)
  if((Split-Path $run -Parent) -ne $packageRoot -or (Split-Path $run -Leaf) -notmatch '^deployment-\d{8}T\d{9}Z$'){throw 'WORKER_RUN_OUTSIDE_PACKAGE'}
  if($script:boundRun -and $run -cne $script:boundRun){throw 'WORKER_RUN_REBIND_REJECTED'}
  $script:boundRun=$run
  if((Worker-Sha (Join-Path $packageRoot 'FIRST_PAGE_CANDIDATE_MANIFEST.json')) -cne $manifestSha -or (Worker-Sha $entryFile) -cne $script:entrySha){throw 'WORKER_SOURCE_PIN_CHANGED'}
  $manifest=Get-Content -LiteralPath (Join-Path $packageRoot 'FIRST_PAGE_CANDIDATE_MANIFEST.json') -Raw|ConvertFrom-Json
  $journal=Get-Content -LiteralPath (Join-Path $run 'result.json') -Raw|ConvertFrom-Json
  if($journal.manifestSha256 -cne $manifestSha -or $journal.erpOwnerBefore -ne 6968){throw 'WORKER_JOURNAL_BINDING_MISMATCH'}
  if($phase -eq 'candidate' -and ($journal.pendingFile -or $journal.erpNormalReloadObserved)){throw 'WORKER_CANDIDATE_JOURNAL_NOT_READY'}
  if($phase -eq 'restore' -and -not $journal.rollbackFilesVerified){throw 'WORKER_RESTORE_JOURNAL_NOT_READY'}
  foreach($file in @($manifest.files|Where-Object {$_.path.StartsWith('api/')})){
    $target=[IO.Path]::GetFullPath((Join-Path $appsRoot $file.path))
    if(-not $target.StartsWith($apiDirectory+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'WORKER_API_PATH_SCOPE_MISMATCH'}
    if($file.baseSha256 -and (Worker-Sha (Join-Path (Join-Path $run 'before') $file.path)) -cne $file.baseSha256){throw 'WORKER_BEFORE_IMAGE_MISMATCH'}
    if($phase -eq 'candidate'){
      if($journal.installed -notcontains $file.path -or (Worker-Sha $target) -cne $file.candidateSha256){throw 'WORKER_CANDIDATE_SOURCE_MISMATCH'}
    }elseif($file.baseSha256){if((Worker-Sha $target) -cne $file.baseSha256){throw 'WORKER_RESTORED_SOURCE_MISMATCH'}}
    elseif(Test-Path -LiteralPath $target){throw 'WORKER_RESTORED_NEW_FILE_REMAINS'}
  }
  return $run
}
try{
  if($PSVersionTable.PSVersion.Major -ne 5 -or $Nonce -notmatch '^[a-f0-9]{64}$'){throw 'WORKER_PS5_NONCE_REQUIRED'}
  $broker=[IO.Path]::GetFullPath($BrokerDirectory)
  if((Split-Path $broker -Parent) -ne $packageRoot -or (Split-Path $broker -Leaf) -notmatch '^normal-launch-\d{8}T\d{9}Z$' -or -not(Test-Path -LiteralPath $broker -PathType Container)){throw 'WORKER_BROKER_SCOPE_MISMATCH'}
  if((Get-Item -LiteralPath $broker -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'WORKER_BROKER_REPARSE_POINT_REJECTED'}
  $script:brokerValidated=$true
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$principal=[Security.Principal.WindowsPrincipal]::new($identity)
  if($identity.Name -cne 'SEMIH\Xaser' -or $identity.User.Value -cne $expectedSid -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'WORKER_NORMAL_XASER_REQUIRED'}
  if((Worker-Sha (Join-Path $packageRoot 'FIRST_PAGE_CANDIDATE_MANIFEST.json')) -cne $manifestSha){throw 'WORKER_MANIFEST_REQUIRED'}
  $script:workerCreatedUtc=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o')
  $script:entrySha=Worker-Sha $entryFile;$script:boundRun=$null
  $deadline=[DateTime]::UtcNow.AddMinutes(4)
  Worker-Write (Join-Path $broker 'ready.json') ([ordered]@{nonce=$Nonce;workerPid=$PID;workerCreatedUtc=$script:workerCreatedUtc;sid=$expectedSid;account=$identity.Name;elevated=$false;entrySha256=$script:entrySha;manifestSha256=$manifestSha;restoreOnly=[bool]$RestoreOnly;expiresAt=$deadline.ToString('o');createdAt=[DateTime]::UtcNow.ToString('o')})
  $firstSequence=if($RestoreOnly){2}else{1}
  for($sequence=$firstSequence;$sequence -le 2;$sequence++){
    $phase=if($sequence -eq 1){'candidate'}else{'restore'}
    $requestPath=Join-Path $broker ('request-'+$sequence+'.json')
    while(-not(Test-Path -LiteralPath $requestPath)){
      if(Test-Path -LiteralPath (Join-Path $broker 'complete.json')){exit 0}
      if([DateTime]::UtcNow -ge $deadline){throw 'WORKER_WAIT_EXPIRED'}
      Start-Sleep -Milliseconds 200
    }
    $request=Get-Content -LiteralPath $requestPath -Raw|ConvertFrom-Json
    $run=Assert-WorkerRequest $request $phase $sequence ([DateTime]::UtcNow)
    # Durable intent is published before launch; a missing receipt never authorizes a retry.
    Worker-Write (Join-Path $broker ('intent-'+$sequence+'.json')) ([ordered]@{nonce=$Nonce;phase=$phase;sequence=$sequence;runDirectory=$run;manifestSha256=$manifestSha;workerPid=$PID;workerCreatedUtc=$script:workerCreatedUtc;entrySha256=$script:entrySha;issuedAt=$request.issuedAt;expiresAt=$request.expiresAt;launchNotBefore=[DateTime]::UtcNow.ToString('o')})
    # The normal worker never performs CIM, process stop, SCM, auth or SQL operations.
    $listeners=@(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue -ErrorVariable listenerError)
    if($listenerError -and -not(Test-WorkerStoppedPortErrors $listenerError)){throw 'WORKER_PORT_QUERY_FAILED'}
    if($listeners.Count){throw 'WORKER_PORT_NOT_FREE'}
    $null=Assert-WorkerRequest $request $phase $sequence ([DateTime]::UtcNow)
    $launchAt=[DateTime]::UtcNow
    $child=Start-Process -FilePath $nodePath -ArgumentList @('"'+$entryFile+'"') -WorkingDirectory $apiDirectory -WindowStyle Hidden -PassThru
    $child.Refresh();if($child.HasExited){throw 'WORKER_NODE_EXITED'}
    $created=$child.StartTime.ToUniversalTime().ToString('o')
    Worker-Write (Join-Path $broker ('receipt-'+$sequence+'.json')) ([ordered]@{nonce=$Nonce;phase=$phase;sequence=$sequence;runDirectory=$run;manifestSha256=$manifestSha;workerPid=$PID;workerCreatedUtc=$script:workerCreatedUtc;entrySha256=$script:entrySha;nodePid=$child.Id;nodeCreatedUtc=$created;launchedAt=$launchAt.ToString('o');sid=$expectedSid;elevated=$false;otherServiceChanged=$false;credentialsRead=$false})
  }
  while(-not(Test-Path -LiteralPath (Join-Path $broker 'complete.json')) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 200}
}catch{
  if($script:brokerValidated){
    $code=if($_.Exception.Message -match '^[A-Z0-9_]+$'){$_.Exception.Message}else{'NORMAL_WORKER_FAILED'}
    if(-not(Test-Path -LiteralPath (Join-Path $broker 'failure.json'))){Worker-Write (Join-Path $broker 'failure.json') ([ordered]@{code=$code;observedAt=[DateTime]::UtcNow.ToString('o');workerPid=$PID})}
  }
  exit 1
}
