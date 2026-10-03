# Fixed DEV subprocess; this function cannot start a production app or service.
function Invoke-CrmFullOfflinePreflight([string]$Root,[string]$NodePath){
 $ErrorActionPreference='Stop'
 if($PSVersionTable.PSVersion.Major -ne 5 -or $NodePath -cne 'C:\Program Files\nodejs\node.exe'){throw 'EXACT_PS5_NODE_REQUIRED'}
 $rootFull=[IO.Path]::GetFullPath($Root)
 $pins=Get-Content -LiteralPath (Join-Path $rootFull 'OFFLINE_PREFLIGHT_PINS.json') -Raw|ConvertFrom-Json
 foreach($pin in $pins.files){
  if($pin.path -match '(^|[\\/])\.\.?([\\/]|$)|(^|[\\/])\.env(?:\.|$)|:|^[/\\]'){throw 'FIXED_DEV_PIN_PATH_REQUIRED'}
  $file=[IO.Path]::GetFullPath((Join-Path $rootFull $pin.path))
  if(-not $file.StartsWith($rootFull+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'DEV_PIN_OUTSIDE_PACKAGE'}
  if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'OFFLINE_PREFLIGHT_PIN_DRIFT'}
 }
 $evidence=Join-Path $rootFull ('wrapper-preflight-evidence\'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
 New-Item -ItemType Directory -Path $evidence|Out-Null
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$NodePath
 $info.Arguments='"'+(Join-Path $rootFull 'run-full-dev-preflight.mjs')+'"'
 $info.WorkingDirectory=$rootFull;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($item in @{
  SystemRoot='C:\Windows';WINDIR='C:\Windows';
  PATH='C:\Program Files\nodejs;C:\Windows\System32;C:\Windows';
  TEMP='C:\Users\Xaser\AppData\Local\Temp';TMP='C:\Users\Xaser\AppData\Local\Temp';
  NODE_ENV='test';NO_COLOR='1'
 }.GetEnumerator()){$info.EnvironmentVariables[$item.Key]=$item.Value}
 $child=New-Object Diagnostics.Process;$child.StartInfo=$info
 $null=$child.Start()
 $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
 if(-not $child.WaitForExit(240000)){
  # Stop only our directly spawned DEV runner, once. No process-tree kill.
  $stopAccepted=$false;$closed=$false
  try{$child.Kill();$stopAccepted=$true;$closed=$child.WaitForExit(2000)}catch{}
  $proof=[ordered]@{status='FAIL';code='OFFLINE_PREFLIGHT_TIMEOUT_NO_APPLY';
   stopRequested=$true;stopAccepted=$stopAccepted;ownedChildTerminated=$closed;
   childTreeQuiescence='NOT_VERIFIED_NO_RETRY';beforeLiveActions=$true;productionRuntimeActions=0}
  $proof|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $evidence 'WRAPPER_TIMEOUT.json') -Encoding UTF8
  $failure=New-Object Exception 'OFFLINE_PREFLIGHT_TIMEOUT_NO_APPLY'
  $failure.Data['OfflinePreflight']=$proof;$child.Dispose();throw $failure
 }
 $exitCode=$child.ExitCode;$out=$stdout.Result;$err=$stderr.Result;$child.Dispose()
 $outFile=Join-Path $evidence 'stdout.txt';$errFile=Join-Path $evidence 'stderr.txt'
 [IO.File]::WriteAllText($outFile,$out,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText($errFile,$err,[Text.UTF8Encoding]::new($false))
 try{$last=@($out -split '\r?\n'|Where-Object {$_.Trim().Length})[-1];$report=$last|ConvertFrom-Json}catch{throw 'OFFLINE_PREFLIGHT_MISSING_RECEIPT_NO_APPLY'}
 $proof=[ordered]@{status=$report.status;exitCode=$exitCode;failedStage=$null;
  receiptRoot=$report.receiptRoot;wrapperEvidenceRoot=$evidence;
  stdoutSha256=(Get-FileHash -LiteralPath $outFile).Hash.ToLowerInvariant();
  stderrSha256=(Get-FileHash -LiteralPath $errFile).Hash.ToLowerInvariant();
  beforeLiveActions=$true;productionRuntimeActions=0;authPost=$false;sqlExecuted=$false;providerCalls=0}
 if($report.PSObject.Properties['failedStage']){$proof.failedStage=$report.failedStage}
 $receipt=[IO.Path]::GetFullPath([string]$report.receiptRoot)
 $allowed=Join-Path $rootFull 'full-preflight-evidence\'
 if(-not $receipt.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'OFFLINE_PREFLIGHT_RECEIPT_OUTSIDE_PACKAGE'}
 $resultPath=Join-Path $receipt 'PREFLIGHT_RESULT.json'
 $proof.resultSha256=(Get-FileHash -LiteralPath $resultPath).Hash.ToLowerInvariant()
 $proof|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $evidence 'WRAPPER_RESULT.json') -Encoding UTF8
 if($exitCode -ne 0 -or $report.status -cne 'PASS'){
  $failure=New-Object Exception 'FULL_OFFLINE_PREFLIGHT_FAILED_NO_APPLY'
  $failure.Data['OfflinePreflight']=$proof
  throw $failure
 }
 return $proof
}
