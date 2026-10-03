import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const trees=[];
for(const relative of ['deployment-dependency/gateway/src','deployment-dependency/frontend/src','deployment-dependency/frontend/tests','deployment-dependency/controlled-install/candidate']){
 const base=path.join(root,relative),files=[];
 async function visit(dir){
  for(const e of await readdir(dir,{withFileTypes:true})){
   if(e.isSymbolicLink()||e.name==='node_modules'||/^\.env(?:\.|$)|^\.npmrc$/i.test(e.name))throw Error('SOURCE_TREE_UNEXPECTED_PATH');
   const p=path.join(dir,e.name);
   if(e.isDirectory())await visit(p);
   else if(e.isFile())files.push({path:path.relative(base,p).split(path.sep).join('/'),sha256:sha(await readFile(p))});
  }
 }
 await visit(base);files.sort((a,b)=>a.path.localeCompare(b.path,'en'));trees.push({path:relative,files});
}
await writeFile(path.join(root,'SOURCE_TREE_MANIFEST.json'),JSON.stringify({version:'fixed-dev-source-trees-v1',trees},null,2),{flag:'wx'});
console.log(JSON.stringify({trees:trees.map(t=>({path:t.path,files:t.files.length}))}));
