param([string]$ConfigPath, [switch]$Library)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Same-Path($A, $B) {
    if (!$A -or !$B) { return $false }
    return [IO.Path]::GetFullPath($A).TrimEnd('\','/').Equals([IO.Path]::GetFullPath($B).TrimEnd('\','/'), [StringComparison]::OrdinalIgnoreCase)
}
function Get-TestMutexName($Root, $OwnerSid) {
    $canonical = [IO.Path]::GetFullPath($Root.Replace('/','\')).TrimEnd('\').ToLowerInvariant()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $rootHash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-','').Substring(0,16) }
    finally { $sha.Dispose() }
    return 'Global\MelisaCRMTEST-' + $OwnerSid + '-' + $rootHash
}
function Resolve-TestPrincipalSid($UserId) {
    try {
        if ($UserId -match '^S-1-') { return (New-Object Security.Principal.SecurityIdentifier($UserId)).Value }
        return (New-Object Security.Principal.NTAccount($UserId)).Translate([Security.Principal.SecurityIdentifier]).Value
    } catch { throw 'TEST_TASK_PRINCIPAL_INVALID' }
}
function Outside-Checkout($Path, $Root) {
    $p = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    $r = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    return !(Same-Path $p $r) -and !$p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Read-TestConfig($File) {
    if (![IO.Path]::IsPathRooted($File)) { throw 'CONFIG_ABSOLUTE_PATH_REQUIRED' }
    $c = Get-Content -LiteralPath $File -Raw | ConvertFrom-Json
    $keys = @('RepoRoot','NodePath','BaselineEnv','ErpApiRoot','ErpBaselineEnv','PhotoRoot','RuntimeDir','LogDir','NativeRelease','NativeConfig')
    $allowed = $keys + @('OwnerSid','NodeSha256','NativeSourceCommit','NativePackageId','ExpectedDatabase','TaskName','AISalesMode')
    foreach ($property in $c.PSObject.Properties.Name) { if ($property -notin $allowed) { throw 'CONFIG_UNKNOWN_FIELD' } }
    $aiProperty=$c.PSObject.Properties['AISalesMode']
    if (!$aiProperty) { $c | Add-Member -NotePropertyName AISalesMode -NotePropertyValue 'off' }
    if ($c.AISalesMode -notin @('off','copilot')) { throw 'CONFIG_AI_SALES_MODE_REJECTED' }
    foreach ($key in $keys) {
        if (!$c.$key -or ![IO.Path]::IsPathRooted($c.$key)) { throw ('CONFIG_PATH_REQUIRED_' + $key) }
        if ($c.$key.Contains('"') -or $c.$key.Contains("`r") -or $c.$key.Contains("`n")) { throw 'CONFIG_PATH_CHARACTERS_REJECTED' }
        if ($key -notin @('RuntimeDir','LogDir') -and !(Test-Path -LiteralPath $c.$key)) { throw ('CONFIG_PATH_MISSING_' + $key) }
    }
    foreach ($key in @('OwnerSid','NodeSha256','NativeSourceCommit','NativePackageId','ExpectedDatabase','TaskName')) {
        if (!$c.$key) { throw ('CONFIG_FIELD_REQUIRED_' + $key) }
    }
    foreach ($p in @($File,$c.RuntimeDir,$c.LogDir,$c.BaselineEnv,$c.ErpBaselineEnv,$c.NativeConfig)) {
        if (!(Outside-Checkout $p $c.RepoRoot)) { throw 'PRIVATE_STATE_INSIDE_CHECKOUT' }
    }
    if ($c.TaskName -notmatch '^Melisa-CRM-TEST-[A-Za-z0-9_-]+$') { throw 'TEST_TASK_NAME_REQUIRED' }
    if ($c.ExpectedDatabase -ne 'MELISA_ERP_SIRKET_TEST_20260929_01' -or $c.NativePackageId -notlike 'CRM-ORDER-DRAFT-TEST-*') { throw 'TEST_NATIVE_SCOPE_REQUIRED' }
    if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $c.OwnerSid) { throw 'TEST_OWNER_MISMATCH' }
    if ((Get-FileHash -LiteralPath $c.NodePath -Algorithm SHA256).Hash -ne $c.NodeSha256) { throw 'TEST_NODE_HASH_MISMATCH' }
    $origin = & git -C $c.RepoRoot config --get remote.origin.url
    if ($LASTEXITCODE -ne 0 -or $origin -ne 'https://github.com/melihsnyldzz-ui/melisa-crm.git') { throw 'TEST_CHECKOUT_ORIGIN_MISMATCH' }
    $pushOrigin = & git -C $c.RepoRoot remote get-url --push origin
    if ($LASTEXITCODE -ne 0 -or $pushOrigin -ne $origin) { throw 'TEST_CHECKOUT_PUSH_ORIGIN_MISMATCH' }
    if (!(Test-Path -LiteralPath (Join-Path $c.RepoRoot 'deploy/test-supervisor.mjs'))) { throw 'TEST_CHECKOUT_ENTRY_MISSING' }
    $manifest = Get-Content -LiteralPath (Join-Path $c.NativeRelease 'release-manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.sourceCommit -ne $c.NativeSourceCommit -or $manifest.packageId -ne $c.NativePackageId) { throw 'TEST_NATIVE_RELEASE_MISMATCH' }
    return $c
}
function Get-TestProcess($ProcessId) {
    return Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$ProcessId) -ErrorAction Stop
}
function Assert-OwnedProcess($ProcessId, $Config, $Script, $ParentId = 0, $AllowRelative = $false) {
    $p = Get-TestProcess $ProcessId
    if (!$p) { return $null }
    $sid = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid
    if ($sid.ReturnValue -ne 0 -or $sid.Sid -ne $Config.OwnerSid -or !(Same-Path $p.ExecutablePath $Config.NodePath)) { throw 'TEST_PROCESS_OWNER_OR_NODE_MISMATCH' }
    $absolute = '(?:^|\s)"?' + [regex]::Escape([IO.Path]::GetFullPath($Script)) + '"?(?:\s|$)'
    $relative = '(?:^|\s)"?deploy[/\\]test-supervisor\.mjs"?(?:\s|$)'
    if ($p.CommandLine -notmatch $absolute -and !($AllowRelative -and $p.CommandLine -match $relative)) { throw 'TEST_PROCESS_SCRIPT_MISMATCH' }
    if ($ParentId -and $p.ParentProcessId -ne $ParentId) { throw 'TEST_PROCESS_PARENT_MISMATCH' }
    return $p
}
function Get-TestListeners {
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(62400,62401,62402,62403,62404) })
}
function Assert-TestListeners($Listeners, $Expected) {
    foreach ($l in $Listeners) {
        if ($l.LocalAddress -ne '127.0.0.1' -or !$Expected.ContainsKey([int]$l.LocalPort) -or $Expected[[int]$l.LocalPort] -ne $l.OwningProcess) { throw 'TEST_FOREIGN_PORT_OWNER' }
    }
}
function Read-SupervisorIdentity($Config) {
    $file = Join-Path $Config.RuntimeDir 'processes.json'
    if (!(Test-Path -LiteralPath $file)) { return $null }
    $r = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if (!(Same-Path $r.root $Config.RepoRoot) -or !(Same-Path $r.executable $Config.NodePath) -or !(Same-Path $r.runtime $Config.RuntimeDir) -or !(Same-Path $r.logs $Config.LogDir)) { throw 'TEST_SUPERVISOR_RECORD_MISMATCH' }
    $super = Assert-OwnedProcess $r.supervisor $Config (Join-Path $Config.RepoRoot 'deploy/test-supervisor.mjs') 0 $true
    $children = @{}
    foreach ($name in @('test-server.mjs','test-erp-catalog.mjs','test-erp-orders.mjs')) {
        $property = $r.children.PSObject.Properties[$name]
        if (!$property) { continue }
        $child = Assert-OwnedProcess $property.Value $Config (Join-Path $Config.RepoRoot ('deploy/' + $name)) $r.supervisor
        if ($child) {
            if ($child.CreationDate.ToUniversalTime() -lt ([datetime]$r.startedAt).ToUniversalTime().AddSeconds(-10)) { throw 'TEST_CHILD_PID_REUSED' }
            $children[$name] = $child
        }
    }
    if ($super) {
        $created = $super.CreationDate.ToUniversalTime()
        if ([Math]::Abs(($created - ([datetime]$r.startedAt).ToUniversalTime()).TotalSeconds) -gt 10) { throw 'TEST_SUPERVISOR_PID_REUSED' }
        # A relative supervisor command is accepted only with its validated child chain.
        if ($super.CommandLine -notmatch [regex]::Escape((Join-Path $Config.RepoRoot 'deploy/test-supervisor.mjs')) -and $children.Count -eq 0) { throw 'TEST_RELATIVE_SUPERVISOR_UNPROVEN' }
    }
    return @{Record=$r; Supervisor=$super; Children=$children}
}
function Assert-NativeHealth($Config) {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:62404/test-health' -TimeoutSec 5
    if (!$h.ok -or $h.environment -ne 'CANONICAL_TEST' -or $h.purpose -ne 'crm-order-draft-only' -or $h.database -ne $Config.ExpectedDatabase -or $h.sourceCommit -ne $Config.NativeSourceCommit -or $h.packageId -ne $Config.NativePackageId -or $h.port -ne 62404 -or $h.stockEffect -ne $false -or $h.ledgerEffect -ne $false) { throw 'TEST_NATIVE_HEALTH_IDENTITY_MISMATCH' }
}
function Get-ReadinessDecision($Alive, $Ready, $ElapsedSeconds, $GraceSeconds) {
    if ($Ready) { return 'ready' }
    if (!$Alive) { return 'restart' }
    if ($ElapsedSeconds -ge $GraceSeconds) { return 'recover' }
    return 'wait'
}
function Write-TestIdentityAtomic($Path, $Identity) {
    $temporary=$Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $backup=$temporary + '.bak'
    try {
        [IO.File]::WriteAllText($temporary, ($Identity | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary,$Path,$backup) }
        else { [IO.File]::Move($temporary,$Path) }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
        if ([IO.File]::Exists($backup)) { [IO.File]::Delete($backup) }
    }
}
function Test-NetworkFailure($Exception) {
    $e=$Exception
    while ($e) {
        if ($e -is [Net.WebException]) {
            return $e.Status.ToString() -in @('Timeout','ConnectFailure','ReceiveFailure','ConnectionClosed','KeepAliveFailure','SendFailure')
        }
        $e=$e.InnerException
    }
    return $false
}
function Stop-VerifiedTestProcess($Snapshot, $Config, $Script, $ConfigArgument = '') {
    $current=Assert-OwnedProcess $Snapshot.ProcessId $Config $Script
    if (!$current) { return }
    if ($current.CreationDate -ne $Snapshot.CreationDate) { throw 'TEST_RECOVERY_PID_REUSED' }
    if ($ConfigArgument -and $current.CommandLine -notmatch ('(?:^|\s)"?' + [regex]::Escape($ConfigArgument) + '"?(?:\s|$)')) { throw 'TEST_RECOVERY_CONFIG_MISMATCH' }
    Stop-Process -Id $current.ProcessId -ErrorAction Stop
    for ($i=0; $i -lt 20; $i++) {
        $remaining=Get-TestProcess $current.ProcessId
        if (!$remaining -or $remaining.CreationDate -ne $current.CreationDate) { return }
        Start-Sleep -Milliseconds 250
    }
    throw 'TEST_RECOVERY_PROCESS_DID_NOT_EXIT'
}
function Assert-PendingSupervisorPorts($Listeners, $Snapshot, $Config, $NativeId) {
    $expected=@{62404=$NativeId}
    foreach ($l in $Listeners) {
        if ($l.LocalPort -eq 62404) { continue }
        $name=switch ([int]$l.LocalPort) {62400 {'test-server.mjs'} 62401 {'test-server.mjs'} 62402 {'test-erp-catalog.mjs'} 62403 {'test-erp-orders.mjs'} default {throw 'TEST_FOREIGN_PORT_OWNER'}}
        $child=Assert-OwnedProcess $l.OwningProcess $Config (Join-Path $Config.RepoRoot ('deploy/'+$name)) $Snapshot.ProcessId
        if (!$child -or $child.CreationDate -lt $Snapshot.CreationDate) { throw 'TEST_PENDING_CHILD_IDENTITY_MISMATCH' }
        $expected[[int]$l.LocalPort]=$child.ProcessId
    }
    Assert-TestListeners $Listeners $expected
}
function Start-TestNode($Config, $Script, $WorkingDirectory, $Arguments, $Label) {
    $args = '"' + $Script + '"'
    foreach ($a in $Arguments) { if ($a.Contains('"')) { throw 'TEST_ARGUMENT_QUOTE_REJECTED' }; $args += ' "' + $a + '"' }
    return Start-Process -FilePath $Config.NodePath -ArgumentList $args -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Config.LogDir ($Label + '.out.log')) -RedirectStandardError (Join-Path $Config.LogDir ($Label + '.err.log'))
}
function Invoke-TestSession($Config) {
    $mutex = New-Object Threading.Mutex($false, (Get-TestMutexName $Config.RepoRoot $Config.OwnerSid))
    $held = $false
    try {
        try { $held = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held = $true }
        if (!$held) { return }
        New-Item -ItemType Directory -Force -Path $Config.RuntimeDir,$Config.LogDir | Out-Null
        $env:CRM_BASELINE_ENV=$Config.BaselineEnv; $env:CRM_ERP_API_ROOT=$Config.ErpApiRoot
        $env:CRM_ERP_BASELINE_ENV=$Config.ErpBaselineEnv; $env:CRM_ERP_PHOTO_ROOT=$Config.PhotoRoot
        $env:CRM_TEST_RUNTIME_DIR=$Config.RuntimeDir; $env:CRM_TEST_LOG_DIR=$Config.LogDir
        $env:CRM_AI_SALES_MODE=$Config.AISalesMode
        Remove-Item Env:CRM_AI_SALES_RULES_FILE -ErrorAction SilentlyContinue
        $nativeScript=Join-Path $Config.NativeRelease 'apps/api/start-crm-order-test.mjs'
        $nativeId=0
        $nativeRecord=Join-Path $Config.RuntimeDir 'native-session-process.json'
        if (Test-Path -LiteralPath $nativeRecord) {
            $saved=Get-Content -LiteralPath $nativeRecord -Raw | ConvertFrom-Json
            if (!(Same-Path $saved.release $Config.NativeRelease) -or !(Same-Path $saved.config $Config.NativeConfig)) { throw 'TEST_NATIVE_RECORD_MISMATCH' }
            $p=Assert-OwnedProcess $saved.pid $Config $nativeScript
            if ($p) {
                if ([Math]::Abs(($p.CreationDate.ToUniversalTime() - ([datetime]$saved.createdAt).ToUniversalTime()).TotalSeconds) -gt 1) { throw 'TEST_NATIVE_PID_REUSED' }
                $nativeId=$p.ProcessId
            }
        }
        $nativeUnavailableSince=$null
        $pendingSupervisor=$null
        $pendingSince=$null
        while ($true) {
            $identity=Read-SupervisorIdentity $Config
            if ($pendingSupervisor) {
                $pending=Assert-OwnedProcess $pendingSupervisor.ProcessId $Config (Join-Path $Config.RepoRoot 'deploy/test-supervisor.mjs')
                if ($pending -and $pending.CreationDate -ne $pendingSupervisor.CreationDate) { throw 'TEST_PENDING_SUPERVISOR_PID_REUSED' }
                $ready=$identity -and $identity.Supervisor -and $identity.Supervisor.ProcessId -eq $pendingSupervisor.ProcessId
                $decision=Get-ReadinessDecision ([bool]$pending) ([bool]$ready) ((Get-Date)-$pendingSince).TotalSeconds 60
                if ($decision -eq 'wait') {
                    Assert-PendingSupervisorPorts (Get-TestListeners) $pendingSupervisor $Config $nativeId
                    Start-Sleep -Seconds 2; continue
                }
                if ($decision -eq 'recover') {
                    Stop-VerifiedTestProcess $pendingSupervisor $Config (Join-Path $Config.RepoRoot 'deploy/test-supervisor.mjs')
                    # Child orphan recovery needs the existing supervisor identity record.
                    if (@(Get-TestListeners | Where-Object {$_.LocalPort -ne 62404}).Count -and (!$identity -or $identity.Record.supervisor -ne $pendingSupervisor.ProcessId)) { throw 'TEST_PENDING_CHILD_RECORD_REQUIRED' }
                }
                $pendingSupervisor=$null; $pendingSince=$null
                if ($decision -eq 'recover') { continue }
            }
            $expected=@{}
            if ($identity) {
                foreach ($pair in @(@('test-server.mjs',62400),@('test-server.mjs',62401),@('test-erp-catalog.mjs',62402),@('test-erp-orders.mjs',62403))) {
                    if ($identity.Children.ContainsKey($pair[0])) { $expected[[int]$pair[1]]=$identity.Children[$pair[0]].ProcessId }
                }
            }
            $listeners=Get-TestListeners
            $nativeListeners=@($listeners | Where-Object {$_.LocalPort -eq 62404})
            if ($nativeListeners.Count) {
                $nativeId=$nativeListeners[0].OwningProcess
                $native=Assert-OwnedProcess $nativeId $Config $nativeScript
                if (!$native -or $native.CommandLine -notmatch ('(?:^|\s)"?' + [regex]::Escape($Config.NativeConfig) + '"?(?:\s|$)')) { throw 'TEST_NATIVE_CONFIG_ARGUMENT_MISMATCH' }
                $expected[62404]=$nativeId
            } elseif ($nativeId) {
                $native=Assert-OwnedProcess $nativeId $Config $nativeScript
                if (!$native) { $nativeId=0 }
            }
            Assert-TestListeners $listeners $expected
            if (!$nativeId) {
                $native=Start-TestNode $Config $nativeScript (Join-Path $Config.NativeRelease 'apps/api') @($Config.NativeConfig) 'native-draft'
                $nativeId=$native.Id
                Start-Sleep -Seconds 5
            }
            $native=Assert-OwnedProcess $nativeId $Config $nativeScript
            if (!$native) { continue }
            Write-TestIdentityAtomic $nativeRecord @{pid=$nativeId;release=$Config.NativeRelease;config=$Config.NativeConfig;createdAt=$native.CreationDate.ToUniversalTime().ToString('o')}
            try { Assert-NativeHealth $Config; $nativeUnavailableSince=$null } catch {
                # Invalid health identity and HTTP error responses are never restart evidence.
                if (!(Test-NetworkFailure $_.Exception)) { throw }
                if (!$nativeUnavailableSince) { $nativeUnavailableSince=Get-Date }
                if ((Get-ReadinessDecision $true $false ((Get-Date)-$nativeUnavailableSince).TotalSeconds 60) -eq 'recover') {
                    Stop-VerifiedTestProcess $native $Config $nativeScript $Config.NativeConfig
                    $nativeId=0; $nativeUnavailableSince=$null
                    continue
                }
                Start-Sleep -Seconds 5; continue
            }
            if (!$identity -or !$identity.Supervisor) {
                # Only verified orphan TEST children may be stopped to free their ports.
                if ($identity) {
                    foreach ($name in $identity.Children.Keys) {
                        $child=$identity.Children[$name]
                        $verified=Assert-OwnedProcess $child.ProcessId $Config (Join-Path $Config.RepoRoot ('deploy/' + $name)) $identity.Record.supervisor
                        if ($verified -and $verified.CreationDate -eq $child.CreationDate) { Stop-Process -Id $child.ProcessId -ErrorAction Stop }
                    }
                }
                if (@(Get-TestListeners | Where-Object {$_.LocalPort -ne 62404}).Count) { throw 'TEST_CRM_PORTS_NOT_FREE' }
                $started=Start-TestNode $Config (Join-Path $Config.RepoRoot 'deploy/test-supervisor.mjs') $Config.RepoRoot @() 'supervisor'
                $pendingSupervisor=Assert-OwnedProcess $started.Id $Config (Join-Path $Config.RepoRoot 'deploy/test-supervisor.mjs')
                if (!$pendingSupervisor) { throw 'TEST_SUPERVISOR_START_FAILED' }
                $pendingSince=Get-Date
                Start-Sleep -Seconds 5
            }
            Start-Sleep -Seconds 5
        }
    } finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
}
if (!$Library) { try { Invoke-TestSession (Read-TestConfig $ConfigPath) } catch { $code=$_.Exception.GetType().Name; if ($_.Exception.Message -match '^[A-Z][A-Z0-9_]+$') {$code=$_.Exception.Message}; Write-Error ('TEST_SESSION_FAILED: ' + $code); exit 1 } }
