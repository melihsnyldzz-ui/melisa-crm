param([Parameter(Mandatory=$true)][ValidateSet('PS5','PS7')][string]$Platform)
$ErrorActionPreference='Stop'
$packageRoot=$PSScriptRoot
function Sha([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
if(($Platform -eq 'PS5' -and $PSVersionTable.PSVersion.Major -ne 5) -or ($Platform -eq 'PS7' -and $PSVersionTable.PSVersion.Major -ne 7)){throw 'EXACT_VALIDATION_PLATFORM_REQUIRED'}
$manifestPath=Join-Path $packageRoot 'FIRST_PAGE_CANDIDATE_MANIFEST.json';$manifestSha=Sha $manifestPath
if($manifestSha -cne '0b19eabb9f6ab73c741fe11d4b78c6e788527b6e93e919299d320762c24037f1'){throw 'VALIDATION_MANIFEST_MISMATCH'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
$candidate=Get-Content -LiteralPath (Join-Path $packageRoot 'ROLE_SEPARATED_CANDIDATE.json') -Raw|ConvertFrom-Json
$scripts=@(@{file='deploy-first-photo-page.role-separated.candidate.ps1';sha=$candidate.scriptSha256},@{file='operator-admin-launch-control.candidate.ps1';sha=$candidate.controlSha256},@{file='operator-normal-launch-worker.candidate.ps1';sha=$candidate.workerSha256})
foreach($script in $scripts){if((Sha (Join-Path $packageRoot $script.file)) -cne $script.sha){throw 'VALIDATION_LAUNCHER_HASH_MISMATCH'};$tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $packageRoot $script.file),[ref]$tokens,[ref]$errors);if(@($errors).Count){throw 'VALIDATION_LAUNCHER_PARSE_FAILED'}}
foreach($file in $manifest.files){
  $path=Join-Path (Join-Path $packageRoot 'candidate') $file.path;if((Sha $path) -cne $file.candidateSha256){throw 'VALIDATION_APPLICATION_HASH_MISMATCH'}
  if($file.baseSha256 -and (Sha (Join-Path (Join-Path $packageRoot 'fixture-base') $file.path)) -cne $file.baseSha256){throw 'VALIDATION_FIXTURE_BASE_HASH_MISMATCH'}
  & 'C:\Program Files\nodejs\node.exe' --check $path;if($LASTEXITCODE -ne 0){throw 'VALIDATION_APPLICATION_SYNTAX_FAILED'}
}
if((Sha (Join-Path $packageRoot 'crmExistingStockReadWorker.mjs')) -cne ($manifest.files|Where-Object {$_.path -ceq 'api/src/workers/crmExistingStockReadWorker.mjs'}).candidateSha256){throw 'TESTED_WORKER_BYTES_DIFFER'}
$run=Join-Path $packageRoot ('dev-validation-'+$Platform+'-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'));New-Item -ItemType Directory -Path $run|Out-Null
$groups=@(@{file='roleSeparatedLaunchFixture.test.ps1';count=34},@{file='roleSeparatedControllerFlowFixture.test.ps1';count=14},@{file='roleSeparatedFaultFixture.test.ps1';count=11})
$results=@();$failure=$false
foreach($group in $groups){
  $file=Join-Path $packageRoot $group.file;$started=[DateTime]::UtcNow
  try{$output=(& $file 6>$null|Out-String);$count=([regex]::Matches($output,'(?m)^PASS ')).Count;$passed=($count -eq $group.count)}catch{$output='FIXTURE_EXECUTION_FAILED';$count=0;$passed=$false}
  $outputPath=Join-Path $run ($group.file+'.output.txt');$output|Set-Content -LiteralPath $outputPath -Encoding UTF8
  $results+=@{file=$group.file;sha256=Sha $file;expectedCount=$group.count;passedCount=$count;passed=$passed;outputSha256=Sha $outputPath;startedAt=$started.ToString('o');finishedAt=[DateTime]::UtcNow.ToString('o')}
  if(-not $passed){$failure=$true};Write-Output ($group.file+': '+$count+'/'+$group.count+' '+$(if($passed){'PASS'}else{'FAIL'}))
}
$nodeFiles=@('crmExistingStockReadWorker.test.mjs','runExistingStockWorker.test.mjs','firstPageAdapter.test.mjs','catalogReadBudgetCandidate.test.mjs')
$nodePaths=@($nodeFiles|ForEach-Object {Join-Path $packageRoot $_})
$nodeOutput=(& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=tap @nodePaths 2>&1|Out-String);$nodeExit=$LASTEXITCODE
$nodePassed=($nodeExit -eq 0 -and $nodeOutput -match '(?m)^# tests 38\s*$' -and $nodeOutput -match '(?m)^# pass 38\s*$' -and $nodeOutput -match '(?m)^# fail 0\s*$')
$nodeOutputPath=Join-Path $run 'source-node-tests.output.txt';$nodeOutput|Set-Content -LiteralPath $nodeOutputPath -Encoding UTF8;if(-not $nodePassed){$failure=$true}
$receipt=[ordered]@{status=$(if($failure){'FAIL'}else{'PASS'});observedAt=[DateTime]::UtcNow.ToString('o');platform=$Platform;psVersion=$PSVersionTable.PSVersion.ToString();sourceManifestSha256=$manifestSha;launcherScripts=$scripts;launcherParseErrorCount=0;applicationCandidateCount=24;applicationSyntaxPassed=24;fixtureGroups=$results;sourceTests=@{passed=$nodePassed;testsPassed=$(if($nodePassed){38}else{0});exitCode=$nodeExit;testFiles=@($nodeFiles|ForEach-Object {@{file=$_;sha256=Sha (Join-Path $packageRoot $_)}});outputSha256=Sha $nodeOutputPath};productionFilesWritten=$false;productionProcessControlPerformed=$false;productionServiceControlPerformed=$false;productionDeployPerformed=$false;networkRequestPerformed=$false;sqlExecuted=$false;authPostPerformed=$false;credentialsRead=$false;realProtectedAcceptance='NOT_RUN';realPdfSend='NOT_RUN'}
$receiptPath=Join-Path $run 'VALIDATION_RESULT.json';$receipt|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output ('RECEIPT '+$receiptPath);Write-Output ('SHA256 '+(Sha $receiptPath));Write-Output ('STATUS '+$receipt.status)
if($failure){exit 1}
