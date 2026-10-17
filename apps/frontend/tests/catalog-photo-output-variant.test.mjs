import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCatalogPhotoCache} from '../src/catalog/photoCache.js';
import {attachmentSizeError} from '../src/catalog/exports.js';
import {MAX_FILE_BYTES} from '../src/outboundMedia.js';

const source=readFileSync(new URL('../src/catalog/CatalogBuilder.jsx',import.meta.url),'utf8');
const start=source.indexOf('const run=async(action)=>{'),end=source.indexOf(' const productAction=',start);
assert(start>=0&&end>start,'actual CatalogBuilder output handler must be present');
const handler=source.slice(start,end);
const canonical={id:'erp-1',catalogVersion:'melisa-catalog.v1',hasSourceImage:true,photoStatus:'guarded-path'};
const legacy={...canonical,id:'vega-1',catalogVersion:'existing-stock-v1'};

async function fixture(run,{product=canonical,output='photos',image='',size=1,fetchPhoto}={}){
 const calls=[],generated=[],downloads=[],attached=[],errors=[],busy=[];let current=true;
 const cache=createCatalogPhotoCache({fetchPhoto:async(id,options)=>{calls.push({id,variant:options.variant});if(fetchPhoto)return fetchPhoto(id,options);return new Blob([`synthetic-${options.variant}`]);},urlApi:{createObjectURL:()=>`blob:synthetic-${calls.at(-1).id}-${calls.at(-1).variant}`,revokeObjectURL(){}}});
 const file={name:`synthetic.${output==='photos'?'jpg':'pdf'}`,size};
 const bindings={running:{current:false},pageBusy:false,cooling:false,paged:true,selectedProducts:[product],selected:[product.id],generation:{current:{capture:()=>()=>current}},alive:{current:true},isContextCurrent:()=>true,setBusy:value=>busy.push(value),setMessage(){},setError:value=>{if(value)errors.push(value);},beforeProducts:async()=>{},beforeOutput:async()=>{},output,model:{items:[{id:product.id,image}]},chosenPhoto:product.id,products:[product],loadPhoto:(p,o)=>cache.load(p,o),generatePhoto:async(model,id)=>{generated.push({kind:'photos',model,id});return file;},generatePdf:async(model)=>{generated.push({kind:'pdf',model});return file;},setGenerated(){},URL:{createObjectURL:()=> 'blob:synthetic-output'},downloadFile:value=>downloads.push(value),attachmentSizeError,onAttach:async value=>attached.push(value),customer:{id:'synthetic-customer'},close(){}};
 const actualRun=new Function('bindings',`const {${Object.keys(bindings).join(',')}}=bindings;${handler};return run;`)(bindings);
 try{await run({bindings,cache,calls,generated,downloads,attached,errors,busy,run:actualRun,invalidate(){current=false;}});}finally{cache.clear();}
}

test('canonical selected JPG loads the existing original variant through the real cache',async()=>fixture(async h=>{
 await h.run('download');assert.deepEqual(h.calls,[{id:'erp-1',variant:'original'}]);assert.equal(h.generated[0].model.items[0].image,'blob:synthetic-erp-1-original');assert.equal(h.downloads.length,1);assert.deepEqual(h.errors,[]);
}));
test('canonical PDF retains preview loading',async()=>fixture(async h=>{
 await h.run('download');assert.deepEqual(h.calls,[{id:'erp-1',variant:'preview'}]);assert.equal(h.generated[0].kind,'pdf');assert.equal(h.downloads.length,1);
},{output:'pdf'}));
test('legacy JPG retains preview loading',async()=>fixture(async h=>{
 await h.run('download');assert.deepEqual(h.calls,[{id:'vega-1',variant:'preview'}]);assert.equal(h.downloads.length,1);
},{product:legacy}));
test('canonical JPG does not reuse a preview already present in the export item or cache',async()=>fixture(async h=>{
 const preview=await h.cache.load(canonical);h.bindings.model.items[0].image=preview;await h.run('download');assert.deepEqual(h.calls.map(call=>call.variant),['preview','original']);assert.equal(h.generated[0].model.items[0].image,'blob:synthetic-erp-1-original');
}));
test('canonical JPG reuses the original cache entry rather than fetching a preview',async()=>fixture(async h=>{
 const original=await h.cache.load(canonical,{variant:'original'});await h.run('download');assert.deepEqual(h.calls,[{id:'erp-1',variant:'original'}]);assert.equal(h.generated[0].model.items[0].image,original);
}));
test('original failure does not fall back to preview or create an output',async()=>fixture(async h=>{
 await h.run('download');assert.deepEqual(h.calls,[{id:'erp-1',variant:'original'}]);assert.equal(h.generated.length,0);assert.equal(h.downloads.length,0);assert.equal(h.attached.length,0);assert.deepEqual(h.errors,['Synthetic original failure']);assert.equal(h.busy.at(-1),false);
},{fetchPhoto:async(_id,{variant})=>{if(variant==='original')throw Error('Synthetic original failure');return new Blob(['synthetic-preview']);}}));
test('only the chosen canonical JPG product is loaded',async()=>fixture(async h=>{
 const other={...canonical,id:'erp-2'};h.bindings.products.push(other);h.bindings.selectedProducts.push(other);h.bindings.selected.push(other.id);h.bindings.model.items.push({id:other.id,image:''});await h.run('download');assert.deepEqual(h.calls,[{id:'erp-1',variant:'original'}]);assert.equal(h.generated[0].model.items.length,1);
}));
test('late original after generation invalidation creates no output or download',async()=>{
 let resolve;const photo=new Promise(done=>{resolve=done;});
 await fixture(async h=>{const pending=h.run('download');for(let i=0;i<5&&!h.calls.length;i++)await Promise.resolve();assert.equal(h.calls.length,1);h.invalidate();resolve(new Blob(['synthetic-original']));await pending;assert.equal(h.generated.length,0);assert.equal(h.downloads.length,0);assert.equal(h.attached.length,0);assert.equal(h.busy.at(-1),false);},{fetchPhoto:()=>photo});
});
test('original JPG still observes the existing 3 MiB attachment bound',async()=>fixture(async h=>{
 await h.run('attach');assert.equal(h.generated.length,1);assert.equal(h.attached.length,0);assert.equal(h.downloads.length,0);assert.match(h.errors[0],/3 MB/);
},{size:MAX_FILE_BYTES+1}));
test('legacy preloaded image remains unchanged and does not fetch a photo',async()=>fixture(async h=>{
 await h.run('download');assert.deepEqual(h.calls,[]);assert.equal(h.generated[0].model.items[0].image,'blob:synthetic-legacy-preloaded');assert.equal(h.downloads.length,1);
},{product:legacy,image:'blob:synthetic-legacy-preloaded'}));
