// Owns the page's controller across browser navigation and React cleanup.
export function createCustomerRequestLifecycle({target,createController,onChange,onController}) {
  let controller=null,generation=0,hidden=false,terminal=false;
  const stop=(notify=true)=>{generation++;controller?.dispose();controller=null;if(notify)onController(null);};
  const start=()=>{
    if(terminal)return;
    const own=++generation;
    // Never render a cached selection or success while the server is being checked.
    onChange({status:'loading',session:null,products:[],meta:null,busy:false,listBusy:false,error:'',uncertain:false,step:'catalog'});
    controller=createController(view=>{
      if(terminal||hidden||generation!==own)return;
      if(view.status==='expired')terminal=true;
      onChange(view);
    });
    onController(controller);
    void controller.open();
  };
  const hide=()=>{hidden=true;stop();if(!terminal)onChange({status:'loading',session:null,products:[],meta:null,busy:false,listBusy:false,error:'',uncertain:false,step:'catalog'});};
  const show=event=>{if(event.persisted&&hidden&&!terminal){hidden=false;start();}};
  target.addEventListener('pagehide',hide);
  target.addEventListener('pageshow',show);
  start();
  return {
    close(){terminal=true;stop();},
    dispose(){terminal=true;target.removeEventListener('pagehide',hide);target.removeEventListener('pageshow',show);stop(false);},
  };
}
