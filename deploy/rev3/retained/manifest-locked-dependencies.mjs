// Public DEV dependency material only. No existing user cache/config is read.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function inventory(base,dir,out=[]){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('DEPENDENCY_REPARSE_REJECTED');
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())await inventory(base,file,out);
  else if(entry.isFile()){
   if(/^\.env(?:\.|$)|^\.npmrc$|^credentials(?:\.|$)/i.test(entry.name))throw Error('SECRET_FILE_NAME_REJECTED_BEFORE_READ');
   const bytes=await readFile(file);
   out.push({path:path.relative(base,file).split(path.sep).join('/'),bytes:bytes.length,sha256:sha(bytes)});
  }
 }return out.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
const projects=[];
for(const name of ['gateway','frontend']){
 const base=path.join(root,'deployment-dependency',name);
 const packageBytes=await readFile(path.join(base,'package.json'));
 const lockBytes=await readFile(path.join(base,'package-lock.json'));
 const lock=JSON.parse(lockBytes);
 for(const [key,pkg]of Object.entries(lock.packages)){
  if(!key)continue;
  if(new URL(pkg.resolved).origin!=='https://registry.npmjs.org'||!pkg.integrity)throw Error('LOCKED_OFFICIAL_REGISTRY_AND_INTEGRITY_REQUIRED');
 }
 const require=createRequire(path.join(base,'package.json'));
 const modules=(name==='gateway'?['express','dotenv','libphonenumber-js']:['esbuild','vite','react','react-dom/server']).map(module=>{
  const resolved=require.resolve(module);
  if(!resolved.startsWith(path.join(base,'node_modules')+path.sep))throw Error('ORIGINAL_LOCATION_FALLBACK_REJECTED');
  return {module,path:path.relative(base,resolved).split(path.sep).join('/')};
 });
 const files=await inventory(base,path.join(base,'node_modules'));
 const aggregateSha256=sha(files.map(f=>f.path+':'+f.bytes+':'+f.sha256+'\n').join(''));
 projects.push({name,packageSha256:sha(packageBytes),lockSha256:sha(lockBytes),lockfileVersion:lock.lockfileVersion,
  resolvedModules:modules,fileCount:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0),aggregateSha256,files});
}
const manifest={version:'locked-dev-dependencies-v1',status:'PUBLIC_DEPENDENCIES_MATERIALIZED_NOT_RUNTIME_READY',
 createdAt:new Date().toISOString(),node:'24.15.0',npm:'11.12.0',platform:'win32-x64',
 registry:'https://registry.npmjs.org',lifecycleScriptsExecuted:false,userCredentialConfigurationRead:false,
 existingUserCacheUsed:false,projectRelativeRoot:'deployment-dependency',projects};
await writeFile(path.join(root,'DEPENDENCY_MANIFEST.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify({projects:projects.map(({name,fileCount,bytes,aggregateSha256})=>({name,fileCount,bytes,aggregateSha256})),manifestSha256:sha(JSON.stringify(manifest,null,2))}));
