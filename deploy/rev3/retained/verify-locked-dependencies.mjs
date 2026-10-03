import {readFile,lstat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function paths(base,dir,out=[]){
 if((await lstat(dir)).isSymbolicLink())throw Error('DEPENDENCY_REPARSE_REJECTED');
 for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.isSymbolicLink()||/^\.env(?:\.|$)|^\.npmrc$|^credentials(?:\.|$)/i.test(e.name))throw Error('UNEXPECTED_SECRET_OR_REPARSE_BEFORE_READ');
  const p=path.join(dir,e.name);if(e.isDirectory())await paths(base,p,out);
  else if(e.isFile())out.push(path.relative(base,p).split(path.sep).join('/'));
 }return out.sort();
}
async function rejectShadowDirectories(base,dir=base){
 for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.isSymbolicLink())throw Error('PROJECT_REPARSE_REJECTED');
  const p=path.join(dir,e.name);
  if(e.isDirectory()){
   if(e.name==='node_modules'){if(p!==path.join(base,'node_modules'))throw Error('NEAREST_RESOLVER_SHADOW_REJECTED')}
   else await rejectShadowDirectories(base,p);
  }
 }
}
export async function verifyLockedDependencies(root){
 const manifest=JSON.parse(await readFile(path.join(root,'DEPENDENCY_MANIFEST.json'),'utf8'));
 if(manifest.version!=='locked-dev-dependencies-v1'||manifest.registry!=='https://registry.npmjs.org'||manifest.lifecycleScriptsExecuted)throw Error('LOCKED_DEPENDENCY_MANIFEST_REQUIRED');
 if(manifest.projects.length!==2||new Set(manifest.projects.map(p=>p.name)).size!==2)throw Error('EXACT_TWO_DEV_PROJECTS_REQUIRED');
 const source=JSON.parse(await readFile(path.join(root,'SOURCE_TREE_MANIFEST.json'),'utf8'));
 if(source.version!=='fixed-dev-source-trees-v1')throw Error('SOURCE_TREE_MANIFEST_REQUIRED');
 const callers=[];
 for(const tree of source.trees){
  const base=path.resolve(root,tree.path);
  if(!base.startsWith(path.join(root,'deployment-dependency')+path.sep))throw Error('FIXED_SOURCE_TREE_REQUIRED');
  const actual=await paths(base,base),expected=tree.files.map(f=>f.path).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('SOURCE_TREE_EXTRA_OR_MISSING_FILE');
  for(const file of tree.files){
   if(sha(await readFile(path.join(base,file.path)))!==file.sha256)throw Error('SOURCE_TREE_FILE_DRIFT');
   if(/\.(?:js|jsx|mjs)$/.test(file.path))callers.push(path.join(base,file.path));
  }
 }
 for(const project of manifest.projects){
  if(!['gateway','frontend'].includes(project.name))throw Error('FIXED_DEV_PROJECT_REQUIRED');
  const base=path.join(root,'deployment-dependency',project.name);
  await rejectShadowDirectories(base);
  const actual=await paths(base,path.join(base,'node_modules'));
  const expected=project.files.map(f=>f.path).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected)||actual.length!==project.fileCount)throw Error('DEPENDENCY_EXTRA_OR_MISSING_FILE');
  for(const [file,wanted]of [['package.json',project.packageSha256],['package-lock.json',project.lockSha256]]){
   if(sha(await readFile(path.join(base,file)))!==wanted)throw Error('PACKAGE_OR_LOCK_DRIFT');
  }
  for(const file of project.files){
   if(!file.path.startsWith('node_modules/')||/(^|\/)\.\.?($|\/)|(^|\/)\.env(?:\.|$)|(^|\/)\.npmrc$|\\|:/.test(file.path))throw Error('FIXED_NONSECRET_DEPENDENCY_PATH_REQUIRED');
   const resolved=path.resolve(base,file.path);
   if(!resolved.startsWith(base+path.sep))throw Error('DEPENDENCY_OUTSIDE_PROJECT');
   const bytes=await readFile(resolved);
   if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('DEPENDENCY_FILE_DRIFT');
  }
  if(sha(project.files.map(f=>f.path+':'+f.bytes+':'+f.sha256+'\n').join(''))!==project.aggregateSha256)throw Error('DEPENDENCY_AGGREGATE_DRIFT');
  const approved=new Set(project.files.map(f=>path.join(base,f.path)));
  for(const caller of callers.filter(p=>p.startsWith(base+path.sep))){
   const require=createRequire(caller);
   for(const module of project.resolvedModules){
    const resolved=require.resolve(module.module);
    if(!approved.has(resolved))throw Error('ACTUAL_CALLER_MODULE_OUTSIDE_MANIFEST');
   }
  }
 }
 return manifest.projects.map(p=>({name:p.name,fileCount:p.fileCount,aggregateSha256:p.aggregateSha256}));
}
