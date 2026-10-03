$ErrorActionPreference='Stop';Set-StrictMode -Version 2
$root=$PSScriptRoot
$parent=Get-Content -LiteralPath (Join-Path $root 'REV1_PARENT_MANIFEST.json') -Raw|ConvertFrom-Json
$paths=New-Object 'Collections.Generic.HashSet[string]'
foreach($file in $parent.files){if($file.path -notin @('ORCHESTRATOR_MANIFEST.json','INDEPENDENT_REVIEW.json')){$null=$paths.Add([string]$file.path)}}
foreach($file in Get-ChildItem -LiteralPath $root -File){
 if($file.Extension -in @('.ps1','.mjs','.json','.md','.txt','.cmd') -and $file.Name -notin @('ORCHESTRATOR_MANIFEST.json','INDEPENDENT_REVIEW.json','ZIP_RECEIPT.json','ABORTED_RUN_PRESERVED_PROOF.json')){
  $null=$paths.Add($file.Name)
 }
}
$dirs=@('root-cause-evidence','full-preflight-evidence','compile-evidence','dependency-evidence','wrapper-preflight-evidence','regression-evidence')
$latest=Get-ChildItem -LiteralPath $root -Directory|Where-Object {$_.Name -match '^validation-\d{8}T\d{9}Z$'}|Sort-Object Name|Select-Object -Last 1
if($latest){$dirs+=@($latest.Name)}
foreach($dir in $dirs){
 $base=Join-Path $root $dir
 if(Test-Path -LiteralPath $base){foreach($file in Get-ChildItem -LiteralPath $base -File -Recurse){$null=$paths.Add($file.FullName.Substring($root.Length+1).Replace('\','/'))}}
}
$files=@($paths|Sort-Object|ForEach-Object {
 if($_ -match '(^|/)\.\.?($|/)|(^|/)\.env(?:\.|$)|(^|/)\.npmrc$|(^|/)node_modules/|(^|/)public-dev-registry-cache/'){throw 'NONSECRET_CODE_PACKAGE_REQUIRED'}
 $path=[IO.Path]::GetFullPath((Join-Path $root $_))
 if(-not $path.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'PATH_OUTSIDE_DEV_ROOT'}
 $item=Get-Item -LiteralPath $path
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_REJECTED'}
 [ordered]@{path=$_;bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}
})
$manifest=[ordered]@{version='crm-unified-orchestrator-rev2';status='BLOCKED_READY_NOT_APPLIED';
 createdAt=[DateTime]::UtcNow.ToString('o');files=$files;
 dependencyMaterialization='exact lock files + DEPENDENCY_MANIFEST; local node_modules not in code ZIP';
 fullPreflight='FAIL_FRONTEND_225_OF_230_ACCESS_DENIED';compiledAssets='NOT_VERIFIED';
 productionRuntimeActions=0;authPost=$false;sqlExecuted=$false;providerCalls=0;
 previousLockPreserved=$true;applicationPayloadChanged=$false;applicationTargets=24}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $root 'ORCHESTRATOR_MANIFEST.json') -Encoding UTF8
$sha=(Get-FileHash -LiteralPath (Join-Path $root 'ORCHESTRATOR_MANIFEST.json')).Hash.ToLowerInvariant()
[ordered]@{status='BLOCKED_READY';manifestSha256=$sha;codeReview='INDEPENDENT_NARROW_REVIEW_CLOSURES_REPORTED';
 actualFullPreflight='FAIL';liveApplied=$false;ready=$false;remaining='native esbuild/Vite Access denied, full asset proof, preserved-lock reconciliation'}|
 ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'INDEPENDENT_REVIEW.json') -Encoding UTF8
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zipPath=Join-Path (Split-Path $root -Parent) 'melisa-crm-unified-REV2-BLOCKED_READY-NOT_APPLIED-20261002.zip'
if(Test-Path -LiteralPath $zipPath){throw 'NEW_PACKAGE_NAME_REQUIRED_NO_OVERWRITE'}
$archive=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($file in $files){$source=Join-Path $root $file.path;if((Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant() -cne $file.sha256){throw 'PACKAGE_SOURCE_CHANGED'};$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$source,$file.path,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('ORCHESTRATOR_MANIFEST.json','INDEPENDENT_REVIEW.json')){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $root $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
}finally{$archive.Dispose()}
$receipt=[ordered]@{status='BLOCKED_READY_NOT_APPLIED';filename=Split-Path $zipPath -Leaf;
 bytes=(Get-Item -LiteralPath $zipPath).Length;sha256=(Get-FileHash -LiteralPath $zipPath).Hash.ToLowerInvariant();
 manifestSha256=$sha;entries=($files.Count+2);dependencyManifestSha256=(Get-FileHash -LiteralPath (Join-Path $root 'DEPENDENCY_MANIFEST.json')).Hash.ToLowerInvariant();
 ready=$false;liveApplied=$false;productionRuntimeActions=0}
$receipt|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'ZIP_RECEIPT.json') -Encoding UTF8
$receipt|ConvertTo-Json
