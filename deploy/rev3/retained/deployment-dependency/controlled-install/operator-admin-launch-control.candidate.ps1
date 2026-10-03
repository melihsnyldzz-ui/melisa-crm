# Dot-source only from the separately reviewed admin wrapper. Never launches Node.
function Control-Utc($value){
  if($value -is [DateTime]){return $value.ToUniversalTime().ToString('o')}
  if($value -is [DateTimeOffset]){return $value.UtcDateTime.ToString('o')}
  $parsed=[DateTimeOffset]::MinValue
  if($value -isnot [string] -or $value -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?Z$' -or
    -not [DateTimeOffset]::TryParse($value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal,[ref]$parsed)){throw 'CONTROL_EXACT_UTC_REQUIRED'}
  return $parsed.UtcDateTime.ToString('o')
}
function Control-Date($value){return [DateTimeOffset]::Parse((Control-Utc $value),[Globalization.CultureInfo]::InvariantCulture).UtcDateTime}
function Read-NativeProcessCreatedUtc([int]$processId){
  $process=$null
  try{$process=Get-Process -Id $processId -ErrorAction Stop;return $process.StartTime.ToUniversalTime()}
  catch{if((Get-ControlErrorClassification $_) -eq 'denied'){$script:terminalControlDenial=$true};throw 'PROCESS_NATIVE_TIME_QUERY_FAILED_STOP'}
  finally{if($process){$process.Dispose()}}
}
function Assert-NativeProcessTime([int]$processId,$expected,$cim,[string]$code){
  $native=Read-NativeProcessCreatedUtc $processId;$want=Control-Date $expected;$metadata=Control-Date $cim
  if($native.Ticks -ne $want.Ticks -or ($native.Ticks-($native.Ticks%10)) -ne ($metadata.Ticks-($metadata.Ticks%10))){throw $code}
}
function Get-ControlErrorClassification($record){
  $exception=$record.Exception;$transient=$false;$permission=($record.CategoryInfo.Category -eq 'PermissionDenied')
  for($depth=0;$depth -lt 8 -and $exception;$depth++){
    if($exception -is [UnauthorizedAccessException]){$permission=$true}
    if($exception -is [System.ComponentModel.Win32Exception] -and $exception.NativeErrorCode -eq 5){$permission=$true}
    if($exception -is [Microsoft.Management.Infrastructure.CimException] -and [int]$exception.NativeErrorCode -eq 2){$permission=$true}
    if($exception -is [Net.Sockets.SocketException]){
      if($exception.NativeErrorCode -eq 10013 -or $exception.SocketErrorCode -eq [Net.Sockets.SocketError]::AccessDenied){$permission=$true}
      if($exception.SocketErrorCode -in @([Net.Sockets.SocketError]::ConnectionRefused,[Net.Sockets.SocketError]::TimedOut)){$transient=$true}
    }
    if($exception -is [Net.WebException] -and $exception.Status -eq [Net.WebExceptionStatus]::Timeout){$transient=$true}
    $exception=$exception.InnerException
  }
  if($permission){return 'denied'}
  if($transient){return 'startup-transient'}
  return 'terminal'
}
function Get-ControlledHttpStatus([string]$url){
  $approved=@{
    'http://127.0.0.1:4100/api/health'=200;'http://127.0.0.1:4100/api/crm-catalog/products'=401;
    'http://127.0.0.1:4200/health'=200;'http://127.0.0.1:4200/auth/me'=401;
    'http://127.0.0.1:4200/crm/inbox'=401;'http://127.0.0.1:4200/crm/catalog/products'=401;
    'http://127.0.0.1:4200/auth/login'=404
  }
  if(-not $approved.ContainsKey($url)){throw 'CONTROL_HTTP_TARGET_NOT_ALLOWED'}
  try{$response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop;$status=[int]$response.StatusCode}
  catch{
    $classification=Get-ControlErrorClassification $_
    if($classification -eq 'denied'){$script:terminalControlDenial=$true;throw 'CONTROL_NETWORK_ACCESS_DENIED_STOP'}
    if($_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode}
    elseif($classification -eq 'startup-transient'){return 0}
    else{throw 'CONTROL_NETWORK_TERMINAL_ERROR_STOP'}
  }
  if($status -ne $approved[$url]){throw 'CONTROL_HTTP_STATUS_UNEXPECTED_STOP'}
  return $status
}
function Initialize-ProcessContextProbe {
  if('CrmReadOnlyProcessContext' -as [type]){return}
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class CrmReadOnlyProcessContext {
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int id);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,out int result,int size,out int returned);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static string[] Read(int id){
    IntPtr process=OpenProcess(0x1000,false,id);if(process==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr token=IntPtr.Zero;
    try{if(!OpenProcessToken(process,8,out token))throw new Win32Exception(Marshal.GetLastWin32Error());
      int elevated,returned;if(!GetTokenInformation(token,20,out elevated,4,out returned))throw new Win32Exception(Marshal.GetLastWin32Error());
      using(var identity=new WindowsIdentity(token)){return new[]{identity.User.Value,elevated==0?"false":"true"};}
    }finally{if(token!=IntPtr.Zero)CloseHandle(token);CloseHandle(process);}
  }
}
'@
}
function Read-ProcessContext([int]$processId){
  Initialize-ProcessContextProbe
  try{$result=[CrmReadOnlyProcessContext]::Read($processId)}catch{if((Get-ControlErrorClassification $_) -eq 'denied'){$script:terminalControlDenial=$true};throw 'PROCESS_CONTEXT_QUERY_FAILED_STOP'}
  [pscustomobject]@{sid=$result[0];elevated=($result[1] -eq 'true')}
}
function Read-ControlledMetadata([string]$className,[string]$filter,[string[]]$properties){
  try{return Get-CimInstance -ClassName $className -Filter $filter -Property $properties -ErrorAction Stop}
  catch{if((Get-ControlErrorClassification $_) -eq 'denied'){$script:terminalControlDenial=$true;throw 'CONTROL_METADATA_ACCESS_DENIED_STOP'};throw 'CONTROL_METADATA_QUERY_FAILED_STOP'}
}
function Read-ExactRecordedProcess($recorded){
  $process=Read-ControlledMetadata 'Win32_Process' ('ProcessId='+[int]$recorded.pid) @('ProcessId','ParentProcessId','ExecutablePath','CreationDate')
  if(-not $process -or $process.ExecutablePath -cne $nodePath -or $process.ProcessId -ne $recorded.pid -or $process.ParentProcessId -ne $recorded.parentPid -or
    $process.CreationDate.ToUniversalTime() -ne $recorded.createdUtc.ToUniversalTime()){throw 'ROLLBACK_NONLISTENING_PROCESS_CHANGED'}
  return [pscustomobject]@{pid=[int]$process.ProcessId;parentPid=[int]$process.ParentProcessId;createdUtc=$process.CreationDate.ToUniversalTime();binds=@($recorded.binds);nonListening=$true}
}
function Control-Write([string]$path,$value){
  if(Test-Path -LiteralPath $path){throw 'CONTROL_HANDSHAKE_ALREADY_EXISTS'}
  $temporary=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  try{$value|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $temporary -Encoding UTF8;Move-Item -LiteralPath $temporary -Destination $path}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function Assert-NormalWorkerReady {
  if($BrokerDirectory -notmatch '\\normal-launch-\d{8}T\d{9}Z$' -or (Split-Path $BrokerDirectory -Parent) -ne $packageRoot){throw 'CONTROL_BROKER_OUTSIDE_PACKAGE'}
  if((Get-Item -LiteralPath $BrokerDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CONTROL_BROKER_REPARSE_POINT_REJECTED'}
  $ready=Get-Content -LiteralPath (Join-Path $BrokerDirectory 'ready.json') -Raw|ConvertFrom-Json
  if($ready.nonce -cne $Nonce -or $ready.workerPid -ne $ExpectedNormalParentPid -or $ready.sid -cne $expectedSid -or $ready.elevated -ne $false -or
    $ready.account -cne 'SEMIH\Xaser' -or $ready.restoreOnly -ne [bool]$RollbackRun -or $ready.manifestSha256 -cne $manifestSha -or $ready.entrySha256 -cne (Sha (Join-Path $appsRoot 'api\src\server.js'))){throw 'CONTROL_WORKER_READY_BINDING_MISMATCH'}
  $expires=Control-Date $ready.expiresAt;$created=Control-Date $ready.createdAt
  if($expires -le [DateTime]::UtcNow -or ($expires-$created).TotalSeconds -gt 241 -or $created -gt [DateTime]::UtcNow){throw 'CONTROL_WORKER_READY_EXPIRED'}
  $process=Read-ControlledMetadata 'Win32_Process' ('ProcessId='+$ExpectedNormalParentPid) @('ProcessId','ParentProcessId','ExecutablePath','CreationDate')
  if(-not $process -or $process.ExecutablePath -cne 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -or
    $process.ProcessId -ne $ExpectedNormalParentPid){throw 'CONTROL_WORKER_PROCESS_MISMATCH'}
  Assert-NativeProcessTime $ExpectedNormalParentPid $ready.workerCreatedUtc $process.CreationDate 'CONTROL_WORKER_PROCESS_MISMATCH'
  $context=Read-ProcessContext $ExpectedNormalParentPid
  if($context.sid -cne $expectedSid -or $context.elevated){throw 'CONTROL_WORKER_MUST_BE_NORMAL_XASER'}
  $script:normalWorkerReady=$ready
  return $ready
}
function Assert-ControlledLaunchReceipt($receipt,$request,$owner,$context){
  foreach($name in @('nonce','phase','sequence','runDirectory','manifestSha256','workerPid','entrySha256')){if($receipt.$name -cne $request.$name){throw 'CONTROL_RECEIPT_BINDING_MISMATCH'}}
  if((Control-Utc $receipt.workerCreatedUtc) -cne (Control-Utc $request.workerCreatedUtc)){throw 'CONTROL_RECEIPT_BINDING_MISMATCH'}
  if($receipt.nodePid -ne $owner.pid -or $owner.parentPid -ne $request.workerPid -or
    (Control-Date $receipt.nodeCreatedUtc) -lt (Control-Date $request.issuedAt) -or
    (Control-Date $receipt.nodeCreatedUtc) -gt (Control-Date $request.expiresAt) -or
    $context.sid -cne $expectedSid -or $context.elevated -or $receipt.elevated -ne $false -or $receipt.sid -cne $expectedSid){throw 'CONTROL_NODE_IDENTITY_MISMATCH'}
  Assert-NativeProcessTime $owner.pid $receipt.nodeCreatedUtc $owner.createdUtc 'CONTROL_NODE_IDENTITY_MISMATCH'
}
function Invoke-AdminControlledNormalLaunch($before,[DateTime]$afterUtc){
  $ready=Assert-NormalWorkerReady
  $mode=if($script:operatorRestoreOnly){'restore'}else{'candidate'}
  $sequence=if($script:operatorRestoreOnly){2}else{1}
  $receiptPath=Join-Path $BrokerDirectory ('receipt-'+$sequence+'.json');$requestPath=Join-Path $BrokerDirectory ('request-'+$sequence+'.json')
  if((Test-Path -LiteralPath $receiptPath) -or (Test-Path -LiteralPath $requestPath) -or (Test-Path -LiteralPath (Join-Path $BrokerDirectory 'failure.json'))){throw 'CONTROL_SINGLE_USE_HANDSHAKE_REQUIRED'}
  foreach($file in @($manifest.files|Where-Object {$_.path.StartsWith('api/')})){
    if($mode -eq 'candidate'){if((Sha (Target $file)) -cne $file.candidateSha256){throw 'CONTROL_API_INSTALL_REQUIRED'}}
    elseif($file.baseSha256){if((Sha (Target $file)) -cne $file.baseSha256){throw 'CONTROL_API_RESTORED_REQUIRED'}}
    elseif(Test-Path -LiteralPath (Target $file)){throw 'CONTROL_RESTORED_NEW_FILE_REMAINS'}
    if($file.baseSha256 -and (Sha (Backup $runPath $file)) -cne $file.baseSha256){throw 'CONTROL_API_BACKUP_REQUIRED'}
  }
  $fresh=Owner 4100 -AllowStopped
  if($mode -eq 'restore' -and $before.PSObject.Properties['nonListening'] -and $before.nonListening){
    if($fresh){throw 'ROLLBACK_NEW_LISTENER_CONFLICT'}
    $fresh=Read-ExactRecordedProcess $before
  }
  # Journal the exact action scope before stop, including a possible stop-without-receipt state.
  $now=[DateTime]::UtcNow
  $request=[ordered]@{nonce=$Nonce;phase=$mode;sequence=$sequence;runDirectory=$runPath;manifestSha256=$manifestSha;workerPid=$ExpectedNormalParentPid;workerCreatedUtc=$ready.workerCreatedUtc;entrySha256=$ready.entrySha256;issuedAt=$now.ToString('o');expiresAt=$now.AddSeconds(45).ToString('o')}
  $script:lastNormalLaunchRequest=[pscustomobject]$request
  $controlRecord=[ordered]@{request=$request;workerReady=$ready;oldOwner=$before;stopAttempted=$false;stopVerified=$false;requestPublished=$false;receiptVerified=$false}
  if($mode -eq 'candidate'){$journal.launchControl=$controlRecord}else{$journal.rollbackLaunchControl=$controlRecord;$journal.rollbackHistory+=@([ordered]@{brokerDirectory=$BrokerDirectory;control=$controlRecord})}
  Write-Journal $runPath $journal
  if($before.pid -gt 0){
    if(-not $fresh){throw 'CONTROL_ERP_DISAPPEARED_BEFORE_STOP'}
    Assert-SameOwner $before $fresh
    $context=Read-ProcessContext $fresh.pid
    if($context.sid -cne $expectedSid -or $context.elevated){throw 'CONTROL_OLD_ERP_NORMAL_IDENTITY_REQUIRED'}
    if($mode -eq 'candidate'){
      if($fresh.pid -ne 6968 -or $fresh.parentPid -ne 31604 -or $fresh.createdUtc.ToUniversalTime().ToString('o') -cne '2026-10-01T09:35:26.9240070Z'){throw 'CONTROL_EXACT_OLD_ERP_REQUIRED'}
    }elseif($fresh.pid -eq 6968){
      if($fresh.parentPid -ne 31604 -or $fresh.createdUtc.ToUniversalTime().ToString('o') -cne '2026-10-01T09:35:26.9240070Z'){throw 'CONTROL_ROLLBACK_OLD_PID_REUSE_REJECTED'}
    }else{
      if(-not $script:lastNormalLaunchReceipt -or $fresh.pid -ne $script:lastNormalLaunchReceipt.nodePid -or $fresh.parentPid -ne $script:lastNormalLaunchReceipt.workerPid){throw 'CONTROL_ROLLBACK_OWNED_NODE_REQUIRED'}
      Assert-NativeProcessTime $fresh.pid $script:lastNormalLaunchReceipt.nodeCreatedUtc $fresh.createdUtc 'CONTROL_ROLLBACK_OWNED_NODE_REQUIRED'
    }
    # Fresh exact metadata and normal context verified immediately before this single approved stop.
    $verified=if($fresh.PSObject.Properties['nonListening'] -and $fresh.nonListening){Read-ExactRecordedProcess $fresh}else{Owner 4100}
    Assert-SameOwner $fresh $verified
    $controlRecord.stopAttempted=$true;Write-Journal $runPath $journal
    Stop-Process -Id $verified.pid -ErrorAction Stop
    $process=Get-Process -Id $verified.pid -ErrorAction SilentlyContinue
    if($process){if(-not $process.WaitForExit(5000)){throw 'CONTROL_APPROVED_STOP_TIMEOUT'}}
  }elseif($mode -ne 'restore' -or $fresh){throw 'CONTROL_STOPPED_STATE_ONLY_RESTORE'}
  if(Owner 4100 -AllowStopped){throw 'CONTROL_4100_MUST_BE_STOPPED'}
  $controlRecord.stopVerified=$true;Write-Journal $runPath $journal
  if([DateTime]::UtcNow -ge (Control-Date $request.expiresAt)){throw 'CONTROL_LAUNCH_REQUEST_EXPIRED_STOP'}
  $controlRecord.requestPublished=$true;Write-Journal $runPath $journal
  Control-Write $requestPath $request
  $deadline=$now.AddSeconds(45)
  while(-not(Test-Path -LiteralPath $receiptPath)){
    if(Test-Path -LiteralPath (Join-Path $BrokerDirectory 'failure.json')){throw 'NORMAL_WORKER_REPORTED_FAILURE_STOP'}
    if([DateTime]::UtcNow -ge $deadline){throw 'NORMAL_WORKER_RECEIPT_TIMEOUT_STOP'}
    Start-Sleep -Milliseconds 200
  }
  $receipt=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
  # Keep the bounded receipt for exact own-process recovery even if health is not yet ready.
  $script:lastNormalLaunchReceipt=$receipt
  for($i=0;$i -lt 30;$i++){if((Status 'http://127.0.0.1:4100/api/health') -eq 200){break};Start-Sleep -Milliseconds 300}
  $after=Owner 4100;$context=Read-ProcessContext $after.pid
  Assert-ControlledLaunchReceipt $receipt ([pscustomobject]$request) $after $context
  Assert-Binds $before $after
  if($after.createdUtc -le $afterUtc -or (Status 'http://127.0.0.1:4100/api/health') -ne 200 -or (Status 'http://127.0.0.1:4100/api/crm-catalog/products') -ne 401){throw 'CONTROL_NORMAL_ERP_SMOKE_FAILED'}
  $receipt|Add-Member -NotePropertyName verifiedContext -NotePropertyValue $context -Force
  $receipt|Add-Member -NotePropertyName binds -NotePropertyValue @($after.binds) -Force
  $controlRecord.receiptVerified=$true;Write-Journal $runPath $journal
  return $after
}
function Get-RecordedActiveLaunch($recorded){
  $published=@($recorded.rollbackHistory|Where-Object {$_.control.requestPublished})
  if($published.Count){return [pscustomobject]@{control=$published[-1].control;brokerDirectory=$published[-1].brokerDirectory}}
  return [pscustomobject]@{control=$recorded.launchControl;brokerDirectory=$recorded.normalBrokerDirectory}
}
function Resolve-RecordedRollbackOwner($recorded,$current){
  if($null -eq $current){
    $children=@(Read-ControlledMetadata 'Win32_Process' ('ParentProcessId='+[int]$script:recordedPreviousWorkerReady.workerPid) @('ProcessId','ParentProcessId','ExecutablePath','CreationDate'))
    if($children.Count -gt 1){throw 'ROLLBACK_PREVIOUS_CHILD_AMBIGUOUS'}
    if($children.Count -eq 0){return [pscustomobject]@{pid=0;binds=@($recorded.erpBindsBefore)}}
    if($children[0].ExecutablePath -cne $nodePath){throw 'ROLLBACK_PREVIOUS_CHILD_BINARY_MISMATCH'}
    $current=[pscustomobject]@{pid=[int]$children[0].ProcessId;parentPid=[int]$children[0].ParentProcessId;createdUtc=$children[0].CreationDate.ToUniversalTime();binds=@($recorded.erpBindsBefore);nonListening=$true}
  }
  if($current.pid -eq $recorded.erpOwnerBefore){
    if($current.pid -ne 6968 -or $current.parentPid -ne 31604 -or $current.createdUtc.ToUniversalTime().ToString('o') -cne '2026-10-01T09:35:26.9240070Z'){throw 'ROLLBACK_ORIGINAL_PID_REUSE_REJECTED'}
    return $current
  }
  $active=Get-RecordedActiveLaunch $recorded;$request=$active.control.request
  if(-not $active.control.stopVerified -or -not $active.control.requestPublished -or -not(($request.phase -ceq 'candidate' -and $request.sequence -eq 1) -or ($request.phase -ceq 'restore' -and $request.sequence -eq 2)) -or
    $request.manifestSha256 -cne $manifestSha -or $request.runDirectory -cne $runPath -or $request.workerPid -ne $current.parentPid -or
    $request.workerPid -ne $script:recordedPreviousWorkerReady.workerPid -or (Control-Utc $request.workerCreatedUtc) -cne (Control-Utc $script:recordedPreviousWorkerReady.workerCreatedUtc) -or
    $request.nonce -cne $script:recordedPreviousWorkerReady.nonce -or $request.entrySha256 -cne $script:recordedPreviousWorkerReady.entrySha256 -or
    $current.createdUtc.ToUniversalTime() -lt (Control-Date $request.issuedAt) -or
    $current.createdUtc.ToUniversalTime() -gt (Control-Date $request.expiresAt)){throw 'ROLLBACK_CURRENT_OWNER_OUTSIDE_RECORDED_LAUNCH'}
  $intentPath=Join-Path $active.brokerDirectory ('intent-'+$request.sequence+'.json')
  $intent=Get-Content -LiteralPath $intentPath -Raw|ConvertFrom-Json
  foreach($field in @('nonce','phase','sequence','runDirectory','manifestSha256','workerPid','entrySha256')){if($intent.$field -cne $request.$field){throw 'ROLLBACK_INTENT_BINDING_MISMATCH'}}
  foreach($field in @('workerCreatedUtc','issuedAt','expiresAt')){if((Control-Utc $intent.$field) -cne (Control-Utc $request.$field)){throw 'ROLLBACK_INTENT_BINDING_MISMATCH'}}
  $nativeCurrent=Read-NativeProcessCreatedUtc $current.pid
  Assert-NativeProcessTime $current.pid $nativeCurrent $current.createdUtc 'ROLLBACK_NATIVE_PROCESS_CHANGED_STOP'
  $context=Read-ProcessContext $current.pid
  if($context.sid -cne $expectedSid -or $context.elevated){throw 'ROLLBACK_RECORDED_CHILD_MUST_BE_NORMAL_XASER'}
  $script:lastNormalLaunchReceipt=[pscustomobject]@{nodePid=$current.pid;nodeCreatedUtc=$nativeCurrent.ToString('o');workerPid=$current.parentPid;recoveryOnly=$true}
  return $current
}
function Assert-PreviousWorkerExited($recorded){
  # A fresh restore-only broker is required. Never race a late launch in the previous worker.
  $active=Get-RecordedActiveLaunch $recorded
  $brokers=@($recorded.normalBrokerDirectory)+@($recorded.rollbackHistory|ForEach-Object {$_.brokerDirectory})
  if($brokers.Count -gt 8){throw 'ROLLBACK_HISTORY_LIMIT_REQUIRES_REVIEW'}
  foreach($brokerPath in @($brokers|Sort-Object -Unique)){
    $oldBroker=[IO.Path]::GetFullPath($brokerPath)
    if((Split-Path $oldBroker -Parent) -ne $packageRoot -or (Split-Path $oldBroker -Leaf) -notmatch '^normal-launch-\d{8}T\d{9}Z$' -or $oldBroker -ceq $BrokerDirectory){throw 'ROLLBACK_FRESH_BROKER_REQUIRED'}
    if((Get-Item -LiteralPath $oldBroker -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'ROLLBACK_OLD_BROKER_REPARSE_REJECTED'}
    $oldReady=Get-Content -LiteralPath (Join-Path $oldBroker 'ready.json') -Raw|ConvertFrom-Json
    $expectedRestore=($oldBroker -cne $recorded.normalBrokerDirectory)
    if($oldReady.manifestSha256 -cne $manifestSha -or $oldReady.sid -cne $expectedSid -or $oldReady.elevated -ne $false -or $oldReady.restoreOnly -ne $expectedRestore){throw 'ROLLBACK_PREVIOUS_READY_REQUIRED'}
    $oldWorker=Read-ControlledMetadata 'Win32_Process' ('ProcessId='+[int]$oldReady.workerPid) @('ProcessId','CreationDate')
    if($oldWorker){
      Assert-NativeProcessTime $oldReady.workerPid $oldReady.workerCreatedUtc $oldWorker.CreationDate 'ROLLBACK_PREVIOUS_WORKER_CREATION_CHANGED_STOP'
      throw 'ROLLBACK_PREVIOUS_WORKER_STILL_RUNNING_STOP'
    }
    if($oldBroker -ceq $active.brokerDirectory){$script:recordedPreviousWorkerReady=$oldReady}
  }
}
