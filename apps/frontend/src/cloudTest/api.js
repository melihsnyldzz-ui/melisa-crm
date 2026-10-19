// Used only by vite.cloud-test.config.mjs. No production authentication imports.
const ROOT = '/api/cloud-test';
const invalid = () => Object.assign(Error('Sentetik TEST yanıtı doğrulanamadı.'), {code:'CLOUD_TEST_INVALID_RESPONSE'});

export function syntheticSession(value) {
  if (!value || typeof value.csrfToken !== 'string' || !value.csrfToken ||
      value.user !== null && (!value.user || value.user.synthetic !== true || ![15,16,17,18].includes(Number(value.user.id)) || typeof value.accessToken !== 'string' || !value.accessToken)) throw invalid();
  return value;
}

export function syntheticProducts(rows) {
  if (!Array.isArray(rows)) throw invalid();
  const seen = new Set();
  return rows.map(row => {
    const id = Number(row.id);
    const name=row.name ?? row.productName;
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id) || typeof row.code !== 'string' || !row.code || typeof name !== 'string' || !name ||
        !Number.isSafeInteger(row.price4) || row.price4 <= 0 || !Number.isSafeInteger(row.stock3) || row.stock3 < 0 || !['TRY','USD','EUR'].includes(row.currency)) throw invalid();
    seen.add(id);
    const priceExact = `${BigInt(row.price4) / 10000n}.${String(BigInt(row.price4) % 10000n).padStart(4,'0')}0000`;
    const unit = {sourceId:'1',label:'ADET',verified:true,factorExact8:'1.00000000'};
    return {
      id:`erp-${id}`,erpProductId:id,code:row.code,name,barcode:row.barcode || '',
      brand:'SENTETİK TEST',type:row.category || 'Sentetik ürünler',names:{},months:[],counts:[],seriesCount:null,
      prices:{[row.currency]:Number(priceExact)},currency:row.currency,priceExact,
      priceVerified:true,stockVerified:true,stock:row.stock3 / 1000,stockAvailable:row.stock3 > 0,
      priceBasis:'piece',unit,unitLabel:unit.label,status:'active',hold:{blocked:false},
      hasSourceImage:false,image:'',isNew:null,
      salePrices:[{id:String(id),unitSourceId:'1',tier:1,isMainUnit:true,currency:row.currency,priceExact,sourceKey:`cloud-synthetic:price:${id}`}],
    };
  });
}

export function createCloudTestApi(fetcher = globalThis.fetch) {
  async function request(path, {method='GET',body,csrfToken,accessToken}={}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw invalid();
    const response = await fetcher(`${ROOT}${path}`, {
      method,credentials:'same-origin',redirect:'error',cache:'no-store',
      headers:{Accept:'application/json',...(body === undefined ? {} : {'Content-Type':'application/json'}),...(csrfToken ? {'X-Cloud-CSRF':csrfToken} : {}),...(accessToken ? {Authorization:`Bearer ${accessToken}`} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    });
    let payload;
    try { payload = await response.json(); } catch { throw Object.assign(invalid(), {status:response.status}); }
    if (!response.ok || payload?.success !== true) throw Object.assign(Error(payload?.error?.message || 'Sentetik TEST işlemi tamamlanamadı.'), {status:response.status,code:payload?.error?.code || ''});
    if (!Object.hasOwn(payload,'data')) throw invalid();
    return payload.data;
  }
  const session = async () => syntheticSession(await request('/session'));
  async function verified(token) {
    const current = await session();
    if (!token || !current.user || current.accessToken !== token) throw Object.assign(Error('Sentetik TEST oturumu değişti. Ekranı yeniden açın.'), {status:401});
    return current;
  }
  const authorized = async (token,path,options={}) => {
    const current = await verified(token);
    return request(path,{...options,csrfToken:current.csrfToken,accessToken:current.accessToken});
  };
  return {
    session,
    async selectActor(actorId) {
      if (![15,16,17,18].includes(Number(actorId))) throw invalid();
      const current = await session();
      return syntheticSession(await request('/session',{method:'POST',body:{actorId:Number(actorId)},csrfToken:current.csrfToken}));
    },
    customers:token => authorized(token,'/customers'),
    async products(token) { return syntheticProducts(await authorized(token,'/catalog')); },
    drafts:token => authorized(token,'/erp/drafts'),
    verify:verified,
    // ERPOrderDialog remains unchanged. Its credentials are deliberately ignored;
    // this cloud-only method verifies the already selected synthetic session.
    async erpLogin(token) { const current=await verified(token);return {accessToken:current.accessToken,user:current.user}; },
    erpV2Customers:(token,erpToken,conversationId,phone,search='') => {
      if (erpToken !== token) return Promise.reject(Object.assign(Error('Sentetik ERP oturumu değişti.'),{status:401}));
      return authorized(token,`/erp/customers?${new URLSearchParams({conversationId:String(conversationId),phone,search})}`);
    },
    erpV2DraftDetail:(token,erpToken,id) => {
      if (erpToken !== token || !/^[0-9a-f-]{36}$/i.test(id)) return Promise.reject(invalid());
      return authorized(token,`/erp/drafts/${encodeURIComponent(id)}`);
    },
    erpV2Draft:(token,erpToken,body) => {
      if (erpToken !== token) return Promise.reject(invalid());
      return authorized(token,'/erp/drafts',{method:'POST',body});
    },
  };
}

export const liveApi = createCloudTestApi();
