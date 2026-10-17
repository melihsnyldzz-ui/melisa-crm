import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {transformSync} from 'esbuild';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const success=data=>Response.json({success:true,data});
const denied=status=>Response.json({success:false,error:{code:'SYNTHETIC_DENIAL'}},{status});
const grant=()=>({sessionId:'synthetic-staff-session',capability:'s'.repeat(43),expiresAt:new Date(Date.now()+60000).toISOString()});
const record=label=>({id:`synthetic-${label}`,status:'interest',submittedAt:'2026-10-15T06:25:00Z',modelCount:1,quantityTotal:2,items:[{id:'erp-1',productId:'erp-1',stockCode:`SYNTHETIC-${label}`,productName:`Synthetic ${label}`,quantity:2,photoPath:'/api/live/customer-product-requests/products/erp-1/photo'}]});
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
const requestCard=tree=>find(tree,node=>node.type==='article'&&node.props.className==='staff-request-record');
const catalogLink=tree=>find(tree,node=>node.type==='a');
const issueButton=tree=>find(tree,node=>node.type==='button'&&node.props.className==='staff-request-issue');
const depsEqual=(left,right)=>Boolean(left&&right&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index])));

async function fixture(run,intercept=()=>undefined){
  const temporaryRoot=path.resolve(frontend,'.sites-runtime');mkdirSync(temporaryRoot,{recursive:true});
  const directory=mkdtempSync(path.join(temporaryRoot,'staff-assignment-')),file=directory+'/parent.mjs';
  const before={window:globalThis.window,fetch:globalThis.fetch,hooks:globalThis.__staffAssignmentHooks};
  const calls=[],expired=[];let frame=null,cursor=0,mounts=0,tree;
  const state={identity:'synthetic-manager',selected:{id:'55',assignedUserId:2,chatwootAgentId:2},liveKey:'synthetic-normal-access',liveSession:{role:'mudur',permissions:['crm.view','crm.manage']}};
  globalThis.window={location:{origin:'http://synthetic.invalid'}};
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/^\/api\/live\/crm\/customer-product-requests(?:\?conversationId=55|\/sessions)$/);
    const call={url,options,assignee:state.selected.assignedUserId};calls.push(call);
    const response=intercept(call);if(response!==undefined)return response;
    return options.method==='POST'?success(grant()):success([record(String(call.assignee))]);
  };
  globalThis.__staffAssignmentHooks={
    useState(initial){const own=frame,index=cursor++;if(!(index in own.values))own.values[index]=typeof initial==='function'?initial():initial;return [own.values[index],value=>{own.values[index]=typeof value==='function'?value(own.values[index]):value;}];},
    useRef(initial){const index=cursor++;if(!(index in frame.values))frame.values[index]={current:initial};return frame.values[index];},
    useMemo(create,deps){const index=cursor++,previous=frame.values[index];if(!previous||!depsEqual(previous.deps,deps))frame.values[index]={deps,value:create()};return frame.values[index].value;},
    useEffect(effect,deps){const index=cursor++,previous=frame.effects[index];if(!previous||!depsEqual(previous.deps,deps))frame.scheduled.push({index,effect,deps});},
  };
  const dispose=()=>{for(const effect of frame?.effects||[])effect?.cleanup?.();};
  try{
    // Compile the exact production parent element, rather than duplicating its
    // key/permission expression. The rest of App (login, timers, API) is not run.
    const app=readFileSync(frontend+'src/App.jsx','utf8');
    const matches=[...app.matchAll(/<StaffProductRequests\b[\s\S]*?\/>/g)];assert.equal(matches.length,1);
    const parent=`import StaffProductRequests from './staff.mjs';
      export default function Parent({identity,selected,liveKey,liveSession,onExpired}){
        const sessionIdentityRef={current:identity},loadRequestPhoto=undefined,closeLiveSession=onExpired;
        return (${matches[0][0]});
      }`;
    const staffPath=frontend+'src/customerProductRequest/StaffProductRequests.jsx';
    const staffSource=readFileSync(staffPath,'utf8')
      .replace("import {useEffect,useMemo,useRef,useState} from 'react';",'const {useEffect,useMemo,useRef,useState}=globalThis.__staffAssignmentHooks;')
      .replace("import './customerProductRequest.css';",'')
      // Photos are not rendered in these cases (loadPhoto is absent). Avoid
      // importing an unrelated JSX page; API and panel behavior stay unchanged.
      .replace("import {ProductRequestPhoto} from './CustomerProductRequestPage.jsx';",'const ProductRequestPhoto=()=>null;')
      .replace("from './api.js'",`from '${new URL('./api.js',pathToFileURL(staffPath)).href}'`);
    writeFileSync(directory+'/staff.mjs',transformSync(staffSource,{loader:'jsx',jsx:'automatic',format:'esm'}).code);
    writeFileSync(file,transformSync(parent,{loader:'jsx',jsx:'automatic',format:'esm'}).code);
    const Parent=(await import(pathToFileURL(file).href)).default;
    const render=()=>{
      const element=Parent({...state,onExpired:()=>expired.push(true)});
      // React reconciles a key change by cleaning up the old instance and
      // creating fresh hook state. Keep that behavior in this focused harness.
      if(!frame||frame.key!==element.key){dispose();frame={key:element.key,values:[],effects:[],scheduled:[]};mounts++;}
      cursor=0;frame.scheduled=[];tree=element.type(element.props);return tree;
    };
    const commit=()=>{render();const own=frame;for(const {index,effect,deps}of own.scheduled){own.effects[index]?.cleanup?.();own.effects[index]={deps,cleanup:effect()};}return render();};
    await run({state,calls,expired,render,commit,mounts:()=>mounts,settle:async()=>{await tick();return commit();},assign:id=>{state.selected={...state.selected,assignedUserId:id};return commit();}});
  }finally{dispose();globalThis.window=before.window;globalThis.fetch=before.fetch;globalThis.__staffAssignmentHooks=before.hooks;assert.equal(path.dirname(path.resolve(directory)),temporaryRoot);rmSync(directory,{recursive:true,force:true});}
}

test('actual App staff panel drops loaded request and private link immediately on in-place A to B assignment',async()=>{
  await fixture(async h=>{
    h.commit();let tree=await h.settle();assert(requestCard(tree));
    issueButton(tree).props.onClick();tree=await h.settle();assert(catalogLink(tree));
    tree=h.assign(3);
    assert.equal(Boolean(requestCard(tree)),false,'old assignment request must disappear before the new read completes');
    assert.equal(Boolean(catalogLink(tree)),false,'old assignment capability must disappear immediately');
    tree=await h.settle();assert.equal(Boolean(requestCard(tree)),false);assert.equal(Boolean(catalogLink(tree)),false);
    assert(find(tree,node=>node.props?.role==='alert'));assert.equal(h.mounts(),2);assert.equal(h.calls.filter(call=>call.options.method==='GET').length,2);
  },call=>call.assignee===3?denied(403):undefined);
});

test('assignment remount aborts pending issue and a late old capability never appears in the new panel',async()=>{
  const pending=deferred();
  await fixture(async h=>{
    h.commit();const tree=await h.settle();issueButton(tree).props.onClick();
    const old=h.calls.find(call=>call.options.method==='POST');assert(old);h.assign(3);
    assert.equal(old.options.signal.aborted,true,'old assignment mutation must be cancelled at the parent boundary');
    pending.resolve(success(grant()));const next=await h.settle();
    assert.equal(Boolean(catalogLink(next)),false);assert.equal(h.expired.length,0);
    assert.equal(h.calls.filter(call=>call.options.method==='POST').length,1);
  },call=>call.options.method==='POST'?pending.promise:undefined);
});

for(const status of [200,401])test(`assignment remount aborts pending list; late old ${status} cannot restore data or close new context`,async()=>{
  const pending=deferred();
  await fixture(async h=>{
    h.commit();const old=h.calls[0];h.assign(3);
    assert.equal(old.options.signal.aborted,true,'old assignment list must be cancelled');
    pending.resolve(status===200?success([record('OLD')]):denied(status));const tree=await h.settle();
    assert.equal(Boolean(requestCard(tree)),false);assert.equal(h.expired.length,0);
    assert.equal(h.calls.filter(call=>call.options.method==='GET').length,2);
  },call=>call.assignee===2?pending.promise:success([]));
});

test('same verified assignment preserves panel state and does not re-read or duplicate issue',async()=>{
  await fixture(async h=>{
    h.commit();let tree=await h.settle();issueButton(tree).props.onClick();tree=await h.settle();
    assert(requestCard(tree));assert(catalogLink(tree));const count=h.calls.length;
    h.state.selected={...h.state.selected,owner:'Refreshed display label'};tree=h.commit();
    assert(requestCard(tree));assert(catalogLink(tree));assert.equal(h.mounts(),1);assert.equal(h.calls.length,count);
  });
});

test('actual parent permission expression allows personnel review but no issue or private link after reassignment',async()=>{
  await fixture(async h=>{
    h.state.liveSession={role:'personel',permissions:['crm.view']};h.commit();let tree=await h.settle();
    assert(requestCard(tree));assert.equal(Boolean(issueButton(tree)),false);assert.equal(Boolean(catalogLink(tree)),false);
    h.assign(3);tree=await h.settle();assert.equal(Boolean(issueButton(tree)),false);assert.equal(Boolean(catalogLink(tree)),false);
    assert.equal(h.calls.some(call=>call.options.method==='POST'),false);
  });
});
