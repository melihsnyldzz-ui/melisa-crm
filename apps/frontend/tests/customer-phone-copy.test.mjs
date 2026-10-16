import '../../../tests/offline-test-guard.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const first={id:'synthetic-a',phone:'+905000000001',phoneStatus:'available'},second={id:'synthetic-b',phone:'+905000000002',phoneStatus:'available'};
let CustomerPhone,directory;
before(async()=>{
 mkdirSync(frontend+'.sites-runtime/',{recursive:true});directory=mkdtempSync(frontend+'.sites-runtime/phone-copy-');
 const file=directory+'/phone.mjs';
 await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/CustomerPhone.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],plugins:[{name:'actual-phone-hooks',setup(build){build.onLoad({filter:/CustomerPhone\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace(/import \{[^}]+\} from "react";/,'const useState=(...a)=>globalThis.__phoneHooks.useState(...a),useEffect=(...a)=>globalThis.__phoneHooks.useEffect(...a),useRef=(...a)=>globalThis.__phoneHooks.useRef(...a);')}));}}]});
 CustomerPhone=(await import(pathToFileURL(file).href)).default;
});
after(()=>{if(directory)rmSync(directory,{recursive:true});});
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function fixture(run){
 const oldHooks=globalThis.__phoneHooks,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const values=[],effects=[],calls=[];let cursor=0,scheduled=[],customer=first,unmounted=false,lateStateWrites=0;
 globalThis.__phoneHooks={
  useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],value=>{if(unmounted)lateStateWrites++;values[index]=typeof value==='function'?value(values[index]):value;}];},
  useRef(initial){const index=cursor++;if(!(index in values))values[index]={current:initial};return values[index];},
  useEffect(effect,deps){const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>value!==old.deps[i]))scheduled.push({index,effect,deps});},
 };
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText(value){const pending=deferred();calls.push({value,...pending});return pending.promise;}}}});
 const render=()=>{cursor=0;scheduled=[];const tree=CustomerPhone({customer});for(const {index,effect,deps}of scheduled){effects[index]?.cleanup?.();effects[index]={deps,cleanup:effect()};}return tree;};
 const feedback=()=>{render();return find(render(),node=>node.props?.role==='status').props.children;};
 const unmount=()=>{unmounted=true;for(const effect of effects)effect?.cleanup?.();};
 try{
  render();await run({calls,feedback,render,copy(){return find(render(),node=>node.type==='button').props.onClick();},switchTo(value){customer=value;render();},unmount,get lateStateWrites(){return lateStateWrites;}});
 }finally{unmount();globalThis.__phoneHooks=oldHooks;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
}
const settle=(call,outcome)=>outcome==='success'?call.resolve():call.reject(Error('Synthetic clipboard rejection'));

for(const outcome of ['success','failure'])for(const [name,next]of [['customer id',{...first,id:'synthetic-b'}],['phone',{...first,phone:second.phone}],['customer and phone',second]])test(`late ${outcome} after ${name} change cannot mark the new customer`,async()=>fixture(async h=>{
 const pending=h.copy();assert.equal(h.calls[0].value,first.phone);h.switchTo(next);assert.equal(h.feedback(),'');settle(h.calls[0],outcome);await pending;assert.equal(h.feedback(),'');
}));
for(const outcome of ['success','failure'])test(`late ${outcome} after A to B to A remains obsolete`,async()=>fixture(async h=>{
 const pending=h.copy();h.switchTo(second);h.switchTo(first);settle(h.calls[0],outcome);await pending;assert.equal(h.feedback(),'');
}));
for(const outcome of ['success','failure'])test(`late ${outcome} from previous customer cannot replace new customer success`,async()=>fixture(async h=>{
 const older=h.copy();h.switchTo(second);const newer=h.copy();assert.deepEqual(h.calls.map(call=>call.value),[first.phone,second.phone]);h.calls[1].resolve();await newer;assert.equal(h.feedback(),'Numara kopyalandı');settle(h.calls[0],outcome);await older;assert.equal(h.feedback(),'Numara kopyalandı');
}));
for(const outcome of ['success','failure'])test(`late ${outcome} after unmount performs no state update`,async()=>fixture(async h=>{
 const pending=h.copy();h.unmount();settle(h.calls[0],outcome);await pending;assert.equal(h.lateStateWrites,0);
}));
for(const newest of ['success','failure'])test(`same customer keeps newest ${newest} when old opposite result arrives later`,async()=>fixture(async h=>{
 const older=h.copy(),newer=h.copy();settle(h.calls[1],newest);await newer;const expected=newest==='success'?'Numara kopyalandı':'Kopyalanamadı. Numarayı seçip kopyalayabilirsiniz.';assert.equal(h.feedback(),expected);settle(h.calls[0],newest==='success'?'failure':'success');await older;assert.equal(h.feedback(),expected);
}));
test('new copy clears previous feedback while waiting and current success/failure still display',async()=>fixture(async h=>{
 const firstCopy=h.copy();h.calls[0].resolve();await firstCopy;assert.equal(h.feedback(),'Numara kopyalandı');const retry=h.copy();assert.equal(h.feedback(),'');h.calls[1].reject(Error('Synthetic clipboard rejection'));await retry;assert.match(h.feedback(),/^Kopyalanamadı/);
}));
test('unresolved phone has no copy action and changing context clears existing feedback',async()=>fixture(async h=>{
 const pending=h.copy();h.calls[0].resolve();await pending;assert.equal(h.feedback(),'Numara kopyalandı');h.switchTo({id:'synthetic-lid',phone:'',phoneStatus:'unresolved'});assert.equal(find(h.render(),node=>node.type==='button'),null);assert.equal(h.feedback(),'');assert.equal(h.calls.length,1);
}));
for(const outcome of ['success','failure'])test(`old ${outcome} cannot mark a newer copy that is still pending`,async()=>fixture(async h=>{
 const older=h.copy(),newer=h.copy();settle(h.calls[0],outcome);await older;assert.equal(h.feedback(),'');h.calls[1].resolve();await newer;assert.equal(h.feedback(),'Numara kopyalandı');
}));
