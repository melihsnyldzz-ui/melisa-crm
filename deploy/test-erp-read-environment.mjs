import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeCrmOrigin,safeImageReference} from '../packages/erp-adapter/services/crmCatalogReadSource.mjs';
import {assertMediaFormat} from '../apps/gateway/src/utils/mediaFormatValidation.js';

export async function loadTestErpReadEnvironment(){
  if(process.env.CRM_ERP_BASELINE_ENV){
    const {default:dotenv}=await import('../apps/gateway/node_modules/dotenv/lib/main.js');
    const result=dotenv.config({path:process.env.CRM_ERP_BASELINE_ENV,override:true,quiet:true});
    if(result.error)throw Error('TEST_ERP_READ_ENV_UNAVAILABLE');
  }
  process.env.SQL_READ_ONLY='true';
}

const roles=new Set(['patron','mudur','personel']);
const deny=(status,code)=>Response.json({success:false,error:{code}},{status,headers:{'cache-control':'no-store'}});
const failure=(status,code)=>Object.assign(Error(code),{status,code});
const maxBytes=10*1024*1024;
export function createTestErpPhotoRead({photoRoot,crmOrigin,transport,getSqlPool,getSqlDriver}){
  const origin=normalizeCrmOrigin(crmOrigin,{loopbackOnly:true});
  if(!photoRoot||![transport,getSqlPool,getSqlDriver].every(value=>typeof value==='function'))throw Error('TEST_PHOTO_READ_DEPENDENCIES_REQUIRED');
  async function actor(request){
    const authorization=request.headers.get('authorization')||'';
    if(!/^Bearer [^\s]+$/.test(authorization))throw failure(401,'CRM_SESSION_REQUIRED');
    const response=await transport(new URL('/auth/me',origin),{method:'GET',headers:{authorization,accept:'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw failure(response.status===401?401:403,'CRM_PHOTO_ACCESS_DENIED');
    const body=await response.json(),current=body.data;
    // /auth/me uses publicCrmUser: active is checked by JWT middleware and
    // deliberately omitted from the DTO. Reject an explicit inactive flag too.
    if(body.success!==true||body.meta?.source!=='crm-auth'||body.meta.catalogRead!==true||!current?.id||current.active===false||!roles.has(current.role)||!Array.isArray(current.permissions)||!current.permissions.includes('crm.view'))throw failure(403,'CRM_PHOTO_ACCESS_DENIED');
    return current;
  }
  return async request=>{
    if(request.method!=='GET')return deny(405,'GET_ONLY');
    let reference;
    try{const url=new URL(request.url);if(url.search||url.hash)return deny(400,'PHOTO_REFERENCE_INVALID');reference=decodeURIComponent(url.pathname);}catch{return deny(400,'PHOTO_REFERENCE_INVALID')}
    if(!safeImageReference(reference))return deny(404,'PHOTO_REFERENCE_INVALID');
    try{
      const current=await actor(request),pool=await getSqlPool(),driver=getSqlDriver();
      const identity=await pool.request().query('SELECT DB_NAME() AS databaseName;');
      if(identity.recordset?.[0]?.databaseName!=='MELISA_ERP_V2')throw failure(503,'ERP_SOURCE_IDENTITY_REQUIRED');
      const metadata=await pool.request().input('filePath',driver.NVarChar(500),reference).query("IF DB_NAME()<>N'MELISA_ERP_V2' THROW 51000,N'ERP_SOURCE_IDENTITY_REQUIRED',1; SELECT TOP(2) file_path AS filePath FROM dbo.vega_product_images WHERE is_active=1 AND is_primary=1 AND file_path=@filePath;");
      if(!metadata.recordset?.length||metadata.recordset.some(row=>row.filePath!==reference))throw failure(404,'PHOTO_NOT_FOUND');
      const directory=await fs.realpath(photoRoot),file=await fs.realpath(path.join(directory,path.basename(reference)));
      const relative=path.relative(directory,file);
      if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw failure(404,'PHOTO_NOT_FOUND');
      const handle=await fs.open(file,'r');let bytes;
      try{
        const stat=await handle.stat();
        if(!stat.isFile()||stat.size<1||stat.size>maxBytes)throw failure(502,'PHOTO_BYTES_REJECTED');
        bytes=await handle.readFile();
        if(bytes.length!==stat.size||bytes.length>maxBytes)throw failure(502,'PHOTO_BYTES_REJECTED');
      }finally{await handle.close()}
      const extension=path.extname(reference).toLowerCase(),mime=extension==='.png'?'image/png':extension==='.webp'?'image/webp':'image/jpeg';
      try{assertMediaFormat(bytes,mime)}catch{throw failure(502,'PHOTO_BYTES_REJECTED')}
      const verified=await actor(request);
      if(String(verified.id)!==String(current.id)||verified.role!==current.role)throw failure(401,'CRM_SESSION_CHANGED');
      return new Response(bytes,{headers:{'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':'inline'}});
    }catch(error){return deny(error.status||(error.code==='ENOENT'?404:503),error.status?error.code:error.code==='ENOENT'?'PHOTO_NOT_FOUND':'TEST_PHOTO_READ_UNAVAILABLE')}
  };
}
