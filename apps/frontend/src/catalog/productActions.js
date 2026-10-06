export const exactPriceText=value=>typeof value==='string'&&/^\d+\.\d{8}$/.test(value)?value.replace(/0+$/,'').replace(/\.$/,''):null;
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
 if(priced)return [products.some(p=>String(p.id).startsWith('erp-'))?'Kayıtlı satış fiyatları':'Kayıtlı satış fiyatları · adet fiyatı',...selectedSaleLines(products).map(line=>`${line.stockCode} · ${line.name} · ${line.currency} ${String(line.id).startsWith('erp-')?(exactPriceText(line.priceExact)||'fiyat bilinmiyor'):line.unitPrice.toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}${String(line.id).startsWith('erp-')?` / ${line.unitLabel||'birim bilinmiyor'}`:''}`)].join('\n');
 return products.map(product=>`${product.code} · ${product.name}`).join('\n');
}
