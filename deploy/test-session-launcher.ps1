param([string]$ConfigPath, [switch]$Library)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Same-Path($A, $B) {
    if (!$A -or !$B) { return $false }
    return [IO.Path]::GetFullPath($A).TrimEnd('\','/').Equals([IO.Path]::GetFullPath($B).TrimEnd('\','/'), [StringComparison]::OrdinalIgnoreCase)
}
function Resolve-TestLanAddress($Address = '') {
    if ($Address -isnot [string]) { throw 'TEST_LAN_ADDRESS_INVALID' }
    if ($Address -ceq '') { return '' }
    if ($Address -cnotmatch '^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$') { throw 'TEST_LAN_ADDRESS_INVALID' }
    $parts=@($Address.Split('.') | ForEach-Object {[int]$_})
    if (@($parts | Where-Object {$_ -gt 255}).Count -or !($parts[0] -eq 10 -or ($parts[0] -eq 172 -and $parts[1] -ge 16 -and $parts[1] -le 31) -or ($parts[0] -eq 192 -and $parts[1] -eq 168))) { throw 'TEST_LAN_ADDRESS_INVALID' }
    return $Address
}
function Get-TestLanAddress($Config) {
    $property=$Config.PSObject.Properties['LanAddress']
    if (!$property) { return '' }
    return Resolve-TestLanAddress $property.Value
}
function Set-TestLanEnvironment($Config) {
    $env:CRM_TEST_LAN_ADDRESS=Get-TestLanAddress $Config
}
function Assert-TestLanInterface($Address = '') {
    $lan=Resolve-TestLanAddress $Address
    if (!$lan) { return }
    $minimum=if ($lan.StartsWith('10.')) {8} elseif ($lan.StartsWith('172.')) {12} else {16}
    try {
        $physical=@(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object {$_.Status -eq 'Up'})
        $assigned=@(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $lan -ErrorAction Stop | Where-Object {$_.IPAddress -ceq $lan -and $_.AddressState -eq 'Preferred' -and $_.PrefixLength -ge $minimum -and $_.PrefixLength -le 30 -and $_.InterfaceIndex -in $physical.InterfaceIndex})
        if ($assigned.Count -ne 1) { throw 'TEST_LAN_INTERFACE_REQUIRED' }
    } catch { throw 'TEST_LAN_INTERFACE_REQUIRED' }
}
function Get-TestFileSha256($Path) {
    $stream=[IO.File]::OpenRead($Path)
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') }
    finally { $sha.Dispose(); $stream.Dispose() }
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
function Get-TestExecutionRoot($Config) {
    $property=$Config.PSObject.Properties['PackageRoot']
    if ($property -and $property.Value) { return [IO.Path]::GetFullPath($property.Value) }
    return [IO.Path]::GetFullPath($Config.RepoRoot)
}
function Set-TestPackageEnvironment($Config) {
    $property=$Config.PSObject.Properties['PackageRoot']
    if ($property -and $property.Value) {
        $env:CRM_TEST_PACKAGE_ROOT=Get-TestExecutionRoot $Config
        $env:CRM_TEST_PACKAGE_MANIFEST_SHA256=$Config.PackageManifestSha256
    } else {
        $env:CRM_TEST_PACKAGE_ROOT=''
        $env:CRM_TEST_PACKAGE_MANIFEST_SHA256=''
    }
}
function Assert-TestPackage($Config) {
    $property=$Config.PSObject.Properties['PackageRoot']
    if (!$property -or !$property.Value) { return }
    $verifier=Join-Path $Config.RepoRoot 'deploy/test-package.mjs'
    if (!(Test-Path -LiteralPath $verifier)) { throw 'TEST_PACKAGE_VERIFIER_MISSING' }
    # Invoke the canonical verifier with the pinned Node; package scripts cannot authorize themselves.
    try {
        $result=& $Config.NodePath $verifier verify --package-root $Config.PackageRoot --manifest-sha256 $Config.PackageManifestSha256
        if ($LASTEXITCODE -ne 0) { throw 'TEST_PACKAGE_VERIFICATION_FAILED' }
        $verified=($result -join "`n") | ConvertFrom-Json
        if (!$verified -or $verified -isnot [pscustomobject]) { throw 'TEST_PACKAGE_VERIFICATION_FAILED' }
    } catch { throw 'TEST_PACKAGE_VERIFICATION_FAILED' }
}
function Read-TestConfig($File, [switch]$DeferLanInterface) {
    if (![IO.Path]::IsPathRooted($File)) { throw 'CONFIG_ABSOLUTE_PATH_REQUIRED' }
    $c = Get-Content -LiteralPath $File -Raw | ConvertFrom-Json
    $keys = @('RepoRoot','NodePath','BaselineEnv','ErpApiRoot','ErpBaselineEnv','PhotoRoot','RuntimeDir','LogDir','NativeRelease','NativeConfig')
    $allowed = $keys + @('OwnerSid','NodeSha256','NativeSourceCommit','NativePackageId','ExpectedDatabase','TaskName','AISalesMode','PackageRoot','PackageManifestSha256','LanAddress','CatalogOrigin','CatalogAccessPath','TerminalPersonnelUsername')
    foreach ($property in $c.PSObject.Properties.Name) { if ($property -notin $allowed) { throw 'CONFIG_UNKNOWN_FIELD' } }
    if ($c.PSObject.Properties['CatalogOrigin'] -and $c.CatalogOrigin -ne 'http://127.0.0.1:4144') { throw 'TEST_CATALOG_ORIGIN_REJECTED' }
    if ($c.PSObject.Properties['CatalogAccessPath']) {
        if (!$c.CatalogAccessPath -or ![IO.Path]::IsPathRooted($c.CatalogAccessPath) -or !(Test-Path -LiteralPath $c.CatalogAccessPath -PathType Leaf) -or !(Outside-Checkout $c.CatalogAccessPath $c.RepoRoot)) { throw 'TEST_CATALOG_ACCESS_MUST_BE_PRIVATE' }
    }
    $lanAddress=Get-TestLanAddress $c
    if (!$DeferLanInterface) { Assert-TestLanInterface $lanAddress }
    $aiProperty=$c.PSObject.Properties['AISalesMode']
    if (!$aiProperty) { $c | Add-Member -NotePropertyName AISalesMode -NotePropertyValue 'off' }
    if ($c.AISalesMode -notin @('off','copilot')) { throw 'CONFIG_AI_SALES_MODE_REJECTED' }
    if (!$c.PSObject.Properties['TerminalPersonnelUsername']) { $c | Add-Member -NotePropertyName TerminalPersonnelUsername -NotePropertyValue '' }
    if ($c.TerminalPersonnelUsername -notin @('','crm-ahmet')) { throw 'TEST_PERSONNEL_IDENTITY_REQUIRED' }
    foreach ($key in $keys) {
        if (!$c.$key -or ![IO.Path]::IsPathRooted($c.$key)) { throw ('CONFIG_PATH_REQUIRED_' + $key) }
        if ($c.$key.Contains('"') -or $c.$key.Contains("`r") -or $c.$key.Contains("`n")) { throw 'CONFIG_PATH_CHARACTERS_REJECTED' }
        if ($key -notin @('RuntimeDir','LogDir') -and !(Test-Path -LiteralPath $c.$key)) { throw ('CONFIG_PATH_MISSING_' + $key) }
    }
    foreach ($key in @('OwnerSid','NodeSha256','NativeSourceCommit','NativePackageId','ExpectedDatabase','TaskName')) {
        if (!$c.$key) { throw ('CONFIG_FIELD_REQUIRED_' + $key) }
    }
    $packageRoot=$c.PSObject.Properties['PackageRoot']; $packageHash=$c.PSObject.Properties['PackageManifestSha256']
    if ([bool]$packageRoot -ne [bool]$packageHash) { throw 'CONFIG_PACKAGE_PAIR_REQUIRED' }
    if ($packageRoot) {
        if (!$packageRoot.Value -or ![IO.Path]::IsPathRooted($packageRoot.Value) -or !$packageHash.Value -or $packageHash.Value -notmatch '^[a-fA-F0-9]{64}$') { throw 'CONFIG_PACKAGE_IDENTITY_REQUIRED' }
        if ($packageRoot.Value.Contains('"') -or $packageRoot.Value.Contains("`r") -or $packageRoot.Value.Contains("`n")) { throw 'CONFIG_PATH_CHARACTERS_REJECTED' }
        if (!(Test-Path -LiteralPath $packageRoot.Value -PathType Container)) { throw 'CONFIG_PACKAGE_ROOT_MISSING' }
        if (!(Outside-Checkout $packageRoot.Value $c.RepoRoot) -or !(Outside-Checkout $c.RepoRoot $packageRoot.Value)) { throw 'CONFIG_PACKAGE_INSIDE_CHECKOUT' }
    }
    foreach ($p in @($File,$c.RuntimeDir,$c.LogDir,$c.BaselineEnv,$c.ErpBaselineEnv,$c.NativeConfig)) {
        if (!(Outside-Checkout $p $c.RepoRoot)) { throw 'PRIVATE_STATE_INSIDE_CHECKOUT' }
        if ($packageRoot -and !(Outside-Checkout $p $packageRoot.Value)) { throw 'PRIVATE_STATE_INSIDE_PACKAGE' }
    }
    if ($c.TaskName -notmatch '^Melisa-CRM-TEST-[A-Za-z0-9_-]+$') { throw 'TEST_TASK_NAME_REQUIRED' }
    if ($c.ExpectedDatabase -ne 'MELISA_ERP_SIRKET_TEST_20260929_01' -or $c.NativePackageId -notlike 'CRM-ORDER-DRAFT-TEST-*') { throw 'TEST_NATIVE_SCOPE_REQUIRED' }
    if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $c.OwnerSid) { throw 'TEST_OWNER_MISMATCH' }
    if ((Get-TestFileSha256 $c.NodePath) -ne $c.NodeSha256) { throw 'TEST_NODE_HASH_MISMATCH' }
    $origin = & git -C $c.RepoRoot config --get remote.origin.url
    if ($LASTEXITCODE -ne 0 -or $origin -ne 'https://github.com/melihsnyldzz-ui/melisa-crm.git') { throw 'TEST_CHECKOUT_ORIGIN_MISMATCH' }
    $pushOrigin = & git -C $c.RepoRoot remote get-url --push origin
    if ($LASTEXITCODE -ne 0 -or $pushOrigin -ne $origin) { throw 'TEST_CHECKOUT_PUSH_ORIGIN_MISMATCH' }
    if (!(Test-Path -LiteralPath (Join-Path $c.RepoRoot 'deploy/test-supervisor.mjs'))) { throw 'TEST_CHECKOUT_ENTRY_MISSING' }
    $manifest = Get-Content -LiteralPath (Join-Path $c.NativeRelease 'release-manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.sourceCommit -ne $c.NativeSourceCommit -or $manifest.packageId -ne $c.NativePackageId) { throw 'TEST_NATIVE_RELEASE_MISMATCH' }
    Assert-TestPackage $c
    return $c
}
function Get-TestProcess($ProcessId) {
    return Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$ProcessId) -ErrorAction Stop
}
function Assert-OwnedProcess($ProcessId, $Config, $Script, $ParentId = 0, $AllowRelative = $false) {
    $p = Get-TestProcess $ProcessId
    if (!$p) { return $null }
    try { $sid = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid }
    catch [Microsoft.Management.Infrastructure.CimException] {
        # A process can exit between the CIM snapshot and GetOwnerSid. Only the
        # NotFound race with a fresh missing PID is ordinary recovery evidence.
        if ($_.Exception.NativeErrorCode -ne [Microsoft.Management.Infrastructure.NativeErrorCode]::NotFound -and $_.Exception.StatusCode -ne 6 -and $_.FullyQualifiedErrorId -notlike 'HRESULT 0x80041002,*') { throw }
        $after = Get-TestProcess $ProcessId
        if (!$after) { return $null }
        if ($after.CreationDate -ne $p.CreationDate) { throw 'TEST_PROCESS_PID_REUSED' }
        throw
    }
    $verified = Get-TestProcess $ProcessId
    if (!$verified) { return $null }
    if ($verified.CreationDate -ne $p.CreationDate) { throw 'TEST_PROCESS_PID_REUSED' }
    $p = $verified
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
function Assert-TestListeners($Listeners, $Expected, $LanAddress = '') {
    $lan=Resolve-TestLanAddress $LanAddress
    foreach ($l in $Listeners) {
        $addressAllowed=$l.LocalAddress -eq '127.0.0.1' -or ($lan -and $l.LocalPort -eq 62400 -and $l.LocalAddress -ceq $lan)
        if (!$addressAllowed -or !$Expected.ContainsKey([int]$l.LocalPort) -or $Expected[[int]$l.LocalPort] -ne $l.OwningProcess) { throw 'TEST_FOREIGN_PORT_OWNER' }
    }
}
function Read-SupervisorIdentity($Config) {
    $file = Join-Path $Config.RuntimeDir 'processes.json'
    if (!(Test-Path -LiteralPath $file)) { return $null }
    $r = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    $executionRoot=Get-TestExecutionRoot $Config
    if (!(Same-Path $r.root $executionRoot) -or !(Same-Path $r.executable $Config.NodePath) -or !(Same-Path $r.runtime $Config.RuntimeDir) -or !(Same-Path $r.logs $Config.LogDir)) { throw 'TEST_SUPERVISOR_RECORD_MISMATCH' }
    $allowRelative=Same-Path $executionRoot $Config.RepoRoot
    $super = Assert-OwnedProcess $r.supervisor $Config (Join-Path $executionRoot 'deploy/test-supervisor.mjs') 0 $allowRelative
    $children = @{}
    foreach ($name in @('test-server.mjs','test-erp-catalog.mjs','test-erp-orders.mjs')) {
        $property = $r.children.PSObject.Properties[$name]
        if (!$property) { continue }
        $child = Assert-OwnedProcess $property.Value $Config (Join-Path $executionRoot ('deploy/' + $name)) $r.supervisor
        if ($child) {
            if ($child.CreationDate.ToUniversalTime() -lt ([datetime]$r.startedAt).ToUniversalTime().AddSeconds(-10)) { throw 'TEST_CHILD_PID_REUSED' }
            $children[$name] = $child
        }
    }
    if ($super) {
        $created = $super.CreationDate.ToUniversalTime()
        if ([Math]::Abs(($created - ([datetime]$r.startedAt).ToUniversalTime()).TotalSeconds) -gt 10) { throw 'TEST_SUPERVISOR_PID_REUSED' }
        # A relative supervisor command is accepted only with its validated child chain.
        if ($super.CommandLine -notmatch [regex]::Escape((Join-Path $executionRoot 'deploy/test-supervisor.mjs')) -and $children.Count -eq 0) { throw 'TEST_RELATIVE_SUPERVISOR_UNPROVEN' }
    }
    return @{Record=$r; Supervisor=$super; Children=$children}
}
function Get-TestExpectedPorts($Identity) {
    $expected=@{}
    if ($Identity) {
        foreach ($pair in @(@('test-server.mjs',62400),@('test-server.mjs',62401),@('test-erp-catalog.mjs',62402),@('test-erp-orders.mjs',62403))) {
            if ($Identity.Children.ContainsKey($pair[0])) { $expected[[int]$pair[1]]=$Identity.Children[$pair[0]].ProcessId }
        }
    }
    return $expected
}
function Assert-TestSessionListeners($Listeners, $Expected, $Identity, $Config, $NativeSnapshot) {
    try {
        Assert-TestListeners $Listeners $Expected (Get-TestLanAddress $Config)
        return @{Identity=$Identity;Listeners=$Listeners;Expected=$Expected}
    } catch {
        if ($_.Exception.Message -ne 'TEST_FOREIGN_PORT_OWNER') { throw }
        # One atomic record/listener refresh handles only a verified child restart under the same supervisor.
        if (!$Identity -or !$Identity.Supervisor) { throw 'TEST_FOREIGN_PORT_OWNER' }
        $fresh=Read-SupervisorIdentity $Config
        if (!$fresh -or !$fresh.Supervisor -or $fresh.Supervisor.ProcessId -ne $Identity.Supervisor.ProcessId -or $fresh.Supervisor.CreationDate -ne $Identity.Supervisor.CreationDate) { throw 'TEST_FOREIGN_PORT_OWNER' }
        $freshExpected=Get-TestExpectedPorts $fresh
        if ($Expected.ContainsKey(62404)) {
            if (!$NativeSnapshot -or $NativeSnapshot.ProcessId -ne $Expected[62404]) { throw 'TEST_FOREIGN_PORT_OWNER' }
            $nativeScript=Join-Path $Config.NativeRelease 'apps/api/start-crm-order-test.mjs'
            $native=Assert-OwnedProcess $NativeSnapshot.ProcessId $Config $nativeScript
            if (!$native -or $native.CreationDate -ne $NativeSnapshot.CreationDate -or $native.CommandLine -notmatch ('(?:^|\s)"?' + [regex]::Escape($Config.NativeConfig) + '"?(?:\s|$)')) { throw 'TEST_FOREIGN_PORT_OWNER' }
            $freshExpected[62404]=$native.ProcessId
        }
        $freshListeners=Get-TestListeners
        $super=Assert-OwnedProcess $fresh.Supervisor.ProcessId $Config (Join-Path (Get-TestExecutionRoot $Config) 'deploy/test-supervisor.mjs') 0 (Same-Path (Get-TestExecutionRoot $Config) $Config.RepoRoot)
        if (!$super -or $super.CreationDate -ne $Identity.Supervisor.CreationDate) { throw 'TEST_FOREIGN_PORT_OWNER' }
        Assert-TestListeners $freshListeners $freshExpected (Get-TestLanAddress $Config)
        return @{Identity=$fresh;Listeners=$freshListeners;Expected=$freshExpected}
    }
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
        $child=Assert-OwnedProcess $l.OwningProcess $Config (Join-Path (Get-TestExecutionRoot $Config) ('deploy/'+$name)) $Snapshot.ProcessId
        if (!$child -or $child.CreationDate -lt $Snapshot.CreationDate) { throw 'TEST_PENDING_CHILD_IDENTITY_MISMATCH' }
        $expected[[int]$l.LocalPort]=$child.ProcessId
    }
    Assert-TestListeners $Listeners $expected (Get-TestLanAddress $Config)
}
function Start-TestNode($Config, $Script, $WorkingDirectory, $Arguments, $Label) {
    if ($Label -eq 'supervisor') { Assert-TestPackage $Config }
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
        $executionRoot=Get-TestExecutionRoot $Config
        Set-TestPackageEnvironment $Config
        New-Item -ItemType Directory -Force -Path $Config.RuntimeDir,$Config.LogDir | Out-Null
        $env:CRM_BASELINE_ENV=$Config.BaselineEnv; $env:CRM_ERP_API_ROOT=$Config.ErpApiRoot
        Remove-Item Env:CRM_ERP_CATALOG_ACCESS_PATH -ErrorAction SilentlyContinue
        if ($Config.PSObject.Properties['CatalogAccessPath']) { $env:CRM_ERP_CATALOG_ACCESS_PATH=$Config.CatalogAccessPath }
        $env:CRM_ERP_BASELINE_ENV=$Config.ErpBaselineEnv; $env:CRM_ERP_PHOTO_ROOT=$Config.PhotoRoot
        $env:CRM_TEST_RUNTIME_DIR=$Config.RuntimeDir; $env:CRM_TEST_LOG_DIR=$Config.LogDir
        Set-TestLanEnvironment $Config
        $env:CRM_AI_SALES_MODE=$Config.AISalesMode
        $terminalPersonnelProperty=$Config.PSObject.Properties['TerminalPersonnelUsername']
        $terminalPersonnel=if ($terminalPersonnelProperty) { [string]$terminalPersonnelProperty.Value } else { '' }
        if ($terminalPersonnel -notin @('','crm-ahmet')) { throw 'TEST_PERSONNEL_IDENTITY_REQUIRED' }
        $env:CRM_TEST_TERMINAL_PERSONNEL_USERNAME=$terminalPersonnel
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
                $pending=Assert-OwnedProcess $pendingSupervisor.ProcessId $Config (Join-Path $executionRoot 'deploy/test-supervisor.mjs')
                if ($pending -and $pending.CreationDate -ne $pendingSupervisor.CreationDate) { throw 'TEST_PENDING_SUPERVISOR_PID_REUSED' }
                $ready=$identity -and $identity.Supervisor -and $identity.Supervisor.ProcessId -eq $pendingSupervisor.ProcessId
                $decision=Get-ReadinessDecision ([bool]$pending) ([bool]$ready) ((Get-Date)-$pendingSince).TotalSeconds 60
                if ($decision -eq 'wait') {
                    Assert-PendingSupervisorPorts (Get-TestListeners) $pendingSupervisor $Config $nativeId
                    Start-Sleep -Seconds 2; continue
                }
                if ($decision -eq 'recover') {
                    Stop-VerifiedTestProcess $pendingSupervisor $Config (Join-Path $executionRoot 'deploy/test-supervisor.mjs')
                    # Child orphan recovery needs the existing supervisor identity record.
                    if (@(Get-TestListeners | Where-Object {$_.LocalPort -ne 62404}).Count -and (!$identity -or $identity.Record.supervisor -ne $pendingSupervisor.ProcessId)) { throw 'TEST_PENDING_CHILD_RECORD_REQUIRED' }
                }
                $pendingSupervisor=$null; $pendingSince=$null
                if ($decision -eq 'recover') { continue }
            }
            $expected=Get-TestExpectedPorts $identity
            $listeners=Get-TestListeners
            $nativeSnapshot=$null
            $nativeListeners=@($listeners | Where-Object {$_.LocalPort -eq 62404})
            if ($nativeListeners.Count) {
                $nativeId=$nativeListeners[0].OwningProcess
                $native=Assert-OwnedProcess $nativeId $Config $nativeScript
                if (!$native) {
                    # The listener snapshot may outlive its process. Re-read all
                    # listeners before recovering; never start against stale ports.
                    $nativeId=0; $nativeUnavailableSince=$null
                    continue
                }
                if ($native.CommandLine -notmatch ('(?:^|\s)"?' + [regex]::Escape($Config.NativeConfig) + '"?(?:\s|$)')) { throw 'TEST_NATIVE_CONFIG_ARGUMENT_MISMATCH' }
                $nativeSnapshot=$native
                $expected[62404]=$nativeId
            } elseif ($nativeId) {
                $native=Assert-OwnedProcess $nativeId $Config $nativeScript
                if (!$native) { $nativeId=0 }
                $nativeSnapshot=$native
            }
            $checked=Assert-TestSessionListeners $listeners $expected $identity $Config $nativeSnapshot
            $identity=$checked.Identity; $listeners=$checked.Listeners; $expected=$checked.Expected
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
                        $verified=Assert-OwnedProcess $child.ProcessId $Config (Join-Path $executionRoot ('deploy/' + $name)) $identity.Record.supervisor
                        if ($verified -and $verified.CreationDate -eq $child.CreationDate) { Stop-Process -Id $child.ProcessId -ErrorAction Stop }
                    }
                }
                if (@(Get-TestListeners | Where-Object {$_.LocalPort -ne 62404}).Count) { throw 'TEST_CRM_PORTS_NOT_FREE' }
                $started=Start-TestNode $Config (Join-Path $executionRoot 'deploy/test-supervisor.mjs') $executionRoot @() 'supervisor'
                $pendingSupervisor=Assert-OwnedProcess $started.Id $Config (Join-Path $executionRoot 'deploy/test-supervisor.mjs')
                if (!$pendingSupervisor) { throw 'TEST_SUPERVISOR_START_FAILED' }
                $pendingSince=Get-Date
                Start-Sleep -Seconds 5
            }
            Start-Sleep -Seconds 5
        }
    } finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
}
function Write-TestSessionFailure($Config, $Exception) {
    $code=$Exception.GetType().Name
    if ($Exception.Message -cmatch '^[A-Z][A-Z0-9_]{0,120}$') { $code=$Exception.Message }
    # Only a successfully validated config may provide the log path. Never persist raw errors.
    if ($Config -and (Test-Path -LiteralPath $Config.LogDir -PathType Container)) {
        try { Write-TestIdentityAtomic (Join-Path $Config.LogDir 'test-session-last-error.json') @{occurredAt=(Get-Date).ToUniversalTime().ToString('o');code=$code} } catch {}
    }
    return $code
}
if (!$Library) {
    $validatedConfig=$null
    try { $validatedConfig=Read-TestConfig $ConfigPath; Invoke-TestSession $validatedConfig }
    catch { $code=Write-TestSessionFailure $validatedConfig $_.Exception; Write-Error ('TEST_SESSION_FAILED: ' + $code); exit 1 }
}
