import {exactPriceText} from './productActions.js';
import { MAX_FILE_BYTES } from '../outboundMedia.js';
import { copy, money, stockLabel, assertCatalogExportAllowed } from './model.js';
export function outputFileName(model,ext,id=''){const safe=String(id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);return `melisa-katalog${safe?`-${safe}`:''}-${model.language}-${model.showPrices?model.currency:'fiyatsiz'}.${ext}`;}
export function attachmentSizeError(size){return size>MAX_FILE_BYTES?'Katalog 3 MB sınırını aşıyor. Daha az ürün seçin veya fotoğrafları tek tek ekleyin. Dosya sessizce sıkıştırılmadı.':'';}
export async function loadProductPhoto(src){
 if(!src)return null;
 return new Promise((resolve,reject)=>{const img=new Image();let timer;const fail=()=>{clearTimeout(timer);reject(new Error('Ürün fotoğrafı yüklenemedi. Kaynaktaki fotoğraf erişimini kontrol edin.'));};img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=fail;timer=setTimeout(fail,15000);img.src=src;});
}
export function drawProductPhoto(ctx,image,x,y,w,h,placeholder=''){
 ctx.fillStyle='#f1f4f2';ctx.fillRect(x,y,w,h);
 if(!image){ctx.fillStyle='#667781';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText(placeholder,x+w/2,y+h/2);ctx.textAlign='left';return;}
 const scale=Math.min(w/image.width,h/image.height),width=image.width*scale,height=image.height*scale;ctx.drawImage(image,x+(w-width)/2,y+(h-height)/2,width,height);
}
function priceText(item,model,c){if(item.price==null)return c.priceUnverified;return `${Object.hasOwn(item,'priceExact')?`${model.currency} ${exactPriceText(item.priceExact)||c.priceUnverified}`:money(item.price,model.currency,model.language)} / ${Object.hasOwn(item,'unitLabel')?(item.unitLabel||({tr:'birim bilinmiyor',en:'unit unknown',fr:'unité inconnue'}[model.language])):c.unit}${item.seriesPrice==null?'':` · ${money(item.seriesPrice,model.currency,model.language)} / ${c.pack}`}`;}
export async function generatePdf(model){
 assertCatalogExportAllowed(model);
 if(!model.items.length)throw new Error('Önce en az bir ürün seçin.');
 const [{jsPDF},{default:font}]=await Promise.all([import('jspdf'),import('./font.js')]);
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});pdf.addFileToVFS('Catalog.ttf',font);pdf.addFont('Catalog.ttf','Catalog','normal');pdf.setFont('Catalog');
 const c=copy[model.language],total=Math.ceil(model.items.length/4),canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
 for(let page=0;page<total;page++){
  if(page)pdf.addPage();pdf.setFillColor('#075e54');pdf.rect(0,0,210,31,'F');pdf.setTextColor('#ffffff');pdf.setFontSize(18);pdf.text(pdf.splitTextToSize(model.title,180).slice(0,1),14,15);pdf.setFontSize(9);pdf.text('MELİSA BABY',14,24);pdf.setTextColor('#667781');pdf.setFontSize(8);pdf.text(pdf.splitTextToSize(model.notice,180).slice(0,2),14,39);pdf.text(c.noSplit,14,48);
  const items=model.items.slice(page*4,page*4+4);
  for(let index=0;index<items.length;index++){
   const p=items[index],x=14+(index%2)*94,y=52+Math.floor(index/2)*110;
   const image=await loadProductPhoto(p.image);drawProductPhoto(ctx,image,0,0,512,512,c.photoMissing);
   try{pdf.addImage(canvas.toDataURL('image/jpeg',0.88),'JPEG',x,y,53,53,`product-${page}-${index}`);}catch{throw new Error('Ürün fotoğrafı çıktı için okunamıyor. Fotoğraf kaynağı izin vermiyor.');}
   pdf.setTextColor('#667781');pdf.setFontSize(8);pdf.text(pdf.splitTextToSize([p.brand,p.code||p.id].filter(Boolean).join(' · '),87).slice(0,1),x,y+60);pdf.setTextColor('#172b35');pdf.setFontSize(10);pdf.text(pdf.splitTextToSize(p.name,87).slice(0,2),x,y+66);pdf.setFontSize(8);pdf.text(p.seriesCount==null?c.seriesUnknown:`${c.series} · ${p.seriesCount} ${c.pieces}`,x,y+77);pdf.setTextColor('#4b606a');pdf.text(pdf.splitTextToSize(p.series,87).slice(0,3),x,y+83);pdf.text(stockLabel(p.stock,model.language,null,p.stockVerified),x,y+96);
   if(model.showPrices){pdf.setTextColor('#075e54');pdf.setFontSize(8);pdf.text(pdf.splitTextToSize(priceText(p,model,c),87).slice(0,2),x,y+103);}
  }
  pdf.setTextColor('#667781');pdf.setFontSize(8);pdf.text(`${c.sample} · ${c.page} ${page+1}/${total}`,14,287);
 }
 pdf.setProperties({title:model.title,subject:model.notice,author:'Melisa Baby'});return new File([pdf.output('arraybuffer')],outputFileName(model,'pdf'),{type:'application/pdf'});
}
function wrapCanvas(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){let line='',offset=0;for(const word of String(text).split(' ')){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxWidth&&line){ctx.fillText(line,x,y+offset);offset+=lineHeight;if(offset>=maxLines*lineHeight)return offset;line=word;}else line=next;}ctx.fillText(line,x,y+offset);return offset+lineHeight;}
export async function generatePhoto(model,id){
 assertCatalogExportAllowed(model);
 const item=model.items.find(p=>p.id===id);if(!item)throw new Error('Fotoğraf için bir ürün seçin.');if(!item.image)throw new Error('Bu ürünün kaynakta fotoğrafı yok.');const image=await loadProductPhoto(item.image);await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=1220;const ctx=canvas.getContext('2d'),c=copy[model.language];ctx.fillStyle='#ffffff';ctx.fillRect(0,0,960,1220);ctx.fillStyle='#075e54';ctx.fillRect(0,0,960,95);ctx.fillStyle='white';ctx.font='600 30px Inter, sans-serif';ctx.fillText('MELİSA BABY',40,59);drawProductPhoto(ctx,image,120,112,720,720);ctx.fillStyle='#667781';ctx.font='22px Inter, sans-serif';ctx.fillText([item.brand,item.code||item.id].filter(Boolean).join(' · '),40,863);ctx.fillStyle='#172b35';ctx.font='600 29px Inter, sans-serif';wrapCanvas(ctx,item.name,40,908,870,34,2);ctx.font='22px Inter, sans-serif';ctx.fillText(item.seriesCount==null?c.seriesUnknown:`${c.series} · ${item.seriesCount} ${c.pieces}`,40,977);ctx.fillStyle='#526672';wrapCanvas(ctx,item.series,40,1013,870,26,2);ctx.fillText(stockLabel(item.stock,model.language,null,item.stockVerified),40,1082);
 if(model.showPrices){ctx.fillStyle='#075e54';ctx.font='600 22px Inter, sans-serif';wrapCanvas(ctx,priceText(item,model,c),40,1119,870,26,2);}
 ctx.fillStyle='#667781';ctx.font='16px Inter, sans-serif';wrapCanvas(ctx,c.noSplit,40,1165,870,18,1);wrapCanvas(ctx,model.notice,40,1186,880,18,2);let blob;try{blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.92));}catch{throw new Error('Ürün fotoğrafı çıktı için okunamıyor. Fotoğraf kaynağı izin vermiyor.');}if(!blob)throw new Error('Fotoğraf oluşturulamadı.');return new File([blob],outputFileName(model,'jpg',id),{type:'image/jpeg'});
}
export function downloadFile(file){const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
