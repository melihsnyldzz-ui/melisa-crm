// Fixture compilation only: resolve known source/dependencies inside the staged
// project instead of asking esbuild to enumerate inaccessible ancestor folders.
import {createRequire,builtinModules} from 'node:module';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const record={target:fileURLToPath(new URL('../apps/frontend/',import.meta.url))};
const root=realpathSync(record.target),require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild'),builtins=new Set(builtinModules.map(p=>p.replace(/^node:/,'')));
const within=p=>p===root||p.startsWith(root+path.sep);
export async function buildSync(options) {
 if(options.platform!=='node'||options.plugins||!Array.isArray(options.entryPoints))throw Error('KNOWN_SSR_FIXTURE_ONLY');
 return build({...options,absWorkingDir:root,tsconfigRaw:{},plugins:[{name:'bounded-dev-fixture-resolution',setup(builder){
  builder.onResolve({filter:/.*/},args=>{
   if(builtins.has(args.path.replace(/^node:/,'')))return {path:args.path,external:true};
   if((options.external||[]).some(p=>args.path===p||args.path.startsWith(p+'/')))return {path:args.path,external:true};
   let p;
   if(args.kind==='entry-point')p=path.resolve(root,args.path);
   else if(path.isAbsolute(args.path))p=args.path;
   else if(args.path.startsWith('.'))p=path.resolve(args.resolveDir,args.path);
   else p=require.resolve(args.path,{paths:[path.join(root,'node_modules')]});
   p=realpathSync(require.resolve(p));if(!within(p))throw Error('FIXTURE_PATH_OUTSIDE_DEV_PROJECT');
   return {path:p};
  });
 }}]});
}

