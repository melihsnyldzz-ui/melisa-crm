param(
    [string]$ConfigPath,
    [string]$PackageRoot,
    [string]$PackageManifestSha256,
    [AllowEmptyString()][string]$LanAddress,
    [ValidateRange(20,180)][int]$WaitSeconds=90,
    [switch]$Library
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$switchArguments=@{ConfigFile=$ConfigPath;TargetRoot=$PackageRoot;TargetHash=$PackageManifestSha256;Seconds=$WaitSeconds;LibraryMode=[bool]$Library;LanAddressBound=$PSBoundParameters.ContainsKey('LanAddress');LanAddress=$LanAddress}
. (Join-Path $PSScriptRoot 'test-session-launcher.ps1') -Library

function Get-SwitchTask($Config,$ConfigFile) {
    $task=Get-ScheduledTask -TaskName $Config.TaskName -TaskPath '\' -ErrorAction Stop
    $shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $launcher=Join-Path $Config.RepoRoot 'deploy/test-session-launcher.ps1'
    $arguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+$launcher+'" -ConfigPath "'+$ConfigFile+'"'
    if ((Resolve-TestPrincipalSid $task.Principal.UserId) -ne $Config.OwnerSid -or $task.Actions.Count -ne 1 -or !(Same-Path $task.Actions[0].Execute $shell) -or $task.Actions[0].Arguments -ne $arguments -or !(Same-Path $task.Actions[0].WorkingDirectory $Config.RepoRoot)) {throw 'TEST_SWITCH_TASK_IDENTITY_MISMATCH'}
    return $task
}
function Assert-SwitchLauncher($Process,$Config,$ConfigFile) {
    if (!$Process) {return $null}
    $current=Get-TestProcess $Process.ProcessId
    if (!$current) {return $null}
    if ($current.CreationDate -ne $Process.CreationDate) {throw 'TEST_SWITCH_LAUNCHER_PID_REUSED'}
    $shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $launcher=Join-Path $Config.RepoRoot 'deploy/test-session-launcher.ps1'
    try {$sid=Invoke-CimMethod -InputObject $current -MethodName GetOwnerSid}
    catch {
        # Stopping the scheduled task can remove this exact launcher between CIM calls.
        # Tolerate only a fresh missing PID, never an owner failure on a live/reused PID.
        $after=Get-TestProcess $current.ProcessId
        if (!$after) {return $null}
        if ($after.CreationDate -ne $Process.CreationDate) {throw 'TEST_SWITCH_LAUNCHER_PID_REUSED'}
        throw
    }
    $verified=Get-TestProcess $current.ProcessId
    if (!$verified) {return $null}
    if ($verified.CreationDate -ne $Process.CreationDate) {throw 'TEST_SWITCH_LAUNCHER_PID_REUSED'}
    $scriptPattern='(?:^|\s)"?'+[regex]::Escape($launcher)+'"?(?:\s|$)'
    $configPattern='(?:^|\s)-ConfigPath\s+"?'+[regex]::Escape($ConfigFile)+'"?(?:\s|$)'
    if ($sid.ReturnValue -ne 0 -or $sid.Sid -ne $Config.OwnerSid -or !(Same-Path $verified.ExecutablePath $shell) -or $verified.CommandLine -notmatch $scriptPattern -or $verified.CommandLine -notmatch $configPattern) {throw 'TEST_SWITCH_LAUNCHER_IDENTITY_MISMATCH'}
    return $verified
}
function Get-SwitchLaunchers($Config,$ConfigFile) {
    $launcher=Join-Path $Config.RepoRoot 'deploy/test-session-launcher.ps1'
    $processes=@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {$_.CommandLine -match [regex]::Escape($launcher)})
    $verified=@(foreach ($p in $processes) {$alive=Assert-SwitchLauncher $p $Config $ConfigFile; if ($alive) {$alive}})
    if ($verified.Count -gt 1) {throw 'TEST_SWITCH_DUPLICATE_LAUNCHER'}
    return $verified
}
function Get-SwitchNative($Config) {
    Assert-NativeHealth $Config
    $listeners=@(Get-TestListeners | Where-Object {$_.LocalPort -eq 62404})
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') {throw 'TEST_SWITCH_NATIVE_LISTENER_MISMATCH'}
    $native=Assert-OwnedProcess $listeners[0].OwningProcess $Config (Join-Path $Config.NativeRelease 'apps/api/start-crm-order-test.mjs')
    if (!$native -or $native.CommandLine -notmatch ('(?:^|\s)"?'+[regex]::Escape($Config.NativeConfig)+'"?(?:\s|$)')) {throw 'TEST_SWITCH_NATIVE_CONFIG_MISMATCH'}
    return $native
}
function Assert-SwitchNativeUnchanged($Config,$Snapshot) {
    $current=Get-SwitchNative $Config
    if ($current.ProcessId -ne $Snapshot.ProcessId -or $current.CreationDate -ne $Snapshot.CreationDate) {throw 'TEST_SWITCH_NATIVE_CHANGED'}
}
function Wait-SwitchLauncherExit($Snapshot) {
    # Stop-ScheduledTask is asynchronous. Wait only for this prevalidated process
    # to disappear; a live process is never adopted or stopped by this wait.
    $deadline=(Get-Date).AddSeconds(3)
    while ($true) {
        $current=Get-TestProcess $Snapshot.ProcessId
        if (!$current) {return $true}
        if ($current.CreationDate -ne $Snapshot.CreationDate) {throw 'TEST_SWITCH_LAUNCHER_PID_REUSED'}
        if ((Get-Date) -ge $deadline) {return $false}
        Start-Sleep -Milliseconds 100
    }
}
function Stop-SwitchCrm($Config,$ConfigFile,$History,$Phase) {
    $task=Get-SwitchTask $Config $ConfigFile
    $launchers=@(Get-SwitchLaunchers $Config $ConfigFile)
    $identity=Read-SupervisorIdentity $Config
    $executionRoot=Get-TestExecutionRoot $Config
    $listeners=Get-TestListeners
    if (!$identity -and @($listeners | Where-Object {$_.LocalPort -ne 62404}).Count) {throw 'TEST_SWITCH_PROCESS_RECORD_REQUIRED'}
    # Validate every listener before stopping the watchdog or any process.
    $expected=@{}
    $native=Get-SwitchNative $Config
    $expected[62404]=$native.ProcessId
    if ($identity) {
        foreach ($pair in @(@('test-server.mjs',62400),@('test-server.mjs',62401),@('test-erp-catalog.mjs',62402),@('test-erp-orders.mjs',62403))) {
            if ($identity.Children.ContainsKey($pair[0])) {$expected[[int]$pair[1]]=$identity.Children[$pair[0]].ProcessId}
        }
    }
    Assert-TestListeners $listeners $expected (Get-TestLanAddress $Config)
    Stop-ScheduledTask -InputObject $task
    foreach ($snapshot in $launchers) {
        if (Wait-SwitchLauncherExit $snapshot) {continue}
        $current=Assert-SwitchLauncher $snapshot $Config $ConfigFile
        if ($current) {
            try {Stop-Process -Id $current.ProcessId -ErrorAction Stop}
            catch {
                $after=Get-TestProcess $current.ProcessId
                if ($after) {
                    if ($after.CreationDate -ne $snapshot.CreationDate) {throw 'TEST_SWITCH_LAUNCHER_PID_REUSED'}
                    throw
                }
            }
        }
    }
    if (@(Get-SwitchLaunchers $Config $ConfigFile).Count) {throw 'TEST_SWITCH_WATCHDOG_DID_NOT_STOP'}
    # Stop the supervisor first so it cannot respawn children during a package switch.
    if ($identity -and $identity.Supervisor) {
        Stop-VerifiedTestProcess $identity.Supervisor $Config (Join-Path $executionRoot 'deploy/test-supervisor.mjs')
    }
    if ($identity) {
        foreach ($name in $identity.Children.Keys) {Stop-VerifiedTestProcess $identity.Children[$name] $Config (Join-Path $executionRoot ('deploy/'+$name))}
    }
    if (@(Get-TestListeners | Where-Object {$_.LocalPort -ne 62404}).Count) {throw 'TEST_SWITCH_CRM_PORTS_NOT_FREE'}
    $record=Join-Path $Config.RuntimeDir 'processes.json'
    if (Test-Path -LiteralPath $record) {
        if ((Get-Item -LiteralPath $record).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'TEST_SWITCH_RECORD_REPARSE_POINT'}
        Move-Item -LiteralPath $record -Destination (Join-Path $History ($Phase+'-processes.json'))
    }
    Assert-SwitchNativeUnchanged $Config $native
    return $native
}
function Wait-SwitchReady($Config,$ConfigFile,$Native,$Seconds) {
    $deadline=(Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        Assert-SwitchNativeUnchanged $Config $Native
        $task=Get-SwitchTask $Config $ConfigFile
        $identity=Read-SupervisorIdentity $Config
        if ($identity -and $identity.Supervisor -and $identity.Children.Count -eq 3) {
            $expected=@{62400=$identity.Children['test-server.mjs'].ProcessId;62401=$identity.Children['test-server.mjs'].ProcessId;62402=$identity.Children['test-erp-catalog.mjs'].ProcessId;62403=$identity.Children['test-erp-orders.mjs'].ProcessId;62404=$Native.ProcessId}
            $listeners=Get-TestListeners
            Assert-TestListeners $listeners $expected (Get-TestLanAddress $Config)
            $lan=Get-TestLanAddress $Config
            $uiReady=@($listeners | Where-Object {$_.LocalPort -eq 62400 -and $_.LocalAddress -eq '127.0.0.1'}).Count -eq 1
            $lanReady=!$lan -or @($listeners | Where-Object {$_.LocalPort -eq 62400 -and $_.LocalAddress -ceq $lan}).Count -eq 1
            if ($uiReady -and $lanReady -and @($listeners | Select-Object -ExpandProperty LocalPort -Unique).Count -eq 5 -and $task.State -eq 'Running' -and @(Get-SwitchLaunchers $Config $ConfigFile).Count -eq 1) {return $identity}
        }
        # Task start is asynchronous; Ready can still expose the previous run's result.
        # The bounded deadline, current launcher and current process chain decide readiness.
        Start-Sleep -Seconds 2
    }
    throw 'TEST_SWITCH_READINESS_TIMEOUT'
}
function New-TestPackageCandidate($Previous,$TargetRoot,$TargetHash,[bool]$LanAddressBound=$false,$LanAddress='') {
    $candidate=$Previous | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $candidate | Add-Member -NotePropertyName PackageRoot -NotePropertyValue $TargetRoot -Force
    $candidate | Add-Member -NotePropertyName PackageManifestSha256 -NotePropertyValue $TargetHash -Force
    if ($LanAddressBound) { $candidate | Add-Member -NotePropertyName LanAddress -NotePropertyValue (Resolve-TestLanAddress $LanAddress) -Force }
    return $candidate
}
function Invoke-TestPackageSwitch($ConfigFile,$TargetRoot,$TargetHash,$Seconds,[bool]$LanAddressBound=$false,$LanAddress='') {
    # The previous address may have disappeared after DHCP changed. Identity and
    # format still validate; the candidate must pass current interface validation.
    $previous=Read-TestConfig $ConfigFile -DeferLanInterface
    $candidate=New-TestPackageCandidate $previous $TargetRoot $TargetHash $LanAddressBound $LanAddress
    $task=Get-SwitchTask $previous $ConfigFile
    $native=Get-SwitchNative $previous
    $id=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')+'-'+[Guid]::NewGuid().ToString('N')
    $history=Join-Path $previous.RuntimeDir ('package-switches/'+$id)
    if (!(Outside-Checkout $history $previous.RepoRoot) -or !(Outside-Checkout $history $TargetRoot)) {throw 'TEST_SWITCH_HISTORY_SCOPE_MISMATCH'}
    New-Item -ItemType Directory -Path $history -ErrorAction Stop | Out-Null
    $previousFile=Join-Path $history 'previous-startup-config.json'
    Copy-Item -LiteralPath $ConfigFile -Destination $previousFile -ErrorAction Stop
    $candidateFile=Join-Path $history 'candidate-startup-config.json'
    [IO.File]::WriteAllText($candidateFile,($candidate | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    $next=Read-TestConfig $candidateFile
    $mutationStarted=$false
    $phase='validated'
    try {
        Write-Output 'TEST_PACKAGE_SWITCH_VALIDATED'
        $mutationStarted=$true
        $phase='stopping-previous'
        $null=Stop-SwitchCrm $previous $ConfigFile $history 'previous'
        $phase='committing-config'
        Write-TestIdentityAtomic $ConfigFile $candidate
        $phase='starting-task'
        Start-ScheduledTask -InputObject $task
        $phase='waiting-ready'
        $identity=Wait-SwitchReady $next $ConfigFile $native $Seconds
        $result=@{status='READY';checkedAt=(Get-Date).ToUniversalTime().ToString('o');packageRoot=(Get-TestExecutionRoot $next);manifestSha256=$next.PackageManifestSha256;supervisorPid=$identity.Supervisor.ProcessId;nativePid=$native.ProcessId;previousConfigReference=$previousFile;history=$history}
        Write-TestIdentityAtomic (Join-Path $history 'result.json') $result
        return $result
    } catch {
        $failure='TEST_PACKAGE_SWITCH_FAILED'
        if ($_.Exception.Message -cmatch '^[A-Z][A-Z0-9_]+$') {$failure=$_.Exception.Message}
        Write-TestIdentityAtomic (Join-Path $history 'failure.json') @{code=$failure;phase=$phase;exceptionType=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;at=(Get-Date).ToUniversalTime().ToString('o');recoveryAttempted=$mutationStarted}
        if ($mutationStarted) {
            try {
                # The current config selects the only process chain that recovery may stop.
                # A rejected target payload must not prevent restoration. Only the exact
                # prevalidated config snapshots may identify processes to stop; never execute it.
                $currentJson=Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 8 -Compress
                $candidateJson=$candidate | ConvertTo-Json -Depth 8 -Compress
                $previousJson=Get-Content -LiteralPath $previousFile -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 8 -Compress
                if ($currentJson -eq $candidateJson) {$current=$next}
                elseif ($currentJson -eq $previousJson) {$current=$previous}
                else {throw 'TEST_SWITCH_CONFIG_CHANGED_DURING_RECOVERY'}
                $null=Stop-SwitchCrm $current $ConfigFile $history 'failed-target'
                $restore=Get-Content -LiteralPath $previousFile -Raw | ConvertFrom-Json
                Write-TestIdentityAtomic $ConfigFile $restore
                Start-ScheduledTask -InputObject (Get-SwitchTask $previous $ConfigFile)
                $restored=Wait-SwitchReady $previous $ConfigFile $native $Seconds
                Write-TestIdentityAtomic (Join-Path $history 'recovery.json') @{status='PREVIOUS_RESTORED';supervisorPid=$restored.Supervisor.ProcessId;nativePid=$native.ProcessId}
            } catch {
                Write-TestIdentityAtomic (Join-Path $history 'recovery.json') @{status='RECOVERY_NEEDS_OPERATOR';previousConfigReference=$previousFile}
                throw 'TEST_PACKAGE_SWITCH_RECOVERY_FAILED'
            }
        }
        throw $failure
    }
}
if (!$switchArguments.LibraryMode) {
    if (!$switchArguments.ConfigFile -or !$switchArguments.TargetRoot -or !$switchArguments.TargetHash) {throw 'TEST_PACKAGE_SWITCH_ARGUMENTS_REQUIRED'}
    Invoke-TestPackageSwitch $switchArguments.ConfigFile $switchArguments.TargetRoot $switchArguments.TargetHash $switchArguments.Seconds $switchArguments.LanAddressBound $switchArguments.LanAddress | ConvertTo-Json -Depth 5
}
