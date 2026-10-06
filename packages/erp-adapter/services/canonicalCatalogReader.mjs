import {canonicalProduct,canonicalMeta,parseCrmProductId} from './canonicalCatalog.mjs';
const fail=(status,code)=>Response.json({success:false,error:{code,message:'ERP ürün bilgisine şu anda ulaşılamıyor.'}},{status,headers:{'cache-control':'no-store'}});
export function assertCatalogTestIdentity(h){if(h.environment!=='CANONICAL_TEST'||h.databaseName!=='MELISA_ERP_SIRKET_TEST_20260929_01'||h.serverName!=='Semih\\MELISADEV'||h.port!==4144||h.mode!=='erp'||h.liveDatabaseAccess!==0||h.sysadmin!==0||h.databaseControl!==0||h.writes!==true||h.externalOperations!==false)throw Error('ERP_SOURCE_IDENTITY_REQUIRED');}
export function createCanonicalCatalogReader({transport=fetch,erpOrigin='http://127.0.0.1:4144',crmOrigin='http://127.0.0.1:62401',getErpAuthorization}={}){
 const root=new URL(erpOrigin);if(root.origin!=='http://127.0.0.1:4144'||root.pathname!=='/'||root.search||root.hash||root.username||root.password)throw Error('ERP_TEST_ORIGIN_REQUIRED');
 const call=async(path,options={})=>transport(new URL(path,erpOrigin),{cache:'no-store',redirect:'error',...options});
 return async request=>{try{
  const url=new URL(request.url),prefix='/api/crm-catalog/products',tail=url.pathname.slice(prefix.length);
  if(request.method!=='GET'||!url.pathname.startsWith(prefix)||! /^(?:|\/erp-[1-9]\d*(?:\/photo)?)$/.test(tail))return fail(404,'ROUTE_NOT_ALLOWED');
  const authorization=request.headers.get('authorization');if(!/^Bearer [^\s]+$/.test(authorization||''))return fail(401,'CURRENT_CRM_SESSION_REQUIRED');
  const response=await transport(new URL('/auth/me',crmOrigin),{headers:{authorization},redirect:'error',cache:'no-store',signal:request.signal});
  const actorPayload=await response.json(),actor=actorPayload.data;if(!response.ok||!actor?.id||!actor.permissions?.includes('crm.view'))return fail(403,'CRM_CATALOG_SCOPE_REQUIRED');
  const health=await call('/test-health',{signal:request.signal});if(!health.ok)throw Error('ERP_SOURCE_IDENTITY_REQUIRED');const body=await health.json();assertCatalogTestIdentity(body.data??body);
  const query=Object.fromEntries(url.searchParams),nativeQuery=new URLSearchParams();
  for(const [key,value]of url.searchParams){if(tail.endsWith('/photo')&&key==='variant'&&url.searchParams.getAll(key).length===1&&['thumbnail','preview'].includes(value))continue;if(tail||!['search','barcode','brand','category','hasImage','page','limit'].includes(key)||url.searchParams.getAll(key).length!==1)return fail(400,'INVALID_QUERY');if(['search','barcode','brand','category'].includes(key)&&value.length>120||['page','limit'].includes(key)&&(!/^[1-9]\d*$/.test(value)||+value>Number.MAX_SAFE_INTEGER||key==='limit'&&+value>50)||key==='hasImage'&&!['true','false'].includes(value))return fail(400,'INVALID_QUERY');nativeQuery.set(key==='category'?'productType':key==='hasImage'?'image':key,key==='hasImage'?(value==='true'?'available':'all'):value);}
  if(!nativeQuery.has('limit'))nativeQuery.set('limit','50');
  const id=tail?parseCrmProductId(tail.split('/')[1]):null,nativePath=id?`/api/catalog/products/${id}`:`/api/catalog/products?${nativeQuery}`;
  async function read(path,accept='application/json'){let auth=await getErpAuthorization();if(!/^Bearer [^\s]+$/.test(auth||''))throw Error('ERP_AUTH_REQUIRED');let r=await call(path,{headers:{authorization:auth,accept},signal:request.signal});if(r.status===401){auth=await getErpAuthorization({refresh:true});r=await call(path,{headers:{authorization:auth,accept},signal:request.signal});}return r;}
  const r=await read(nativePath);if(!r.ok)return fail(r.status===404?404:503,r.status===404?'PRODUCT_NOT_FOUND':'ERP_CATALOG_UNAVAILABLE');
  const payload=await r.json();if(payload.success!==true)throw Error('ERP_CATALOG_LIST_CONTRACT');const meta=canonicalMeta(payload.meta,query,actor),data=id?canonicalProduct(payload.data):payload.data.map(canonicalProduct);
  if(id&&data.erpProductId!==id)throw Error('ERP_CATALOG_PRODUCT_CONTRACT');
  if(tail.endsWith('/photo')){if(!data.photoPath)return fail(404,'VERIFIED_PHOTO_PATH_REQUIRED');const photo=await read(`/api/catalog/products/${id}/photo?variant=${url.searchParams.get('variant')||'preview'}`,'image/jpeg,image/png,image/webp');if(!photo.ok)return fail(503,'PHOTO_REJECTED');return new Response(await photo.arrayBuffer(),{status:200,headers:{'content-type':photo.headers.get('content-type')||'application/octet-stream','cache-control':'no-store'}});}
  return Response.json({success:true,data,meta},{headers:{'cache-control':'no-store'}});
 }catch{return fail(503,'ERP_CATALOG_UNAVAILABLE');}};
}
