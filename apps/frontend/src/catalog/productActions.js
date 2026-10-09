export const exactPriceText=value=>typeof value==='string'&&/^\d+\.\d{8}$/.test(value)?value.replace(/0+$/,'').replace(/\.$/,''):null;
export const priceLabelText=(value,language='tr')=>{
 if(exactPriceText(value)===null)return null;
 const cents=(BigInt(value.replace('.',''))+500000n)/1000000n;
 const locale={tr:'tr-TR',en:'en-GB',fr:'fr-FR'}[language]||'tr-TR';
 const integer=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(cents/100n);
 const separator=new Intl.NumberFormat(locale).formatToParts(1.1).find(p=>p.type==='decimal').value;
 return integer+separator+String(cents%100n).padStart(2,'0');
};
export function catalogProductsForCurrency(products,currency,{requirePrice=true}={}){
 if(!Array.isArray(products)||!['TRY','USD','EUR'].includes(currency))throw Error('Katalog para birimini seçin.');
 return products.map(product=>{
  if(!product.erpProductId)return product;
  const candidates=(product.salePrices||[]).filter(p=>p.tier===1&&p.isMainUnit&&p.currency===currency&&p.priceExact!==null&&Number(p.priceExact)>0);
  if(!requirePrice&&candidates.length!==1&&product.status==='active'&&!product.hold?.blocked)return product;
  if(candidates.length!==1||product.status!=='active'||product.hold?.blocked||product.unit?.verified!==true)throw Error(`${product.code||product.name}: seçilen para birimindeki satış fiyatı doğrulanamadı.`);
  const tuple=candidates[0];return {...product,currency,priceExact:tuple.priceExact,priceSourceKey:tuple.sourceKey};
 });
}
export function selectedSaleLines(products){
 if(!Array.isArray(products)||!products.length)throw Error('Önce ürün seçin.');
 return products.map(product=>{
  const currency=product.currency,price=product.prices?.[currency];
  if(!['TRY','USD','EUR'].includes(currency)||typeof price!=='number'||!Number.isFinite(price)||price<=0)throw Error(`${product.code||product.name}: satış fiyatı ve para birimi doğrulanamadı.`);
  const candidates=(product.salePrices||[]).filter(p=>p.tier===1&&p.isMainUnit&&p.currency===currency&&p.priceExact===product.priceExact);
  if(product.erpProductId&&(product.hold?.blocked||product.status!=='active'||product.unit?.verified!==true||candidates.length!==1))throw Error(product.code+': sipariş fiyatı veya ürün durumu doğrulanamadı.');
  const tuple=candidates[0];return {id:product.id,stockCode:product.code,name:product.name,currency,unitPrice:price,priceExact:product.priceExact??null,unitLabel:product.unitLabel??product.unit?.label??null,...(product.erpProductId?{productId:product.erpProductId,erpProductId:product.erpProductId,priceId:Number(tuple.id),unitSourceId:Number(tuple.unitSourceId),tier:tuple.tier,priceExact:tuple.priceExact,priceSourceKey:tuple.sourceKey,revision:product.revision,unitLabel:product.unit?.label||null}: {})};
 });
}
export function selectionMessage(products,priced=false){
 if(priced)return [products.some(p=>String(p.id).startsWith('erp-'))?'Kayıtlı satış fiyatları':'Kayıtlı satış fiyatları · adet fiyatı',...selectedSaleLines(products).map(line=>`${line.stockCode} · ${line.name} · ${line.currency} ${String(line.id).startsWith('erp-')?(priceLabelText(line.priceExact)||'fiyat bilinmiyor'):line.unitPrice.toFixed(2)}${String(line.id).startsWith('erp-')?` / ${line.unitLabel||'birim bilinmiyor'}`:''}`)].join('\n');
 return products.map(product=>`${product.code} · ${product.name}`).join('\n');
}
