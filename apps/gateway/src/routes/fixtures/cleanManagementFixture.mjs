// Test-only adapters. Exact production private paths are held in RAM; no
// shared runtime/config/account file or upstream provider is read or written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {env} from '../../config/env.js';
import {CLEAN_MANAGED_USERS_FILE} from '../../services/cleanCrmManagement.mjs';

export function memoryPrivateFiles() {
  const files=new Map(),handles=new Map(),original={},roots=[CLEAN_MANAGED_USERS_FILE,'C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json'].map(value=>path.win32.normalize(value).toLowerCase());let counter=900000;
  const key=value=>typeof value==='string'?path.win32.normalize(value).toLowerCase():null;
  const owned=value=>{const name=key(value);return name&&roots.some(root=>name===root||name.startsWith(root+'.'));};
  const ancestor=value=>{const name=key(value);return name&&roots.some(root=>root.startsWith(name.endsWith('\\')?name:name+'\\'));};
  const missing=()=>Object.assign(Error('Synthetic memory file absent'),{code:'ENOENT'});
  const exclusive=()=>Object.assign(Error('Synthetic memory file exists'),{code:'EEXIST'});
  for(const name of ['readFileSync','lstatSync','mkdirSync','openSync','writeFileSync','fsyncSync','closeSync','renameSync','unlinkSync'])original[name]=fs[name];
  fs.lstatSync=(target,...args)=>{
    if(owned(target)){if(!files.has(key(target)))throw missing();return {isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false,nlink:1,size:Buffer.byteLength(files.get(key(target)))};}
    if(ancestor(target))return {isFile:()=>false,isDirectory:()=>true,isSymbolicLink:()=>false};return original.lstatSync(target,...args);
  };
  fs.mkdirSync=(target,...args)=>ancestor(target)?undefined:original.mkdirSync(target,...args);
  fs.readFileSync=(target,...args)=>{if(!owned(target))return original.readFileSync(target,...args);if(!files.has(key(target)))throw missing();return files.get(key(target));};
  fs.openSync=(target,...args)=>{if(!owned(target))return original.openSync(target,...args);if(files.has(key(target)))throw exclusive();files.set(key(target),'');const fd=counter++;handles.set(fd,key(target));return fd;};
  fs.writeFileSync=(target,value,...args)=>{const file=handles.get(target);if(!file&&!owned(target))return original.writeFileSync(target,value,...args);files.set(file||key(target),String(value));};
  fs.fsyncSync=fd=>{if(!handles.has(fd))return original.fsyncSync(fd);};
  fs.closeSync=fd=>{if(!handles.has(fd))return original.closeSync(fd);handles.delete(fd);};
  fs.renameSync=(from,to)=>{if(!owned(from)||!owned(to))return original.renameSync(from,to);if(!files.has(key(from)))throw missing();files.set(key(to),files.get(key(from)));files.delete(key(from));};
  fs.unlinkSync=target=>{if(!owned(target))return original.unlinkSync(target);if(!files.delete(key(target)))throw missing();};
  return {text:file=>files.get(key(file)),restore:()=>Object.assign(fs,original)};
}

export async function createManagementFixture({password=crypto.randomBytes(24).toString('base64url')}={}) {
  if(process.platform!=='win32')throw Error('Exact production clean profile is Windows-only.');
  const config={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_TEST_PORT_BASE:'62800',CRM_ISOLATED_PREPARATION:'true',
    CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',CRM_UI_ORIGIN:'http://127.0.0.1:62800',
    CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'clean-staff-20261022',CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json',
    CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED:'true',CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE:CLEAN_MANAGED_USERS_FILE,
    CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'false',CRM_TERMINAL_HANDOFF_ENABLED:'false',
    WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',
    CRM_CLEAN_CONVERSATION_PROJECTION_JSON:JSON.stringify({version:1,environment:'CLEAN_SYNTHETIC_TEST',synthetic:true,
      environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',conversations:[
        {id:'55',phone:'905550000001',name:'Örnek Mağaza',assigneeAgentId:2},{id:'56',phone:'905550000002',name:'Diğer Örnek Mağaza',assigneeAgentId:3},
      ]})};
  const previous=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]])),beforeAuth={...env.auth},beforeWa={...env.whatsapp},beforeCors=env.cors.origins,beforeRead=env.chatwoot.inboxReadEnabled;
  Object.assign(process.env,config);
  const salt=crypto.randomBytes(24).toString('hex'),passwordHash=`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
  const account=(id,username,displayName,role,chatwootAgentId)=>({id,username,displayName,role,active:true,chatwootAgentId,passwordHash});
  Object.assign(env.auth,{jwtSecret:crypto.randomBytes(48).toString('base64url'),issuer:'synthetic-management',audience:'synthetic-management-ui',tokenExpiresIn:'5m',personnelCanSend:true,loginRateLimitMax:1000,
    users:[account('clean-manager-20261022','ornek-mudur','Örnek Müdür','patron',1),account('clean-staff-20261022','ornek-personel','Örnek Personel','personel',2),account('clean-stranger-20261022','ornek-diger','Örnek Diğer','personel',3),account('clean-semih-20261023','semih','Semih','patron',null)]});
  Object.assign(env.whatsapp,{sendEnabled:false,liveSendApproved:false,provider:'evolution'});env.chatwoot.inboxReadEnabled=false;
  const memory=memoryPrivateFiles(),baseline=JSON.stringify(env.auth.users);
  const {createApp}=await import('../../app.js');
  const app=createApp(),server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const origin=`http://127.0.0.1:${server.address().port}`;env.cors.origins=[origin];
  const call=async(route,{body,method=body===undefined?'GET':'POST',token}={})=>{
    const response=await fetch(origin+route,{method,headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,headers:response.headers,...await response.json()};
  };
  return {origin,password,call,baseline,memory,server,app,close:async()=>{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));memory.restore();Object.assign(env.auth,beforeAuth);Object.assign(env.whatsapp,beforeWa);env.cors.origins=beforeCors;env.chatwoot.inboxReadEnabled=beforeRead;
    for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }};
}
