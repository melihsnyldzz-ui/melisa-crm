import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReadPlan,executeRead} from './crmExistingStockReadWorker.mjs';
const options={page:1,limit:12,offset:0,hasImage:true,search:'SÜPERMİNİ',brand:'Marka',category:'Kategori'};
test('large validated image scope stays bounded and contains only typed XML data',()=>{
 const ids=Array.from({length:2000},(_,i)=>i+1),plan=buildReadPlan(options,ids);
 assert.equal(plan.bindings.length,7);const image=plan.bindings.find(binding=>binding[0]==='imageIds');
 assert.equal(image[1],'Xml');assert.equal(image[2],'<ids>'+ids.map(id=>'<id>'+id+'</id>').join('')+'</ids>');
 assert(plan.sql.length<5000);assert(!plan.sql.includes('@imageId0'));assert.match(plan.sql,/CONVERT\(xml,@imageIds\)/);assert.match(plan.sql,/\.nodes\('\/ids\/id'\)/);
 assert.deepEqual(plan.bindings.find(binding=>binding[0]==='search'),['search','NVarChar','%SÜPERMİNİ%']);
 for(const invalid of [[1,1],[0],[-1],[1.2],['1'],['1</id>'],[Number.MAX_SAFE_INTEGER+1],Array.from({length:2001},(_,i)=>i+1)])assert.throws(()=>buildReadPlan(options,invalid),/IMAGE_SCOPE_INVALID/);
});
test('empty eligibility and detail preserve scope without unused image parameters',()=>{
 const empty=buildReadPlan(options,[]);assert.equal(empty.bindings.length,6);assert(!empty.sql.includes('@imageIds'));assert.match(empty.sql,/1=0/);
 const detail=buildReadPlan({id:7},[7,9]);assert.deepEqual(detail.bindings,[['id','BigInt',7]]);assert(!detail.sql.includes('@imageIds'));
 assert.match(detail.sql,/s\.IND=@id/);assert.match(detail.sql,/SUM\(ISNULL\(GIREN,0\)-ISNULL\(CIKAN,0\)\)/);
});
test('facet filters exclude their own dimension and pagination retains exact ordering',()=>{
 const {sql}=buildReadPlan(options,[7]);const facetStatements=sql.split(';').filter(part=>part.includes('SELECT TOP(501)'));
 assert.equal(facetStatements.length,2);assert(facetStatements[0].includes('@category'));assert(!facetStatements[0].includes('@brand'));
 assert(facetStatements[1].includes('@brand'));assert(!facetStatements[1].includes('@category'));
 for(const facet of facetStatements){assert(facet.includes('@search'));assert(facet.includes('imageScope.id IS NOT NULL'));assert(facet.includes(".nodes('/ids/id')"));assert(facet.includes('INNER LOOP JOIN'));}
 assert.equal((sql.match(/INNER LOOP JOIN/g)||[]).length,4);assert(!sql.includes('@hasImage=0'));
 const all=buildReadPlan({...options,hasImage:false},[7]).sql;assert.equal((all.match(/LEFT HASH JOIN/g)||[]).length,4);assert(!all.includes('INNER LOOP JOIN'));assert.match(all,/CASE WHEN 1=1 THEN 1 ELSE 0 END/);
 const none=buildReadPlan({...options,hasImage:false},[]).sql;assert(!none.includes('JOIN'));assert.match(none,/CASE WHEN 1=0 THEN 1 ELSE 0 END/);
 assert.match(sql,/ORDER BY s\.KARTINACILMATARIHI DESC,s\.IND DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY/);
 assert.match(sql,/ORDER BY p\.internal_page_date DESC,CONVERT\(bigint,p\.source_id\) DESC/);
 assert.match(sql,/u\.SATISFIYATI1 AS sale_price,u\.PB1 AS sale_currency/);
});
const row={source_id:'7',stock_code:'007',product_name:'Ürün',brand:'Marka',category:'Kategori',sale_price:196,sale_currency:'TL',stock_quantity:null,is_active:true};
const records=()=>[[{databaseName:'VEGA2026'}],[{total:'1',totalPhotoEligible:'1'}],[row],[{value:'Marka',count:'1'}],[{value:'Kategori',count:'1'}],[{databaseName:'VEGA2026'}]];
async function execute(sets,opts=options,ids=[7]){
 const bound=[];let statement;const driver={Xml:Symbol('Xml'),BigInt:Symbol('BigInt'),Bit:Symbol('Bit'),Int:Symbol('Int'),NVarChar:length=>length};
 const result=await executeRead({options:opts,eligibleIds:ids,driver,getPool:async()=>({request:()=>({input(...args){bound.push(args);return this;},async query(sql){statement=sql;return{recordsets:sets};}})})});return{result,bound,statement,driver};
}
test('executeRead preserves same-batch identity, typed XML, prices, null quantity and scoped counts',async()=>{
 const {result,bound,statement,driver}=await execute(records());assert.equal(bound.length,7);assert.equal(bound[0][1],driver.Xml);
 assert.match(statement,/^IF DB_NAME\(\)<>N'VEGA2026'/);assert.equal((statement.match(/SELECT DB_NAME\(\) AS databaseName/g)||[]).length,2);
 assert.deepEqual(result.rows,[row]);assert.deepEqual(result.counts,{total:1,totalPhotoEligible:1});assert.deepEqual(result.brands,[{value:'Marka',count:1}]);
 const unknown=records();unknown[2]=[{...row,sale_price:'196',stock_quantity:'0'}];assert.equal((await execute(unknown)).result.rows[0].sale_price,null);assert.equal((await execute(unknown)).result.rows[0].stock_quantity,null);
 for(const index of [0,5]){const bad=records();bad[index]=[{databaseName:'OTHER'}];await assert.rejects(execute(bad),/ERP_PRODUCT_SOURCE_IDENTITY_REQUIRED/);}
 const wrongScope=records();await assert.rejects(execute(wrongScope,options,[8]),/ERP_PHOTO_SCOPE_REQUIRED/);
 const empty=records();empty[1]=[{total:'0',totalPhotoEligible:'0'}];empty[2]=[];empty[3]=[];empty[4]=[];assert.deepEqual((await execute(empty,options,[])).result.rows,[]);
});
