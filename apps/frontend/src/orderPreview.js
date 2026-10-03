// Local, in-memory preview only. No fetch, storage, ERP writes or stock effects.
const CURRENCIES=new Set(['TRY','USD','EUR']);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const text=value=>typeof value==='string'?value.trim():'';
export function decimal4(value) {
 if(typeof value==='number'&&!Number.isFinite(value))fail('PRICE_INVALID');
 if(typeof value!=='number'&&typeof value!=='string')fail('PRICE_REQUIRED');
 const raw=String(value).trim();
 if(!/^\d+(?:\.\d{1,4})?$/.test(raw))fail('PRICE_INVALID');
 const [whole,fraction='']=raw.split('.'),amount=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
 if(amount>BigInt(Number.MAX_SAFE_INTEGER))fail('PRICE_OUT_OF_RANGE');
 return amount;
}
export function quantityInPieces(value) {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>9999)fail('PIECE_QUANTITY_INVALID');
 return value;
}
function priceFields(product) {
 const basis=product.priceBasis;
 if(basis!==undefined&&!['piece','per-item'].includes(basis))fail('PRICE_BASIS_UNSUPPORTED');
 if(product.salePrice!==undefined||product.unitPrice!==undefined||product.currency!==undefined) {
  const currency=text(product.currency).toUpperCase();if(!CURRENCIES.has(currency))fail('CURRENCY_REQUIRED');
  return {currency,amount:decimal4(product.unitPrice??product.salePrice)};
 }
 // Only the fictional seed picker uses display prices; structured ERP fields
 // never fall back to this parser or infer a default currency.
 const label=text(product.price);
 const match=/^(\u20ac|\$|\u20ba|EUR|USD|TRY)\s*(\d+(?:[,.]\d{1,4})?)$/.exec(label);
 if(!match)fail('PRICE_REQUIRED');
 const currency=({'\u20ac':'EUR','$':'USD','\u20ba':'TRY'})[match[1]]||match[1];
 return {currency,amount:decimal4(match[2].replace(',','.'))};
}
function fixed4(amount) {return `${amount/10000n}.${String(amount%10000n).padStart(4,'0')}`;}
export function draftProduct(product,quantity) {
 const id=typeof product?.id==='string'||typeof product?.id==='number'?String(product.id):'';
 const name=text(product?.name);if(!id||!name)fail('PRODUCT_IDENTITY_REQUIRED');
 const {currency,amount}=priceFields(product);
 return {id,name,code:text(product.code)||id,barcode:text(product.barcode),group:text(product.group),
  colors:Array.isArray(product.colors)?product.colors.filter(v=>typeof v==='string').slice(0,20):[],
  price:`${currency} ${fixed4(amount)}`,unitPrice:fixed4(amount),currency,quantity:quantityInPieces(quantity),priceBasis:'per-item'};
}
export function upsertDraftProduct(items,product,quantity) {
 const line=draftProduct(product,quantity),index=items.findIndex(p=>p.id===line.id);
 if(index<0)return [...items,line];
 if(JSON.stringify(items[index])===JSON.stringify(line))return items;
 return items.map((p,i)=>i===index?line:p);
}
export function formatPreviewTotals(totals) {
 return Object.entries(totals).map(([currency,value])=>{
  const amount=decimal4(value),cents=(amount+50n)/100n;
  return `${currency} ${cents/100n},${String(cents%100n).padStart(2,'0')}`;
 }).join(' / ');
}
export function createPreviewLedger({newId=()=>globalThis.crypto.randomUUID()}={}) {
 const previews=new Map();
 return {
  clear(){previews.clear();},
  create({accountId,conversationId,customer,owner,products}) {
   if(!text(accountId)||!text(String(conversationId??'')))fail('PREVIEW_CONTEXT_REQUIRED');
   if(!Array.isArray(products)||!products.length)fail('PRODUCT_SELECTION_REQUIRED');
   const lines=products.map(p=>draftProduct(p,p.quantity)).sort((a,b)=>a.id.localeCompare(b.id));
   if(new Set(lines.map(p=>p.id)).size!==lines.length)fail('DUPLICATE_PRODUCT_LINE');
   const fingerprint=JSON.stringify([accountId,String(conversationId),lines]);
   if(previews.has(fingerprint))return {order:previews.get(fingerprint),created:false};
   const totals={};for(const p of lines){
    const value=(totals[p.currency]?decimal4(totals[p.currency]):0n)+decimal4(p.unitPrice)*BigInt(p.quantity);
    if(value>BigInt(Number.MAX_SAFE_INTEGER))fail('TOTAL_OUT_OF_RANGE');
    totals[p.currency]=fixed4(value);Object.freeze(p.colors);Object.freeze(p);
   }
   Object.freeze(lines);Object.freeze(totals);
   const order=Object.freeze({id:`PREVIEW-${newId()}`,conversationId:String(conversationId),customer:text(customer),owner:text(owner),
    total:formatPreviewTotals(totals),totals,lines:lines.length,items:lines,priceBasis:'per-item',unit:'piece',
    updated:'Şimdi',status:'Yerel ERP önizlemesi',erpPersisted:false,stockEffect:false,ledgerEffect:false});
   previews.set(fingerprint,order);return {order,created:true};
  },
 };
}
