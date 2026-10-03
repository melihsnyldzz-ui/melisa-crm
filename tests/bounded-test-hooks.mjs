import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const record={target:fileURLToPath(new URL('../apps/frontend/',import.meta.url))};
const counts={'account-identity.test.mjs':2,'catalog-ui.test.mjs':1,'existing-stock-recovery.test.mjs':1,'video-pilot.test.mjs':1};
const guarded=new Map(Object.entries(counts).map(([name,count])=>{
 const url=pathToFileURL(path.join(record.target,'tests',name)).href;
 const source=readFileSync(new URL(url),'utf8');
 return [url,{count,sha:createHash('sha256').update(source).digest('hex')}];
}));
const wrapper=new URL('./bounded-test-esbuild.mjs',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return specifier==='esbuild'&&guarded.has(context.parentURL)?{url:wrapper,shortCircuit:true}:next(specifier,context);},
 load(url,context,next){
  const result=next(url,context),guard=guarded.get(url);if(!guard)return result;
  const source=String(result.source);
  if(createHash('sha256').update(source).digest('hex')!==guard.sha||(source.match(/\bbuildSync\(/g)||[]).length!==guard.count)throw Error('FIXTURE_TEST_SOURCE_CHANGED');
  // Assertions/test cases are unchanged; only await the bounded async compiler.
  return {...result,source:source.replace(/\bbuildSync\(/g,'await buildSync(')};
 }
});

