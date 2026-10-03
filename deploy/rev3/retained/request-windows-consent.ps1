param([Parameter(Mandatory=$true)][string]$RunRoot,[Parameter(Mandatory=$true)][string]$Nonce)
$ErrorActionPreference='Stop';Set-StrictMode -Version 2
. (Join-Path $PSScriptRoot 'installer-common.ps1')
$run=$null
try {
 $self=Crm-Identity $false;$null=Crm-ValidateCandidate;$run=Crm-RunRoot $RunRoot
 $session=Crm-Json (Join-Path $run 'session.json')
 Crm-AssertSession $session $Nonce ([DateTime]::UtcNow) $self.sessionId
 if(Test-Path -LiteralPath (Join-Path $run 'abort.json')){throw 'EXACT_ACTIVE_CONSENT_REQUEST_REQUIRED'}
 # Only Windows ShellExecute RunAs. No credential, alternate user, desktop switch or UI input.
 $bridge=Join-Path $PSScriptRoot 'admin-backend-bridge.ps1'
 $args=@('-NoProfile','-NonInteractive','-File',('"'+$bridge+'"'),'-RunRoot',('"'+$run+'"'),'-Nonce',$Nonce)
 $child=Start-Process -FilePath $script:CrmPs5 -Verb RunAs -WindowStyle Hidden -ArgumentList $args -PassThru
 Crm-WriteNew (Join-Path $run 'consent-launch-result.json') ([ordered]@{status='ADMIN_PROCESS_LAUNCH_RETURNED';nonce=$Nonce;pid=$child.Id;observedAt=[DateTime]::UtcNow.ToString('o');userRefusalProven=$false})
 exit 0
}catch{
 if($run){$facts=Crm-Error $_;Crm-WriteNew (Join-Path $run 'consent-launch-result.json') ([ordered]@{status='WINDOWS_ELEVATION_NOT_COMPLETED';nonce=$Nonce;observedAt=[DateTime]::UtcNow.ToString('o');error=$facts;userRefusalProven=$false})}
 exit 1
}
