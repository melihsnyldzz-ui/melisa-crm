param([Parameter(Mandatory=$true)][ValidateSet('Identity','Probe','Stopped','Stop')][string]$Action,[switch]$ApprovedOwned4212Runtime,[string]$ExpectedOwnerJson,[string]$ApprovalExpiresAt)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
if(-not $ApprovedOwned4212Runtime){throw 'EXPLICIT_OWNED_RUNTIME_APPROVAL_REQUIRED'}
$expectedSid='S-1-5-21-2170750028-1005938530-2568122015-1001'
function Identity {
 $i=[Security.Principal.WindowsIdentity]::GetCurrent();$p=[Security.Principal.WindowsPrincipal]::new($i)
 $o=[ordered]@{sid=$i.User.Value;elevated=$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);pid=$PID}
 if($o.sid -cne $expectedSid -or $o.elevated){throw 'NORMAL_XASER_REQUIRED'}
 return $o
}
function ProcessContext([int]$id){
 if(-not('CrmOwnedLocalContext' -as [type])){
 Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Runtime.InteropServices;using System.Security.Principal;
public static class CrmOwnedLocalContext {
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint a,bool b,int p);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr p,uint a,out IntPtr t);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr t,int k,out int r,int s,out int n);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 public static string[] Read(int id){IntPtr p=OpenProcess(0x1000,false,id),t=IntPtr.Zero;if(p==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
 try{if(!OpenProcessToken(p,8,out t))throw new Win32Exception(Marshal.GetLastWin32Error());int r,n;if(!GetTokenInformation(t,20,out r,4,out n))throw new Win32Exception(Marshal.GetLastWin32Error());using(var i=new WindowsIdentity(t)){return new[]{i.User.Value,r==0?"false":"true"};}}
 finally{if(t!=IntPtr.Zero)CloseHandle(t);CloseHandle(p);}}
}
'@
 }
 $x=[CrmOwnedLocalContext]::Read($id);return @{sid=$x[0];elevated=($x[1] -eq 'true')}
}
function Probe {
 try{$listeners=@(Get-NetTCPConnection -LocalPort 4212 -State Listen -ErrorAction Stop)}catch{
  if($_.CategoryInfo.Category -eq 'ObjectNotFound' -and $_.FullyQualifiedErrorId -match '^CmdletizationQuery_NotFound(?:,|$)' -and $_.InvocationInfo.MyCommand.Name -ceq 'Get-NetTCPConnection'){return $null}
  throw
 }
 if(-not $listeners.Count){return $null}
 $ids=@($listeners|ForEach-Object {$_.OwningProcess}|Sort-Object -Unique)
 $binds=@($listeners|ForEach-Object {$_.LocalAddress}|Sort-Object -Unique)
 if($ids.Count -ne 1 -or $binds.Count -ne 1 -or $binds[0] -cne '127.0.0.1'){throw 'EXACT_LOOPBACK_OWNER_REQUIRED'}
 $proc=@(Get-CimInstance Win32_Process -Filter ('ProcessId='+$ids[0]) -Property ProcessId,ParentProcessId,ExecutablePath,CreationDate -ErrorAction Stop)
 if($proc.Count -ne 1 -or $proc[0].ExecutablePath -ine 'C:\Program Files\nodejs\node.exe'){throw 'EXACT_NODE_OWNER_REQUIRED'}
 $context=ProcessContext $ids[0]
 if($context.sid -cne $expectedSid -or $context.elevated){throw 'NORMAL_OWNER_REQUIRED'}
 return [ordered]@{pid=[int]$proc[0].ProcessId;parentPid=[int]$proc[0].ParentProcessId;createdUtc=([DateTime]$proc[0].CreationDate).ToUniversalTime().ToString('o');executablePath='C:\Program Files\nodejs\node.exe';sid=$context.sid;elevated=$false;binds=@('127.0.0.1')}
}
function Same($a,$b){
 if($null -eq $a -or $null -eq $b){return $false}
 foreach($k in @('pid','parentPid','createdUtc','executablePath','sid','elevated')){if($a.$k -cne $b.$k){return $false}}
 return (($a.binds -join ',') -ceq ($b.binds -join ','))
}
try{
 $identity=Identity
 if($Action -eq 'Identity'){$result=$identity}
 elseif($Action -eq 'Probe'){$result=Probe}
 else{
  $expected=ConvertFrom-Json $ExpectedOwnerJson
  if($expected.pid -le 0 -or $expected.sid -cne $expectedSid -or $expected.elevated -or ($expected.binds -join ',') -cne '127.0.0.1'){throw 'EXACT_EXPECTED_OWNER_REQUIRED'}
  if($Action -eq 'Stop'){
   if(-not(Same $expected (Probe))){throw 'OWNER_CHANGED_BEFORE_STOP'}
   # Hold this exact process handle, then verify creation, instead of terminating a possibly reused PID.
   $p=[Diagnostics.Process]::GetProcessById([int]$expected.pid);$null=$p.Handle
   if($p.StartTime.ToUniversalTime().ToString('o') -cne $expected.createdUtc){throw 'PID_CREATION_CHANGED'}
   $expires=[DateTimeOffset]::MinValue
   if(-not [DateTimeOffset]::TryParse($ApprovalExpiresAt,[ref]$expires) -or [DateTimeOffset]::UtcNow -ge $expires){throw 'FINAL_STOP_APPROVAL_EXPIRED'}
   $p.Kill();if(-not $p.WaitForExit(5000)){throw 'STOP_TIMEOUT'}
  }
  $alive=@(Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$expected.pid) -Property ProcessId,CreationDate -ErrorAction Stop)
  $sameAlive=($alive.Count -gt 0 -and ([DateTime]$alive[0].CreationDate).ToUniversalTime().ToString('o') -ceq $expected.createdUtc)
  $result=(-not $sameAlive -and $null -eq (Probe))
 }
 @{success=$true;result=$result;observedAt=[DateTime]::UtcNow.ToString('o');commandLineRead=$false;environmentRead=$false}|ConvertTo-Json -Depth 8 -Compress
}catch{
 $denied=($_.CategoryInfo.Category -eq 'PermissionDenied');$e=$_.Exception
 for($n=0;$n -lt 8 -and $e;$n++){
  if($e -is [UnauthorizedAccessException] -or ($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -eq 5) -or ($e -is [Microsoft.Management.Infrastructure.CimException] -and [int]$e.NativeErrorCode -eq 2)){$denied=$true};$e=$e.InnerException
 }
 @{success=$false;permissionDenied=$denied;code=$(if($denied){'HOST_PERMISSION_DENIED_STOP'}else{'HOST_METADATA_OR_CONTROL_FAILED_STOP'});observedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
 exit 1
}
