const key = actor => 'melisa-crm-terminal-shareproof-v1:' + encodeURIComponent(actor);
const failure = () => new Error('Güncel fiyat doğrulanamadı. Ürünleri yeniden açıp seçin; mesajınız korunuyor.');
function read(storage, actor) {
  try {
    const raw=storage.getItem(key(actor)); if (!raw) return {};
    const value=JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value!=='object' || Object.keys(value).length>100) throw failure();
    for(const [id,rows] of Object.entries(value)) if(!/^[1-9]\d*$/.test(id)||!Array.isArray(rows)||rows.length>50||rows.some(p=>!/^erp-[1-9]\d*$/.test(p?.id||'')||!/^[a-f0-9]{64}$/.test(p?.revision||''))) throw failure();
    return value;
  } catch { throw failure(); }
}
export function rememberTerminalShare(storage,actor,conversationId,products) {
  if (!actor || !/^[1-9]\d*$/.test(String(conversationId))) throw failure();
  const values=read(storage,actor),rows=new Map((values[conversationId]||[]).map(p=>[p.id,p]));
  for(const p of products) { if(!/^erp-[1-9]\d*$/.test(p?.id||'')||!/^[a-f0-9]{64}$/.test(p?.revision||''))throw failure(); rows.set(p.id,{id:p.id,revision:p.revision}); }
  if(rows.size>50)throw failure(); values[conversationId]=[...rows.values()];
  try{storage.setItem(key(actor),JSON.stringify(values));}catch{throw failure();}
}
export function clearTerminalShare(storage,actor,conversationId) {
  if(conversationId===undefined){storage.removeItem(key(actor));return;}
  const values=read(storage,actor);delete values[conversationId];storage.setItem(key(actor),JSON.stringify(values));
}
export async function verifyTerminalShare({storage,actor,conversationId,readProduct,isCurrent}) {
  const rows=read(storage,actor)[conversationId]||[];
  for(const row of rows) {
    if(!isCurrent())throw failure();
    let envelope;try{envelope=await readProduct(row.id);}catch{throw failure();}
    const p=envelope?.data,m=envelope?.meta;
    if(!isCurrent()||m?.catalogVersion!=='melisa-catalog.v1'||m.sourceDatabaseVerified!==true||m.cached!==false||p?.id!==row.id||p.revision!==row.revision||p.status!=='active'||p.hold?.blocked!==false)throw failure();
  }
  return rows.length;
}
