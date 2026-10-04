import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ps=path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
function run(body){
  const script=path.join(root,'deploy/test-session-launcher.ps1').replaceAll("'","''");
  return execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`. '${script}' -Library; ${body}`],{encoding:'utf8'}).trim();
}
test('PS5 library mode is inert and private state cannot overlap checkout',()=>{
  assert.equal(run(`if (!(Same-Path 'C:\\fixture\\repo\\' 'C:\\fixture\\repo')) { throw 'path' }; if (Outside-Checkout 'C:\\fixture\\repo\\runtime' 'C:\\fixture\\repo') { throw 'inside' }; if (!(Outside-Checkout 'C:\\fixture\\runtime' 'C:\\fixture\\repo')) { throw 'outside' }; 'PASS'`),'PASS');
});
test('equivalent checkout spellings share the same mutex identity',()=>{
  assert.equal(run(`$sid='S-1-5-21-fixture'; $first=Get-TestMutexName 'C:\\fixture\\repo' $sid; foreach ($root in @('C:\\fixture\\repo\\','c:/FIXTURE/repo/','C:\\fixture\\repo\\.','C:\\fixture\\temporary\\..\\repo')) { if ((Get-TestMutexName $root $sid) -ne $first) {throw 'split mutex'} }; if ((Get-TestMutexName 'C:\\fixture\\other' $sid) -eq $first) {throw 'different roots share mutex'}; 'PASS'`),'PASS');
});
test('listener ownership is fail closed, including partial foreign and non-loopback bindings',()=>{
  assert.equal(run(`$expected=@{62400=101;62401=101}; Assert-TestListeners @([pscustomobject]@{LocalPort=62400;LocalAddress='127.0.0.1';OwningProcess=101}) $expected; foreach ($listener in @([pscustomobject]@{LocalPort=62401;LocalAddress='127.0.0.1';OwningProcess=999},[pscustomobject]@{LocalPort=62400;LocalAddress='0.0.0.0';OwningProcess=101},[pscustomobject]@{LocalPort=62404;LocalAddress='127.0.0.1';OwningProcess=101})) { $rejected=$false; try { Assert-TestListeners @($listener) $expected } catch { $rejected=$_.Exception.Message -eq 'TEST_FOREIGN_PORT_OWNER' }; if (!$rejected) { throw 'foreign accepted' } }; 'PASS'`),'PASS');
});
test('process adoption requires configured SID, exact executable, script and parent',()=>{
  assert.equal(run(`$script='C:\\fixture\\repo\\deploy\\test-server.mjs'; $cfg=[pscustomobject]@{OwnerSid='S-1-5-21-fixture';NodePath='C:\\fixture\\node.exe'}; $script:mock=[pscustomobject]@{ProcessId=101;ExecutablePath=$cfg.NodePath;CommandLine='"C:\\fixture\\node.exe" "C:\\fixture\\repo\\deploy\\test-server.mjs"';ParentProcessId=100}; function Get-TestProcess($ProcessId) { $script:mock }; function Invoke-CimMethod { [pscustomobject]@{ReturnValue=0;Sid='S-1-5-21-fixture'} }; Assert-OwnedProcess 101 $cfg $script 100 | Out-Null; foreach ($case in @('node','script','parent','owner')) { $oldNode=$script:mock.ExecutablePath; $oldCmd=$script:mock.CommandLine; $oldParent=$script:mock.ParentProcessId; if ($case -eq 'node') {$script:mock.ExecutablePath='C:\\foreign\\node.exe'}; if ($case -eq 'script') {$script:mock.CommandLine='node.exe LIVE.mjs'}; if ($case -eq 'parent') {$script:mock.ParentProcessId=999}; if ($case -eq 'owner') {$cfg.OwnerSid='S-1-5-foreign'}; $rejected=$false; try {Assert-OwnedProcess 101 $cfg $script 100 | Out-Null} catch {$rejected=$true}; if (!$rejected) {throw 'foreign adopted'}; $script:mock.ExecutablePath=$oldNode; $script:mock.CommandLine=$oldCmd; $script:mock.ParentProcessId=$oldParent }; 'PASS'`),'PASS');
});
test('pending supervisor waits without another start and bounded timeout selects recovery',()=>{
  assert.equal(run(`$starts=1; foreach ($elapsed in @(0,5,15,59)) { $decision=Get-ReadinessDecision $true $false $elapsed 60; if ($decision -ne 'wait') { $starts++ } }; if ($starts -ne 1) {throw 'duplicate launch'}; if ((Get-ReadinessDecision $true $false 60 60) -ne 'recover') {throw 'unbounded wait'}; if ((Get-ReadinessDecision $false $false 3 60) -ne 'restart') {throw 'dead pending'}; if ((Get-ReadinessDecision $true $true 70 60) -ne 'ready') {throw 'record not adopted'}; 'PASS'`),'PASS');
});
test('readiness recovery stops only a revalidated identical creation and config argument',()=>{
  assert.equal(run(`$script:snapshot=[pscustomobject]@{ProcessId=101;CreationDate=[datetime]'2026-10-04T00:00:00Z';CommandLine='node "C:\\fixture\\private.json"'}; $script:current=$script:snapshot; $script:stops=0; function Assert-OwnedProcess { $script:current }; function Stop-Process { $script:stops++; $script:current=$null }; function Get-TestProcess { $script:current }; Stop-VerifiedTestProcess $script:snapshot @{} 'unused' 'C:\\fixture\\private.json'; if ($script:stops -ne 1) {throw 'owned stop missing'}; $script:current=[pscustomobject]@{ProcessId=101;CreationDate=[datetime]'2026-10-04T01:00:00Z';CommandLine='node "C:\\fixture\\private.json"'}; $rejected=$false; try {Stop-VerifiedTestProcess $script:snapshot @{} 'unused' 'C:\\fixture\\private.json'} catch {$rejected=$_.Exception.Message -eq 'TEST_RECOVERY_PID_REUSED'}; if (!$rejected -or $script:stops -ne 1) {throw 'reused pid stopped'}; $script:current=[pscustomobject]@{ProcessId=101;CreationDate=$script:snapshot.CreationDate;CommandLine='node "C:\\foreign\\private.json"'}; $rejected=$false; try {Stop-VerifiedTestProcess $script:snapshot @{} 'unused' 'C:\\fixture\\private.json'} catch {$rejected=$_.Exception.Message -eq 'TEST_RECOVERY_CONFIG_MISMATCH'}; if (!$rejected -or $script:stops -ne 1) {throw 'foreign config stopped'}; 'PASS'`),'PASS');
});
test('only transport failures are recovery evidence; wrong database health fails closed',()=>{
  assert.equal(run(`$timeout=New-Object Net.WebException('synthetic',[Net.WebExceptionStatus]::Timeout); $protocol=New-Object Net.WebException('synthetic',[Net.WebExceptionStatus]::ProtocolError); if (!(Test-NetworkFailure $timeout) -or (Test-NetworkFailure $protocol) -or (Test-NetworkFailure (New-Object Exception('TEST_NATIVE_HEALTH_IDENTITY_MISMATCH')))) {throw 'unsafe classification'}; function Invoke-RestMethod { [pscustomobject]@{ok=$true;environment='CANONICAL_TEST';purpose='crm-order-draft-only';database='FOREIGN';sourceCommit='fixture';packageId='fixture';port=62404;stockEffect=$false;ledgerEffect=$false} }; $cfg=[pscustomobject]@{ExpectedDatabase='EXPECTED';NativeSourceCommit='fixture';NativePackageId='fixture'}; $rejected=$false; try {Assert-NativeHealth $cfg} catch {$rejected=$_.Exception.Message -eq 'TEST_NATIVE_HEALTH_IDENTITY_MISMATCH'; if (Test-NetworkFailure $_.Exception) {throw 'identity recoverable'}}; if (!$rejected) {throw 'foreign database accepted'}; 'PASS'`),'PASS');
});
test('identity writer creates and atomically replaces valid JSON without leftover temp files',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'crm-identity-fixture-'));
  try {
    const file=path.join(directory,'identity.json').replaceAll("'","''");
    assert.equal(run(`$file='${file}'; Write-TestIdentityAtomic $file @{pid=101;label='first'}; $first=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json; if ($first.pid -ne 101) {throw 'first invalid'}; Write-TestIdentityAtomic $file @{pid=202;label='second'}; $second=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json; if ($second.pid -ne 202 -or $second.label -ne 'second') {throw 'replace invalid'}; if (@(Get-ChildItem -LiteralPath (Split-Path $file) -Filter '*.tmp').Count) {throw 'leftover temp'}; 'PASS'`),'PASS');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'identity.json'),'utf8')).pid,202);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('actual manage CLI retains ConfigPath through library import before any task operation',()=>{
  const manager=path.join(root,'deploy/manage-test-startup.ps1').replaceAll("'","''");
  const body=`$fixturePath='C:\\fixture\\private\\startup.json'; function Get-Content {param($LiteralPath,[switch]$Raw) if ($LiteralPath -eq $fixturePath) {throw 'EXPECTED_CONFIG_PATH'}; throw 'CONFIG_PATH_LOST'}; function Get-ScheduledTask {throw 'UNEXPECTED_TASK_CALL'}; function Register-ScheduledTask {throw 'UNEXPECTED_TASK_WRITE'}; $verified=$false; try {& '${manager}' -Action Install -ConfigPath $fixturePath} catch {$verified=$_.Exception.Message -eq 'EXPECTED_CONFIG_PATH'}; if (!$verified) {throw 'CLI parameter not preserved'}; 'PASS'`;
  assert.equal(execFileSync(ps,['-NoProfile','-NonInteractive','-Command',body],{encoding:'utf8'}).trim(),'PASS');
});
test('Windows canonical account and SID resolve to the same owner, foreign and invalid principals are rejected',()=>{
  assert.equal(run(`$identity=[Security.Principal.WindowsIdentity]::GetCurrent(); $owner=$identity.User.Value; if ((Resolve-TestPrincipalSid $identity.Name) -ne $owner -or (Resolve-TestPrincipalSid $env:USERNAME) -ne $owner -or (Resolve-TestPrincipalSid $owner) -ne $owner) {throw 'account alias rejected'}; if ((Resolve-TestPrincipalSid 'S-1-5-18') -eq $owner) {throw 'foreign owner accepted'}; $rejected=$false; try {Resolve-TestPrincipalSid 'S-1-invalid'} catch {$rejected=$_.Exception.Message -eq 'TEST_TASK_PRINCIPAL_INVALID'}; if (!$rejected) {throw 'invalid principal accepted'}; 'PASS'`),'PASS');
});
