import {customerError,draftItems,operationStore,MAX_ITEMS,newOperationId} from './model.js';
import {createCatalogPhotoCache} from '../catalog/photoCache.js';

export function createRequestController({api,storage,uuid=newOperationId,onChange=()=>{}}) {
  const operations=operationStore(storage);let epoch=0,readSequence=0,active=true,pending=null,expiryTimer=null;
  const aborts=new Set();
  let state={status:'loading',session:null,products:[],meta:null,filters:{search:'',category:'',age:'',page:1,limit:24},busy:false,listBusy:false,error:'',uncertain:false,step:'catalog'};
  const emit=patch=>{if(active){state={...state,...patch};onChange(state);}};
  const current=own=>active&&epoch===own;
  const photos=createCatalogPhotoCache({fetchPhoto:(id,options)=>api.photo(id,options),isCurrent:()=>active});
  const controllerFor=()=>{const controller=new AbortController();aborts.add(controller);return controller;};
  function fail(error,submitting=false){if([401,403,410].includes(error?.status)){epoch++;clearTimeout(expiryTimer);for(const controller of aborts)controller.abort();photos.clear();emit({status:'expired',busy:false,listBusy:false,error:customerError(error),products:[],session:null});}else emit({busy:false,listBusy:false,error:customerError(error,submitting),uncertain:submitting||state.uncertain||state.busy});}
  function failList(error){if([401,403,410].includes(error?.status))fail(error);else emit({listBusy:false,error:customerError(error)});}
  function acceptSession(session){
    if(state.session&&state.session.sessionId!==session.sessionId)throw Object.assign(Error('Customer context changed'),{status:403});
    if(Date.parse(session.expiresAt)<=Date.now())throw Object.assign(Error('Session expired'),{status:410});
    clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>fail({status:410}),Math.min(Date.parse(session.expiresAt)-Date.now(),2147483647));expiryTimer.unref?.();
    if(session.request)operations.clear(session.sessionId);
    const pendingOperation=!session.request&&Boolean(operations.read(session.sessionId));
    emit({session,status:'ready',uncertain:pendingOperation,step:session.request?'success':pendingOperation?'review':state.step,error:pendingOperation?'Talebin kaydı henüz doğrulanamadı. Aynı talebi yeniden kontrol edebilirsiniz.':''});
  }
  async function run(action,{submitting=false}={}){
    if(!active||state.status==='expired')return null;
    if(pending)return pending;
    const own=epoch,controller=controllerFor();emit({busy:true,error:''});
    pending=(async()=>{try{const session=await action(controller.signal);if(current(own)){acceptSession(session);emit({busy:false});return session;}return null;}catch(error){if(current(own))fail(error,submitting);return null;}finally{aborts.delete(controller);pending=null;}})();
    return pending;
  }
  const result={
    getState:()=>state,
    async open(){const session=await run(signal=>api.session({signal}));if(session&&!session.request)await result.search(state.filters);return session;},
    async search(filters){if(!active||state.status!=='ready')return;const own=epoch,sequence=++readSequence,controller=controllerFor();emit({listBusy:true,error:'',filters:{...state.filters,...filters}});try{const value=await api.products(state.filters,{signal:controller.signal});if(current(own)&&sequence===readSequence)emit({...value,listBusy:false});}catch(error){if(current(own)&&([401,403,410].includes(error?.status)||sequence===readSequence))failList(error);}finally{aborts.delete(controller);}},
    review(){if(!state.busy&&!state.listBusy&&state.session?.draft.items.length)emit({step:'review',error:''});},
    browse(){if(!state.busy&&!state.uncertain&&!state.session?.request)emit({step:'catalog',error:''});},
    async edit(items){if(!state.session||state.session.request||state.busy||state.uncertain)return null;let normalized;try{normalized=draftItems(items);}catch(error){emit({error:error.message});return null;}return run(signal=>api.updateDraft(state.session.draft.revision,normalized,{signal}));},
    async toggle(product){const items=state.session?.draft.items||[];if(items.some(item=>item.productId===product.id))return result.edit(items.filter(item=>item.productId!==product.id));if(items.length>=MAX_ITEMS){emit({error:'En fazla 50 ürün seçebilirsiniz.'});return null;}return result.edit([...items,{productId:product.id,quantity:1}]);},
    async submit(){if(!state.session||state.session.request||state.busy||!state.session.draft.items.length)return null;let operationId=operations.read(state.session.sessionId);if(state.uncertain&&!operationId){emit({error:'Seçim kaydını yeniden kontrol ederek devam edin.'});return null;}try{if(!operationId){operationId=uuid();operations.write(state.session.sessionId,operationId);}}catch(error){emit({error:error.message});return null;}return run(signal=>api.submit(state.session.draft.revision,operationId,{signal}),{submitting:true});},
    async reconcile(){const session=await run(signal=>api.session({signal}));if(session&&!session.request&&!state.uncertain){emit({uncertain:false});await result.search(state.filters);}return session;},
    async photo(product){try{return await photos.load({...product,hasSourceImage:true,photoStatus:'guarded-path'},{variant:'original'});}catch(error){if(active&&[401,403,410].includes(error?.status))fail(error);throw error;}},
    dispose(){active=false;epoch++;readSequence++;clearTimeout(expiryTimer);for(const controller of aborts)controller.abort();aborts.clear();photos.clear();},
  };
  return result;
}
