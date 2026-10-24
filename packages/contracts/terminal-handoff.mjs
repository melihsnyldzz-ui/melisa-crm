const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const HEX=/^[a-f0-9]{64}$/;
const IDENTITY=['version','environmentId','database','erpOrigin','crmOrigin','erpUserId','erpNormalSessionId','crmUserId','chatwootAgentId','bindingRevision','expiresAt'];
const LINK=['linkId','requestId','deviceBinding','erpOrigin','crmOrigin','linkExpiresAt','terminalIdentity'];
const REQUEST=['code','requestId','deviceBinding','codeVerifier','erpOrigin','crmOrigin'];
export const reject=(statusCode=403)=>Object.assign(Error(statusCode===503?'Terminal oturum doğrulaması kullanılamıyor. Yeniden deneyin.':'Terminal hesabının CRM bağlantısı doğrulanamadı.'),{statusCode,code:statusCode===503?'CRM_TERMINAL_PEER_UNAVAILABLE':'CRM_TERMINAL_IDENTITY_REQUIRED'});
export const exact=(value,fields)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
const origins=(erp,crm)=>['127.0.0.1','192.168.1.46'].some(host=>erp===`http://${host}:5244`&&crm===`http://${host}:62800`);
export const text=(value,pattern)=>typeof value==='string'&&pattern.test(value);

export function terminalIdentityKey(identity){return JSON.stringify(IDENTITY.filter(key=>key!=='expiresAt').map(key=>identity[key]));}
export function validateTerminalIdentity(value,{now=Date.now(),fresh=true}={}){
 if(!exact(value,IDENTITY)||value.version!==1||value.environmentId!=='e662fd94-d797-4b3b-938a-d143ad758b67'
  ||value.database!=='MELISA_ERP_CLEAN_TEST_20261022'||!origins(value.erpOrigin,value.crmOrigin)
  ||!Number.isSafeInteger(value.erpUserId)||value.erpUserId<1||!text(value.erpNormalSessionId,UUID)
  ||!text(value.crmUserId,/^[A-Za-z0-9_-]{1,100}$/)||!Number.isSafeInteger(value.chatwootAgentId)||value.chatwootAgentId<1
  ||!text(value.bindingRevision,HEX)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<1
  ||fresh&&(value.expiresAt<=now||value.expiresAt>now+30000))throw reject();
 return value;
}
export function validateTerminalLink(link,{now=Date.now(),fresh=false}={}){
 if(!exact(link,LINK)||!text(link.linkId,TOKEN)||!text(link.requestId,UUID)||!text(link.deviceBinding,HEX)
  ||!origins(link.erpOrigin,link.crmOrigin)||!Number.isSafeInteger(link.linkExpiresAt)||link.linkExpiresAt<1
  ||fresh&&link.linkExpiresAt<=now)throw reject();
 validateTerminalIdentity(link.terminalIdentity,{now,fresh});
 if(link.erpOrigin!==link.terminalIdentity.erpOrigin||link.crmOrigin!==link.terminalIdentity.crmOrigin||link.terminalIdentity.expiresAt>link.linkExpiresAt)throw reject();
 return link;
}
export function validateTerminalRequest(body){
 if(!exact(body,REQUEST)||!text(body.code,TOKEN)||!text(body.requestId,UUID)||!text(body.deviceBinding,HEX)
  ||!text(body.codeVerifier,TOKEN)||!origins(body.erpOrigin,body.crmOrigin))throw reject();
 return body;
}
