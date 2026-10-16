import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {nativeOrderPayload} from '../src/lib/nativeOrder.js';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const line={productId:1,stockCode:'SYNTHETIC',priceId:1,unitSourceId:1,currency:'USD',priceExact:'1.00000000',priceSourceKey:'synthetic'};
const conversation={id:'55',phone:'9050000000000',name:'Synthetic'};
const customer={id:1,revision:'a'.repeat(64),blocked:false};
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}

async function fixture(run){
 mkdirSync(frontend+'.sites-runtime/',{recursive:true});
 const directory=mkdtempSync(frontend+'.sites-runtime/rate-dialog-'),file=directory+'/dialog.mjs';
 const before={window:globalThis.window,hooks:globalThis.__rateHooks},values=[];let cursor=0;
 const data=new Map();globalThis.window={sessionStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
 globalThis.__rateHooks={useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useEffect(){}};
 try{
  await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/ERPOrderDialog.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],plugins:[{name:'offline-rate-dialog',setup(build){build.onLoad({filter:/ERPOrderDialog\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace("import {useEffect,useRef,useState} from 'react';","const {useEffect,useRef,useState}=globalThis.__rateHooks;")}));build.onLoad({filter:/liveApi\.js$/},()=>({loader:'js',contents:"export const liveApi={erpLogin:async()=>({user:{id:7},accessToken:'synthetic'}),erpV2Customers:async()=>({phone:'9050000000000',entries:[],status:'missing'}),erpV2Draft:()=>{throw Error('Unexpected write');},erpV2DraftDetail:()=>{throw Error('Unexpected read');}};"}));}}]});
  const Dialog=(await import(pathToFileURL(file).href)).default;
  const render=()=>{cursor=0;return Dialog({token:'synthetic',actorKey:'id:rate-test',conversation,items:[line],isCurrent:()=>true,onClose(){},onSaved(){}});};
  const form=find(render(),node=>node.type==='form');
  // Login and catalog are entirely synthetic; every unexpected read/write throws.
  await form.props.onSubmit({preventDefault(){}});
  for(let i=0;i<10;i++)await Promise.resolve();
  const input=()=>find(render(),node=>node.type==='input'&&node.props.inputMode==='decimal');
  assert(input(),'real dialog rate field is rendered after synthetic login');
  await run({input,blur(value){input().props.onChange({target:{value}});input().props.onBlur();return input().props.value;},payload(rate){return nativeOrderPayload('00000000-0000-4000-8000-000000000001',conversation,customer,{basis:'exact-phone'},[line],[1],rate);}});
  assert.equal(data.size,0,'rate editing must not freeze or submit any order');
 }finally{globalThis.window=before.window;globalThis.__rateHooks=before.hooks;rmSync(file,{force:true});rmSync(directory,{recursive:true});}
}

for(const value of ['999999999999.12345678','123456789012.87654321','1.12345678','0.00000001'])test(`actual rate blur preserves exact8 ${value}`,async()=>fixture(h=>{
 const shown=h.blur(value);assert.equal(shown,value);assert.equal(h.payload(shown).exchangeRateExact8,value);
}));
for(const [value,expected]of [['1','1.00000000'],['12.34','12.34000000'],[' 2.5 ','2.50000000'],['0002.50','2.50000000'],['1.','1.00000000']])test(`actual rate blur pads decimal ${JSON.stringify(value)}`,async()=>fixture(h=>{
 const shown=h.blur(value);assert.equal(shown,expected);assert.equal(h.payload(shown).exchangeRateExact8,expected);
}));
for(const value of ['1.123456789','1e2','0','-1','','Infinity','1000000000000'])test(`actual rate blur leaves invalid input ${JSON.stringify(value)} for existing validation`,async()=>fixture(h=>{
 const shown=h.blur(value);assert.equal(shown,value);assert.throws(()=>h.payload(shown),/Müşteri, konuşma, kur veya ürün seçimi geçerli değil/);
}));
