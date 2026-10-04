import './offline-test-guard.mjs';
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const script=path.join(root,'deploy/switch-test-package.ps1').replaceAll("'","''");
const test=(name,body)=>nodeTest(name,{skip:process.platform!=='win32'?'Package switch contracts run in the Windows CI job':false},body);
const run=body=>execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`. '${script}' -Library; ${body}`],{encoding:'utf8'}).trim();

test('switch library import is inert and missing arguments do not reach process operations',()=>{
  assert.equal(run(`function Get-ScheduledTask {throw 'unexpected task access'}; 'PASS'`),'PASS');
  const result=execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`$rejected=$false; function Get-ScheduledTask {throw 'unexpected task access'}; try {& '${script}'} catch {$rejected=$_.Exception.Message -eq 'TEST_PACKAGE_SWITCH_ARGUMENTS_REQUIRED'}; if (!$rejected) {throw 'unvalidated invocation'}; 'PASS'`],{encoding:'utf8'}).trim();
  assert.equal(result,'PASS');
});
test('switch task identity preserves canonical source action and rejects a foreign action before stop',()=>{
  assert.equal(run(`$cfg=[pscustomobject]@{RepoRoot='C:\\fixture\\repo';OwnerSid='fixture-owner';TaskName='Melisa-CRM-TEST-Fixture';PackageRoot='C:\\fixture\\release'}; $file='C:\\fixture\\runtime\\startup.json'; $shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'; $script:task=[pscustomobject]@{Principal=[pscustomobject]@{UserId='fixture-owner'};Actions=@([pscustomobject]@{Execute=$shell;Arguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "C:\\fixture\\repo\\deploy\\test-session-launcher.ps1" -ConfigPath "C:\\fixture\\runtime\\startup.json"';WorkingDirectory=$cfg.RepoRoot})}; function Get-ScheduledTask {$script:task}; function Resolve-TestPrincipalSid($UserId) {$UserId}; Get-SwitchTask $cfg $file | Out-Null; $script:task.Actions[0].WorkingDirectory=$cfg.PackageRoot; $bad=$false; try {Get-SwitchTask $cfg $file | Out-Null} catch {$bad=$_.Exception.Message -eq 'TEST_SWITCH_TASK_IDENTITY_MISMATCH'}; if (!$bad) {throw 'package replaced canonical task'}; 'PASS'`),'PASS');
});
test('switch launcher stop requires owner, canonical script, exact config and creation snapshot',()=>{
  assert.equal(run(`$cfg=[pscustomobject]@{RepoRoot='C:\\fixture\\repo';OwnerSid='fixture-owner'}; $file='C:\\fixture\\runtime\\startup.json'; $script:p=[pscustomobject]@{ExecutablePath=(Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe');CommandLine='powershell.exe -File "C:\\fixture\\repo\\deploy\\test-session-launcher.ps1" -ConfigPath "C:\\fixture\\runtime\\startup.json"'}; function Invoke-CimMethod {[pscustomobject]@{ReturnValue=0;Sid='fixture-owner'}}; Assert-SwitchLauncher $script:p $cfg $file; foreach ($case in @('config','script','owner','executable')) {$copy=$script:p.PSObject.Copy();$oldOwner=$cfg.OwnerSid; if ($case -eq 'config') {$copy.CommandLine=$copy.CommandLine.Replace('startup.json','foreign.json')}; if ($case -eq 'script') {$copy.CommandLine=$copy.CommandLine.Replace('test-session-launcher.ps1','LIVE.ps1')}; if ($case -eq 'owner') {$cfg.OwnerSid='foreign'}; if ($case -eq 'executable') {$copy.ExecutablePath='C:\\foreign\\powershell.exe'}; $bad=$false; try {Assert-SwitchLauncher $copy $cfg $file} catch {$bad=$_.Exception.Message -eq 'TEST_SWITCH_LAUNCHER_IDENTITY_MISMATCH'}; $cfg.OwnerSid=$oldOwner; if (!$bad) {throw 'foreign launcher accepted'}}; 'PASS'`),'PASS');
});
test('package switch refuses native ERP PID reuse without stopping or restarting native',()=>{
  assert.equal(run(`$saved=[pscustomobject]@{ProcessId=10;CreationDate=[datetime]'2026-10-04T00:00:00Z'}; $script:native=$saved; function Get-SwitchNative {$script:native}; function Stop-Process {throw 'unexpected stop'}; function Start-Process {throw 'unexpected start'}; Assert-SwitchNativeUnchanged @{} $saved; $script:native=[pscustomobject]@{ProcessId=10;CreationDate=[datetime]'2026-10-04T01:00:00Z'}; $bad=$false; try {Assert-SwitchNativeUnchanged @{} $saved} catch {$bad=$_.Exception.Message -eq 'TEST_SWITCH_NATIVE_CHANGED'}; if (!$bad) {throw 'reused native accepted'}; 'PASS'`),'PASS');
});
test('actual CLI preserves config and package arguments through the library import',()=>{
  const output=execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`function Get-Content {param($LiteralPath,[switch]$Raw) if ($LiteralPath -eq 'C:\\fixture\\runtime\\startup.json') {throw 'EXPECTED_CONFIG_READ'}; throw 'CLI_CONFIG_LOST'}; function Get-ScheduledTask {throw 'TASK_BEFORE_CONFIG'}; $bad=$false; try {& '${script}' -ConfigPath 'C:\\fixture\\runtime\\startup.json' -PackageRoot 'C:\\fixture\\release' -PackageManifestSha256 ('a'*64)} catch {$bad=$_.Exception.Message -eq 'EXPECTED_CONFIG_READ'}; if (!$bad) {throw 'CLI was inert or config was lost'}; 'PASS'`],{encoding:'utf8'}).trim();
  assert.equal(output,'PASS');
});
test('asynchronous task start ignores the previous Ready result and waits for the current owned chain',()=>{
  assert.equal(run(`$script:attempt=0; function Assert-SwitchNativeUnchanged {}; function Get-SwitchTask {$script:attempt++; [pscustomobject]@{State=$(if($script:attempt -eq 1){'Ready'}else{'Running'})}}; function Get-ScheduledTaskInfo {throw 'old result consulted'}; function Read-SupervisorIdentity {@{Supervisor=[pscustomobject]@{ProcessId=100};Children=@{'test-server.mjs'=[pscustomobject]@{ProcessId=101};'test-erp-catalog.mjs'=[pscustomobject]@{ProcessId=102};'test-erp-orders.mjs'=[pscustomobject]@{ProcessId=103}}}}; function Get-TestListeners {foreach($port in @(62400,62401,62402,62403,62404)){[pscustomobject]@{LocalPort=$port;LocalAddress='127.0.0.1';OwningProcess=$(switch($port){62400 {101} 62401 {101} 62402 {102} 62403 {103} 62404 {10}})}}}; function Get-SwitchLaunchers {[pscustomobject]@{ProcessId=99}}; function Start-Sleep {}; $ready=Wait-SwitchReady @{} 'unused' ([pscustomobject]@{ProcessId=10}) 20; if($ready.Supervisor.ProcessId -ne 100 -or $script:attempt -ne 2){throw 'wrong readiness'}; 'PASS'`),'PASS');
});
test('failed new package readiness restores previous config without changing policy or native state',()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'melisa-crm-test-switch-'));
  try{
    const config=path.join(fixture,'startup.json'),policy=path.join(fixture,'ai-sales-rules.json');
    const previous={RepoRoot:path.join(fixture,'repo'),RuntimeDir:fixture,TaskName:'Melisa-CRM-TEST-Fixture'};
    fs.writeFileSync(config,JSON.stringify(previous));fs.writeFileSync(policy,'preserved-policy-fixture');
    const psConfig=config.replaceAll("'","''"),target=path.join(fixture,'package-B').replaceAll("'","''");
    const output=run(`$script:events=@(); function Read-TestConfig($File) {if($File -eq '${psConfig}' -and $script:events.Count){throw 'TEST_PACKAGE_VERIFICATION_FAILED'}; Get-Content -LiteralPath $File -Raw | ConvertFrom-Json}; function Get-SwitchTask {[pscustomobject]@{TaskName='fixture'}}; function Get-SwitchNative {[pscustomobject]@{ProcessId=10;CreationDate=[datetime]'2026-10-04T00:00:00Z'}}; function Stop-SwitchCrm($Config,$ConfigFile,$History,$Phase) {$script:events+=('stop-'+$Phase)}; function Start-ScheduledTask {$script:events+='start'}; function Wait-SwitchReady($Config,$ConfigFile,$Native,$Seconds) {if ($Config.PSObject.Properties['PackageRoot']) {throw 'FIXTURE_TARGET_NOT_READY'}; [pscustomobject]@{Supervisor=[pscustomobject]@{ProcessId=20}}}; $failed=$false; try {Invoke-TestPackageSwitch '${psConfig}' '${target}' ('a'*64) 20 | Out-Null} catch {$failed=$_.Exception.Message -eq 'FIXTURE_TARGET_NOT_READY'; if (!$failed) {throw ('ACTUAL_RECOVERY_ERROR: '+$_.Exception.Message)}}; if (!$failed) {throw 'original failure lost'}; if (($script:events -join ',') -ne 'stop-previous,start,stop-failed-target,start') {throw 'recovery order wrong'}; 'PASS'`);
    assert.equal(output,'PASS');assert.deepEqual(JSON.parse(fs.readFileSync(config,'utf8')),previous);assert.equal(fs.readFileSync(policy,'utf8'),'preserved-policy-fixture');
    const history=path.join(fixture,'package-switches');const entries=fs.readdirSync(history);assert.equal(entries.length,1);
    const proof=JSON.parse(fs.readFileSync(path.join(history,entries[0],'recovery.json'),'utf8'));assert.equal(proof.status,'PREVIOUS_RESTORED');assert.equal(proof.nativePid,10);
    const failure=JSON.parse(fs.readFileSync(path.join(history,entries[0],'failure.json'),'utf8'));assert.equal(failure.code,'FIXTURE_TARGET_NOT_READY');
  }catch(error){
    const history=path.join(fixture,'package-switches');
    if(fs.existsSync(history))for(const entry of fs.readdirSync(history)){
      const file=path.join(history,entry,'failure.json');if(fs.existsSync(file))throw Error(`Fixture failure metadata: ${fs.readFileSync(file,'utf8')}`,{cause:error});
    }
    throw error;
  }finally{
    assert.equal(path.dirname(path.resolve(fixture)),path.resolve(os.tmpdir()));assert.match(path.basename(fixture),/^melisa-crm-test-switch-/);fs.rmSync(fixture,{recursive:true,force:true});
  }
});
