// Vite's CSS modules import its client even when server.hmr/ws are disabled.
// Preserve only local stylesheet mounting; this fixture runtime has no sockets.
export const offlineViteClient=`
const styles = new Map();
export function updateStyle(id, css) {
 let element=styles.get(id);
 if(!element){element=document.createElement('style');element.dataset.viteDevId=id;document.head.appendChild(element);styles.set(id,element);}
 element.textContent=css;
}
export function removeStyle(id){styles.get(id)?.remove();styles.delete(id);}
export function createHotContext(){return {data:{},accept(){},prune(){},dispose(){},on(){},off(){},invalidate(){}};}
export function injectQuery(url,query){return url+(url.includes('?')?'&':'?')+query;}
`;
