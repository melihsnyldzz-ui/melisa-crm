import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {resolveTestEndpoints} from '../../../../deploy/test-endpoints.mjs';

export const CLEAN_MANAGED_USERS_FILE='C:/Sirket/ERP/clean/20261022/runtime/crm-managed-users.json';
const environmentId='e662fd94-d797-4b3b-938a-d143ad758b67';
const slots=Object.freeze([
  Object.freeze({id:'155',phone:'905550000101',name:'Yapay TEST Müşteri A'}),
  Object.freeze({id:'156',phone:'905550000102',name:'Yapay TEST Müşteri B'}),
]);
const fail=(code,message,statusCode=400)=>Object.assign(Error(message),{code,statusCode});
const unavailable=()=>fail('CRM_ACCOUNT_STORE_UNAVAILABLE','TEST hesap kaydı kullanılamıyor.',503);
const username=value=>typeof value==='string'?value.trim().toLocaleLowerCase('tr-TR'):'';
const validHash=value=>typeof value==='string'&&/^scrypt\$[a-f0-9]{48}\$[a-f0-9]{128}$/.test(value);
const validId=value=>typeof value==='string'&&/^clean-managed-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const accountKeys=['id','username','displayName','role','active','chatwootAgentId','passwordHash','managementRevision'];
const publicAccount=({passwordHash,...account})=>account;

function scope(config) {
  const endpoints=resolveTestEndpoints(config);
  if(!endpoints.cleanSynthetic||config.CRM_UI_ORIGIN!==endpoints.uiOrigin
    ||config.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED!=='true'
    ||config.CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE!==CLEAN_MANAGED_USERS_FILE
    ||config.CRM_NORMAL_REFRESH_ENABLED!=='true'
    ||config.CRM_NORMAL_REFRESH_USER_ID!=='clean-staff-20261022'
    ||config.CRM_NORMAL_REFRESH_JOURNAL_PATH!=='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json'
    ||['WHATSAPP_SEND_ENABLED','WHATSAPP_LIVE_SEND_APPROVED','CRM_PAID_AI_ENABLED','CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED','CRM_SEMIH_TEST_CONTINUE_ENABLED','CRM_ASSIGNED_STAFF_REFRESH_ENABLED'].some(key=>config[key]!=='false'))
    throw unavailable();
  return JSON.stringify([endpoints,config.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED,config.CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE,config.CRM_NORMAL_REFRESH_ENABLED,config.CRM_NORMAL_REFRESH_USER_ID,config.CRM_NORMAL_REFRESH_JOURNAL_PATH]);
}

// Only this owner's exact, explicitly enabled clean profile can add accounts.
// The baseline configured accounts are never adopted, edited or reset here.
export function configuredCleanCrmManagement({config=process.env,baseline,repoRoot=process.cwd()}={}) {
  if(config.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED!=='true')return null;
  const snapshot=scope(config),relative=path.win32.relative(path.win32.resolve(repoRoot),CLEAN_MANAGED_USERS_FILE);
  if(!relative.startsWith('..'))throw unavailable();
  return createCleanCrmManagementStore({file:CLEAN_MANAGED_USERS_FILE,baseline,
    enabled:()=>scope(config)===snapshot});
}

function checkFile(file) {
  // Reject symlinks/junctions/hard-linked payloads. The installer owns the
  // private directory/Windows ACL; requests cannot choose or create a root.
  const absolute=path.resolve(file),root=path.parse(absolute).root;
  let current=root;
  for(const segment of path.relative(root,absolute).split(path.sep)) {
    current=path.join(current,segment);
    let info;
    try{info=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT'&&current===absolute)return;throw unavailable();}
    if(info.isSymbolicLink()||(current===absolute?(!info.isFile()||info.nlink!==1):!info.isDirectory()))throw unavailable();
    if(current===absolute&&info.size>2*1024*1024)throw unavailable();
  }
}

export function createCleanCrmManagementStore({file,baseline,enabled=()=>true,now=()=>new Date().toISOString()}={}) {
  if(!path.isAbsolute(file)||typeof baseline!=='function')throw unavailable();
  const assertEnabled=()=>{try{if(enabled()!==true)throw unavailable();}catch{throw unavailable();}};
  const empty=()=>({schema:1,environmentId,revision:0,accounts:[],assignments:slots.map(row=>({conversationId:row.id,agentId:null})),audit:[]});
  const validate=data=>{
    if(!exact(data,['schema','environmentId','revision','accounts','assignments','audit'])||data.schema!==1||data.environmentId!==environmentId
      ||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.accounts)||data.accounts.length>100
      ||!Array.isArray(data.assignments)||data.assignments.length!==slots.length||!Array.isArray(data.audit)||data.audit.length!==data.revision||data.audit.length>5000)throw unavailable();
    const ids=new Set(),names=new Set(),agents=new Set();
    for(const row of baseline()) {
      // An invalid baseline is not a safe absence/collision proof.
      if(!row||typeof row.id!=='string'||!username(row.username)||ids.has(row.id)||names.has(username(row.username))
        ||row.chatwootAgentId&&agents.has(row.chatwootAgentId))throw unavailable();
      ids.add(row.id);names.add(username(row.username));if(row.chatwootAgentId)agents.add(row.chatwootAgentId);
    }
    for(const row of data.accounts) {
      if(!exact(row,accountKeys)||!validId(row.id)||row.username!==username(row.username)||!/^\p{L}[\p{L}\p{N}._-]{2,63}$/u.test(row.username)
        ||typeof row.displayName!=='string'||row.displayName!==row.displayName.trim()||!row.displayName||row.displayName.length>120||/[\p{Cc}\p{Cf}]/u.test(row.displayName)
        ||!['personel','mudur'].includes(row.role)||typeof row.active!=='boolean'||!Number.isSafeInteger(row.chatwootAgentId)||row.chatwootAgentId<1001||row.chatwootAgentId>9999
        ||!validHash(row.passwordHash)||!Number.isSafeInteger(row.managementRevision)||row.managementRevision<1||row.managementRevision>data.revision
        ||ids.has(row.id)||names.has(row.username)||agents.has(row.chatwootAgentId))throw unavailable();
      ids.add(row.id);names.add(row.username);agents.add(row.chatwootAgentId);
    }
    data.assignments.forEach((row,index)=>{
      if(!exact(row,['conversationId','agentId'])||row.conversationId!==slots[index].id
        ||(row.agentId!==null&&!data.accounts.some(account=>account.chatwootAgentId===row.agentId)))throw unavailable();
    });
    data.audit.forEach((row,index)=>{
      if(!exact(row,['revision','at','actorId','action','targetId','changedFields'])||row.revision!==index+1
        ||typeof row.at!=='string'||!Number.isFinite(Date.parse(row.at))||typeof row.actorId!=='string'||!row.actorId
        ||!['create-account','update-account','assign-conversation'].includes(row.action)||typeof row.targetId!=='string'
        ||!Array.isArray(row.changedFields)||row.changedFields.some(field=>!['username','displayName','role','active','chatwootAgentId','password','agentId'].includes(field)))throw unavailable();
    });
    return data;
  };
  const read=()=>{
    assertEnabled();checkFile(file);
    try{return validate(JSON.parse(fs.readFileSync(file,'utf8')));}
    catch(error){if(error.code==='ENOENT')return validate(empty());throw unavailable();}
  };
  const mutate=(actor,action,targetId,changedFields,fn)=>{
    let lockFd,temporary;
    try {
      assertEnabled();checkFile(file);
      lockFd=fs.openSync(`${file}.lock`,'wx',0o600);
      const data=read();
      // No asynchronous work between this fresh authority/identity check and
      // atomic publication. API middleware also verifies the normal grant.
      const current=baseline().find(row=>row.id===actor?.id)||data.accounts.find(row=>row.id===actor?.id);
      if(!current?.active||actor?.active!==true||!['patron','mudur'].includes(current.role)||actor.testAdmin||actor.testPersonnel
        ||current.username!==actor.username||current.role!==actor.role||current.passwordHash!==actor.passwordHash
        ||current.chatwootAgentId!==actor.chatwootAgentId||current.managementRevision!==actor.managementRevision)
        throw fail('WHATSAPP_CRM_PERMISSION_DENIED','Güncel yönetici yetkisi gerekli.',403);
      if(data.audit.length>=5000)throw unavailable();
      const result=fn(data);if(result.unchanged)return result.value;
      data.revision++;data.audit.push({revision:data.revision,at:now(),actorId:current.id,action,targetId:targetId||result.account.id,changedFields:[...changedFields,...(result.assignmentChanged?['agentId']:[])]});
      validate(data);assertEnabled();checkFile(file);
      temporary=`${file}.${crypto.randomUUID()}.tmp`;
      const fd=fs.openSync(temporary,'wx',0o600);
      try{fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      fs.renameSync(temporary,file);temporary=null;
      return result.account?{account:publicAccount(result.account),revision:data.revision}:result.value;
    }catch(error){if(error.statusCode)throw error;throw unavailable();}
    finally{if(temporary)try{fs.unlinkSync(temporary);}catch{}if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(`${file}.lock`);}}
  };
  const input=(body,{create=false}={})=>{
    const keys=['revision','username','displayName','role','active','chatwootAgentId',...(Object.hasOwn(body||{},'password')?['password']:[])];
    if(!exact(body,keys)||!Number.isSafeInteger(body.revision)||body.revision<0||(create&&!Object.hasOwn(body,'password'))
      ||typeof body.username!=='string'||!/^\p{L}[\p{L}\p{N}._-]{2,63}$/u.test(username(body.username))
      ||typeof body.displayName!=='string'||!body.displayName.trim()||body.displayName.trim().length>120||/[\p{Cc}\p{Cf}]/u.test(body.displayName)
      ||!['personel','mudur'].includes(body.role)||typeof body.active!=='boolean'||!Number.isSafeInteger(body.chatwootAgentId)||body.chatwootAgentId<1001||body.chatwootAgentId>9999
      ||(Object.hasOwn(body,'password')&&(typeof body.password!=='string'||body.password.length<16||body.password.length>256)))
      throw fail('CRM_ACCOUNT_INPUT_INVALID','Hesap alanlarını, temsilci numarasını ve en az 16 karakterli parolayı kontrol edin.');
    return {...body,username:username(body.username),displayName:body.displayName.trim()};
  };
  const conflict=(data,record,id=null)=>{
    if([...baseline(),...data.accounts].some(row=>row.id!==id&&(username(row.username)===record.username||row.chatwootAgentId===record.chatwootAgentId)))
      throw fail('CRM_ACCOUNT_CONFLICT','Kullanıcı adı veya temsilci başka bir hesaba bağlı. Kapalı hesapları da kontrol edin.',409);
  };
  const revision=(data,value)=>{if(data.revision!==value)throw fail('CRM_ACCOUNT_REVISION_CHANGED','Hesap listesi değişti. Yeniden okuyup deneyin.',409);};
  return {
    records:()=>read().accounts.map(row=>({...row})),
    isManaged(user){const row=read().accounts.find(value=>value.id===user?.id);return Boolean(row&&row.active&&accountKeys.every(key=>row[key]===user[key]));},
    overview(){const data=read();return {enabled:true,revision:data.revision,editableAccountIds:data.accounts.map(row=>row.id),agentRange:{minimum:1001,maximum:9999},synthetic:true};},
    create(actor,body,hashPassword){const value=input(body,{create:true});return mutate(actor,'create-account',null,['username','displayName','role','active','chatwootAgentId','password'],data=>{
      revision(data,value.revision);conflict(data,value);
      const account={id:`clean-managed-${crypto.randomUUID()}`,username:value.username,displayName:value.displayName,role:value.role,active:value.active,chatwootAgentId:value.chatwootAgentId,passwordHash:hashPassword(value.password),managementRevision:data.revision+1};
      data.accounts.push(account);return {account};
    });},
    update(actor,id,body,hashPassword){const value=input(body);if(!validId(id))throw fail('CRM_BASELINE_ACCOUNT_PROTECTED','Mevcut yapılandırılmış hesap bu ekrandan değiştirilemez.',403);
      return mutate(actor,'update-account',id,['username','displayName','role','active','chatwootAgentId',...(Object.hasOwn(value,'password')?['password']:[])],data=>{
        revision(data,value.revision);const account=data.accounts.find(row=>row.id===id);if(!account)throw fail('CRM_ACCOUNT_NOT_FOUND','Hesap bulunamadı.',404);conflict(data,value,id);
        // An explicit representative change must not silently transfer this
        // person's synthetic customer ownership to another representative.
        let assignmentChanged=false;
        if(account.chatwootAgentId!==value.chatwootAgentId)for(const assignment of data.assignments)if(assignment.agentId===account.chatwootAgentId){assignment.agentId=null;assignmentChanged=true;}
        Object.assign(account,{username:value.username,displayName:value.displayName,role:value.role,active:value.active,chatwootAgentId:value.chatwootAgentId,managementRevision:data.revision+1,...(Object.hasOwn(value,'password')?{passwordHash:hashPassword(value.password)}:{})});return {account,assignmentChanged};
      });},
    conversations(){const data=read();return slots.map((slot,index)=>({...slot,assigneeAgentId:data.assignments[index].agentId}));},
    assign(actor,conversationId,agentId){if(!slots.some(row=>row.id===String(conversationId)))throw fail('CRM_BASELINE_ASSIGNMENT_PROTECTED','Bu TEST konuşmasının ataması salt okunur.',403);
      if(agentId!==null&&(!Number.isSafeInteger(agentId)||agentId<1001||agentId>9999))throw fail('CRM_ACCOUNT_AGENT_INVALID','Etkin TEST temsilcisini seçin.');
      return mutate(actor,'assign-conversation',String(conversationId),['agentId'],data=>{
        const account=agentId===null?null:data.accounts.find(row=>row.chatwootAgentId===agentId&&row.active);
        if(agentId!==null&&!account)throw fail('CRM_ACCOUNT_AGENT_INVALID','Etkin TEST temsilcisini seçin.');
        const row=data.assignments.find(value=>value.conversationId===String(conversationId));
        const value={conversationId:Number(conversationId),chatwootAgentId:agentId,assignedAgent:account?{id:agentId,name:account.displayName}:null,source:'clean-synthetic-management',confirmed:true};
        if(row.agentId===agentId)return {unchanged:true,value};row.agentId=agentId;return {value};
      });},
  };
}
