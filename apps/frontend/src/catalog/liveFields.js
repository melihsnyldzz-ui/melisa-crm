// The user explicitly confirmed all ERP selling prices are for one piece.
export const ERP_PRICE_BASIS = 'piece';
// Pure adapter for the ERP fields confirmed in its product source contract.
// This module does not fetch, authenticate, create a bridge, or imply that the
// current CRM has access to the ERP. It deliberately ignores all other fields.
function finiteDecimal(value){
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const number=Number(value);return Number.isFinite(number)?number:null;
}
export function normalizeLiveSaleFields(row={},verification={}){
 const amount=finiteDecimal(row.salePrice);
 const currency=typeof row.currency==='string'&&/^[A-Za-z]{3}$/.test(row.currency.trim())?row.currency.trim().toUpperCase():null;
 const stock=finiteDecimal(row.stockQuantity);
 return {
  prices:amount!==null&&amount>=0&&currency?{[currency]:amount}:{},
  currency,
  priceVerified:verification.priceVerified===true&&amount!==null&&amount>=0&&Boolean(currency),
  stockVerified:verification.stockVerified===true&&stock!==null,
  stock,
  stockAvailable:stock===null?null:stock>0,
  // Price basis is user-confirmed per piece; series counts still require a separate verified field.
  seriesCount:null,
  months:[],
  counts:[],
  hasSourceImage:typeof row.imageUrl==='string'&&row.imageUrl.trim().length>0,
  image:'',
 };
}
export function normalizeLiveProductRows(rows,context={}){
 if(!Array.isArray(rows))throw new Error('ERP ürün listesi doğrulanamadı.');
 const seen=new Set(),text=value=>typeof value==='string'?value.trim():'';
 return rows.map(row=>{
  const id=typeof row.id==='string'||typeof row.id==='number'?String(row.id):'';
  const code=text(row.stockCode),name=text(row.productName);
  if(!id||!code||!name||seen.has(id))throw new Error('ERP ürün kimliği, kodu veya adı doğrulanamadı.');seen.add(id);
  const verification=typeof context.verificationFor==='function'?context.verificationFor(row.id):{};
  return {id,code,name,brand:text(row.brand),type:text(row.category),names:{},isNew:null,...normalizeLiveSaleFields(row,verification),priceBasis:ERP_PRICE_BASIS};
 });
}
