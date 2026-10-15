import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {transformSync} from 'esbuild';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const success=data=>Response.json({success:true,data});
const grant=index=>({sessionId:`synthetic-session-${index}`,capability:String(index).repeat(43),expiresAt:'2099-01-01T00:00:00Z'});
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
function text(tree){if(typeof tree==='string')return tree;if(!tree||typeof tree!=='object')return '';return [tree.props?.children].flat(Infinity).map(text).join('');}
const issueButton=tree=>find(tree,node=>node.type==='button'&&node.props.className==='staff-request-issue');
const link=tree=>find(tree,node=>node.type==='a');
const copyButton=tree=>find(find(tree,node=>node.props?.className==='staff-request-link'),node=>node.type==='button');
const alert=tree=>find(tree,node=>node.props?.role==='alert');
const copied=tree=>text(copyButton(tree)).trim()==='Kopyalandı';
const depsEqual=(left,right)=>Boolean(left&&right&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index])));

async function fixture(run,{issueResponse}={}){
  const temporaryRoot=path.resolve(frontend,'.sites-runtime');mkdirSync(temporaryRoot,{recursive:true});
  const directory=mkdtempSync(path.join(temporaryRoot,'staff-copy-'));
  const before={window:globalThis.window,fetch:globalThis.fetch,hooks:globalThis.__staffCopyHooks,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
  const calls=[],copies=[],expired=[];let frame=null,cursor=0,issueCount=0,lateWrites=0;
  const state={identity:'synthetic-manager',selected:{id:'55',assignedUserId:2},liveKey:'synthetic-normal-access',liveSession:{role:'mudur',permissions:['crm.view','crm.manage']}};
  globalThis.window={location:{origin:'http://synthetic.invalid'}};
  // No operating-system clipboard or network is used. Every copy is settled
  // explicitly, while the production Staff component and API remain intact.
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText(value){const pending=deferred();copies.push({value,...pending});return pending.promise;}}}});
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/^\/api\/live\/crm\/customer-product-requests(?:\?conversationId=\d+|\/sessions)$/);
    calls.push({url,options});
    if(options.method==='POST'){issueCount++;return issueResponse?.(issueCount,options)??success(grant(issueCount));}
    return success([]);
  };
  globalThis.__staffCopyHooks={
    useState(initial){const own=frame,index=cursor++;if(!(index in own.values))own.values[index]=typeof initial==='function'?initial():initial;return [own.values[index],value=>{if(own.disposed)lateWrites++;own.values[index]=typeof value==='function'?value(own.values[index]):value;}];},
    useRef(initial){const index=cursor++;if(!(index in frame.values))frame.values[index]={current:initial};return frame.values[index];},
    useMemo(create,deps){const index=cursor++,previous=frame.values[index];if(!previous||!depsEqual(previous.deps,deps))frame.values[index]={deps,value:create()};return frame.values[index].value;},
    useEffect(effect,deps){const index=cursor++,previous=frame.effects[index];if(!previous||!depsEqual(previous.deps,deps))frame.scheduled.push({index,effect,deps});},
  };
  const dispose=()=>{if(!frame||frame.disposed)return;for(const effect of frame.effects)effect?.cleanup?.();frame.disposed=true;};
  try{
    const app=readFileSync(frontend+'src/App.jsx','utf8');
    const matches=[...app.matchAll(/<StaffProductRequests\b[\s\S]*?\/>/g)];assert.equal(matches.length,1);
    const parent=`import StaffProductRequests from './staff.mjs';
      export default function Parent({identity,selected,liveKey,liveSession,onExpired}){
        const sessionIdentityRef={current:identity},loadRequestPhoto=undefined,closeLiveSession=onExpired;
        return (${matches[0][0]});
      }`;
    const staffPath=frontend+'src/customerProductRequest/StaffProductRequests.jsx';
    const source=readFileSync(staffPath,'utf8')
      .replace("import {useEffect,useMemo,useRef,useState} from 'react';",'const {useEffect,useMemo,useRef,useState}=globalThis.__staffCopyHooks;')
      .replace("import {ArrowSquareOut,Check,Copy,Package,Plus} from '@phosphor-icons/react';",'const ArrowSquareOut=()=>null,Check=()=>null,Copy=()=>null,Package=()=>null,Plus=()=>null;')
      .replace("import {ProductRequestPhoto} from './CustomerProductRequestPage.jsx';",'const ProductRequestPhoto=()=>null;')
      .replace("import './customerProductRequest.css';",'')
      .replace("from './api.js'",`from '${new URL('./api.js',pathToFileURL(staffPath)).href}'`);
    writeFileSync(directory+'/staff.mjs',transformSync(source,{loader:'jsx',jsx:'automatic',format:'esm'}).code);
    writeFileSync(directory+'/parent.mjs',transformSync(parent,{loader:'jsx',jsx:'automatic',format:'esm'}).code);
    const Parent=(await import(pathToFileURL(directory+'/parent.mjs').href)).default;
    const render=()=>{
      const element=Parent({...state,onExpired:()=>expired.push(true)});
      if(!frame||frame.key!==element.key){dispose();frame={key:element.key,values:[],effects:[],scheduled:[],disposed:false};}
      cursor=0;frame.scheduled=[];return element.type(element.props);
    };
    const commit=()=>{render();const own=frame;for(const {index,effect,deps}of own.scheduled){own.effects[index]?.cleanup?.();own.effects[index]={deps,cleanup:effect()};}return render();};
    const settle=async()=>{await tick();return commit();};
    await run({state,calls,copies,expired,commit,settle,dispose,lateWrites:()=>lateWrites,issue:async()=>{const tree=commit(),button=issueButton(tree);assert(button&&!button.props.disabled);button.props.onClick();return settle();},copy:()=>{const button=copyButton(commit());assert(button);button.props.onClick();return copies.at(-1);}});
  }finally{
    dispose();globalThis.window=before.window;globalThis.fetch=before.fetch;globalThis.__staffCopyHooks=before.hooks;
    if(before.navigator)Object.defineProperty(globalThis,'navigator',before.navigator);else delete globalThis.navigator;
    assert.equal(path.dirname(path.resolve(directory)),temporaryRoot);assert(path.basename(directory).startsWith('staff-copy-'));rmSync(directory,{recursive:true,force:true});
  }
}

test('a fresh grant starts uncopied after A was copied; B needs its own successful explicit copy',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();let tree=await h.issue();const a=link(tree).props.href;
    h.copy().resolve();tree=await h.settle();assert(copied(tree));
    tree=await h.issue();assert.notEqual(link(tree).props.href,a);assert.equal(copied(tree),false);
    const b=h.copy();assert.equal(b.value,link(tree).props.href);b.resolve();tree=await h.settle();assert(copied(tree));assert.equal(h.copies.length,2);
  });
});

for(const outcome of ['resolve','reject'])test(`late copy A ${outcome} cannot change fresh B feedback`,async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const a=h.copy();let tree=await h.issue();const b=link(tree).props.href;
    a[outcome](new Error('Synthetic clipboard failure'));tree=await h.settle();
    assert.equal(link(tree).props.href,b);assert.equal(copied(tree),false);assert.equal(alert(tree),null);
    h.copy().resolve();tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('late A rejection preserves B successful feedback',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const a=h.copy();await h.issue();h.copy().resolve();let tree=await h.settle();assert(copied(tree));
    a.reject(new Error('Synthetic A failure'));tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('late A success preserves B failure feedback',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const a=h.copy();await h.issue();h.copy().reject(new Error('Synthetic B failure'));let tree=await h.settle();
    assert(alert(tree));assert.equal(copied(tree),false);const message=text(alert(tree));
    a.resolve();tree=await h.settle();assert.equal(text(alert(tree)),message);assert.equal(copied(tree),false);
  });
});

test('grant B acceptance invalidates A even before the next render',async()=>{
  const response=deferred();
  await fixture(async h=>{
    h.commit();await h.settle();const first=await h.issue(),oldLink=link(first).props.href,a=h.copy();issueButton(h.commit()).props.onClick();
    response.resolve(success(grant(2)));await tick();a.resolve();await tick();const tree=h.commit();
    assert.equal(h.calls.filter(call=>call.options.method==='POST').length,2);assert.notEqual(link(tree).props.href,oldLink);assert.equal(copied(tree),false);assert.equal(alert(tree),null);
  },{issueResponse:index=>index===2?response.promise:undefined});
});

test('current B failure remains visible and successful explicit retry clears it',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();await h.issue();h.copy().reject(new Error('Synthetic B failure'));let tree=await h.settle();
    assert.match(text(alert(tree)),/kopyalayamadık/);assert.equal(copied(tree),false);
    h.copy().resolve();tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('a current A copy success cannot clear a later failed B issue error',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();const first=await h.issue(),oldLink=link(first).props.href,pending=h.copy();let tree=await h.issue();
    assert.equal(link(tree).props.href,oldLink);assert.match(text(alert(tree)),/bağlantısı hazırlanamadı/);const message=text(alert(tree));
    pending.resolve();tree=await h.settle();assert(copied(tree));assert.equal(text(alert(tree)),message);
  },{issueResponse:index=>index===2?Response.json({success:false,error:{code:'SYNTHETIC_FAILURE'}},{status:503}):undefined});
});

for(const outcome of ['resolve','reject'])test(`late ${outcome} stays isolated across token context and assignment remount`,async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const a=h.copy();h.state.liveKey='synthetic-next-access';h.commit();await h.settle();await h.issue();
    a[outcome](new Error('Synthetic old-context failure'));let tree=await h.settle();assert.equal(copied(tree),false);assert.equal(alert(tree),null);
    const b=h.copy();h.state.selected={...h.state.selected,assignedUserId:3};h.commit();await h.settle();tree=await h.issue();
    b[outcome](new Error('Synthetic old-assignment failure'));tree=await h.settle();assert.equal(copied(tree),false);assert.equal(alert(tree),null);assert.equal(h.lateWrites(),0);assert.equal(h.expired.length,0);
  });
});

for(const outcome of ['resolve','reject'])test(`unmounted panel ignores pending clipboard ${outcome}`,async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const pending=h.copy();h.dispose();pending[outcome](new Error('Synthetic disposed failure'));await tick();
    assert.equal(h.lateWrites(),0);assert.equal(h.expired.length,0);
  });
});

test('refresh drops copy feedback and ignores the previous grant settlement',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const pending=h.copy();find(h.commit(),node=>node.type==='button'&&text(node)==='Yenile').props.onClick();
    h.commit();await h.settle();pending.resolve();await h.settle();const tree=await h.issue();assert.equal(copied(tree),false);assert.equal(alert(tree),null);
  });
});

test('canIssue remains an actual parent permission boundary for copy and grant creation',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const pending=h.copy();h.state.liveSession={role:'personel',permissions:['crm.view']};let tree=h.commit();
    assert.equal(issueButton(tree),null);assert.equal(copyButton(tree),null);assert.equal(link(tree),null);
    pending.resolve();await h.settle();h.state.liveSession={role:'mudur',permissions:['crm.view','crm.manage']};tree=h.commit();assert.equal(copied(tree),false);
    assert.equal(h.calls.filter(call=>call.options.method==='POST').length,1);
  });
});

test('busy and mutation guards still reject duplicate grant creation',async()=>{
  const response=deferred();
  await fixture(async h=>{
    h.commit();await h.settle();const button=issueButton(h.commit());button.props.onClick();button.props.onClick();let tree=h.commit();
    assert.equal(issueButton(tree).props.disabled,true);assert.equal(h.calls.filter(call=>call.options.method==='POST').length,1);
    response.resolve(success(grant(1)));tree=await h.settle();assert(link(tree));assert.equal(issueButton(tree).props.disabled,false);assert.equal(copied(tree),false);
  },{issueResponse:()=>response.promise});
});

test('same-grant overlap: late first rejection cannot replace the latest copy success',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),latest=h.copy();assert.equal(first.value,latest.value);
    latest.resolve();let tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
    first.reject(new Error('Synthetic first-copy failure'));tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('same-grant overlap: late first success cannot replace the latest copy failure',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),latest=h.copy();
    latest.reject(new Error('Synthetic latest-copy failure'));let tree=await h.settle();assert.equal(copied(tree),false);assert.match(text(alert(tree)),/kopyalayamadık/);const message=text(alert(tree));
    first.resolve();tree=await h.settle();assert.equal(copied(tree),false);assert.equal(text(alert(tree)),message);
  });
});

test('same-grant overlap: double click before render still accepts only the latest outcome',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const button=copyButton(h.commit());button.props.onClick();button.props.onClick();
    assert.equal(h.copies.length,2);const [first,latest]=h.copies;assert.equal(first.value,latest.value);
    latest.resolve();let tree=await h.settle();assert(copied(tree));first.reject(new Error('Synthetic earlier click failure'));
    tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);assert.equal(h.calls.filter(call=>call.options.method==='POST').length,1);
  });
});

for(const outcome of ['resolve','reject'])test(`same-grant overlap: old ${outcome} stays silent while the latest attempt is pending`,async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),latest=h.copy();first[outcome](new Error('Synthetic superseded-copy result'));
    let tree=await h.settle();assert.equal(copied(tree),false);assert.equal(alert(tree),null);
    latest.resolve();tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('same-grant overlap: a pending new attempt does not display an earlier successful result',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();h.copy().resolve();let tree=await h.settle();assert(copied(tree));
    const latest=h.copy();tree=h.commit();assert.equal(copied(tree),false);assert.equal(alert(tree),null);
    latest.resolve();tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('same-grant overlap: explicit retry recovers the latest failure while the first copy stays pending',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),second=h.copy();second.reject(new Error('Synthetic second-copy failure'));
    let tree=await h.settle();assert(alert(tree));const retry=h.copy();tree=h.commit();assert.equal(copied(tree),false);assert.equal(alert(tree),null);
    retry.resolve();tree=await h.settle();assert(copied(tree));first.reject(new Error('Synthetic oldest-copy failure'));
    tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);assert.equal(h.copies.length,3);
  });
});

test('same-grant overlap: refresh invalidates both pending attempts and allows a fresh explicit copy',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),latest=h.copy();find(h.commit(),node=>node.type==='button'&&text(node)==='Yenile').props.onClick();h.commit();await h.settle();
    latest.resolve();first.reject(new Error('Synthetic pre-refresh failure'));let tree=await h.settle();assert.equal(link(tree),null);assert.equal(alert(tree),null);
    tree=await h.issue();assert.equal(copied(tree),false);h.copy().resolve();tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);
  });
});

test('same-grant overlap: a replacement grant keeps its own failure despite both old outcomes',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();const oldLink=link(await h.issue()).props.href,first=h.copy(),latest=h.copy();let tree=await h.issue();assert.notEqual(link(tree).props.href,oldLink);
    h.copy().reject(new Error('Synthetic new-grant failure'));tree=await h.settle();const message=text(alert(tree));assert(message);
    latest.resolve();first.reject(new Error('Synthetic old-grant failure'));tree=await h.settle();assert.equal(copied(tree),false);assert.equal(text(alert(tree)),message);
  });
});

for(const change of ['token context','assignment remount'])test(`same-grant overlap: ${change} isolates two old pending outcomes`,async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),latest=h.copy();
    if(change==='token context')h.state.liveKey='synthetic-new-copy-context';else h.state.selected={...h.state.selected,assignedUserId:3};
    h.commit();await h.settle();await h.issue();h.copy().resolve();let tree=await h.settle();assert(copied(tree));
    first.resolve();latest.reject(new Error('Synthetic old-context failure'));tree=await h.settle();assert(copied(tree));assert.equal(alert(tree),null);assert.equal(h.lateWrites(),0);assert.equal(h.expired.length,0);
  });
});

test('same-grant overlap: unmount ignores both old outcomes without state writes',async()=>{
  await fixture(async h=>{
    h.commit();await h.settle();await h.issue();const first=h.copy(),latest=h.copy();h.dispose();latest.resolve();first.reject(new Error('Synthetic unmounted-copy failure'));await tick();
    assert.equal(h.lateWrites(),0);assert.equal(h.expired.length,0);
  });
});
