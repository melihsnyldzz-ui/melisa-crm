param([Parameter(Mandatory=$true)][ValidateSet('Install','Remove','Inspect')][string]$Action, [Parameter(Mandatory=$true)][string]$ConfigPath)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'test-session-launcher.ps1') -ConfigPath $ConfigPath -Library
$config=Read-TestConfig $ConfigPath
$launcher=Join-Path $config.RepoRoot 'deploy/test-session-launcher.ps1'
$powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "' + $launcher + '" -ConfigPath "' + $ConfigPath + '"'
$existing=Get-ScheduledTask -TaskName $config.TaskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($existing) {
    if ((Resolve-TestPrincipalSid $existing.Principal.UserId) -ne $config.OwnerSid -or $existing.Actions.Count -ne 1 -or !(Same-Path $existing.Actions[0].Execute $powershell) -or $existing.Actions[0].Arguments -ne $arguments) { throw 'TEST_TASK_IDENTITY_MISMATCH' }
}
if ($Action -eq 'Inspect') { if ($existing) { $existing | Select-Object TaskName,State }; exit 0 }
if ($Action -eq 'Remove') { if ($existing) { Unregister-ScheduledTask -TaskName $config.TaskName -TaskPath '\' -Confirm:$false }; exit 0 }
$taskAction=New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $config.RepoRoot
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $config.OwnerSid
$principal=New-ScheduledTaskPrincipal -UserId $config.OwnerSid -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([timespan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $config.TaskName -TaskPath '\' -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Owned local CRM TEST session; starts at user logon.' -Force | Select-Object TaskName,State
