export function selectedSaleLines(products){
 if(!Array.isArray(products)||!products.length)throw Error('Önce ürün seçin.');
 return products.map(product=>{
  const currency=product.currency,price=product.prices?.[currency];
  if(!['TRY','USD','EUR'].includes(currency)||typeof price!=='number'||!Number.isFinite(price)||price<=0)throw Error(`${product.code||product.name}: satış fiyatı ve para birimi doğrulanamadı.`);
  return {id:product.id,stockCode:product.code,name:product.name,currency,unitPrice:price};
 });
}
export function selectionMessage(products,priced=false){
 if(priced)return ['Kayıtlı satış fiyatları · adet fiyatı',...selectedSaleLines(products).map(line=>`${line.stockCode} · ${line.name} · ${line.currency} ${line.unitPrice.toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}`)].join('\n');
 return products.map(product=>`${product.code} · ${product.name}`).join('\n');
}
