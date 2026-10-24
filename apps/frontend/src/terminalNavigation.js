const ERP_HOSTS = new Set(['127.0.0.1', '192.168.1.46']);
export function terminalEntry(location = globalThis.location) {
  const params = new URLSearchParams(location?.search || '');
  const enabled = params.getAll('terminal').length === 1 && params.get('terminal') === '1';
  const cleanChild = ['http://127.0.0.1:62800','http://192.168.1.46:62800'].includes(location?.origin);
  let erpOrigin = null;
  if (enabled && params.getAll('erpOrigin').length === 1) {
    try {
      const raw = params.get('erpOrigin'), url = new URL(raw);
      if (url.protocol === 'http:' && ERP_HOSTS.has(url.hostname) && (cleanChild ? url.port==='5244' : ['http://127.0.0.1:62700','http://192.168.1.46:62700'].includes(location.origin) ? url.port==='5234' : (url.port === '5194' || ['http://127.0.0.1:62600','http://192.168.1.46:62600'].includes(location.origin) && url.port === '5224'))
        && url.origin === raw && url.hostname === location.hostname && !url.username && !url.password) erpOrigin = raw;
    } catch {}
  }
  return { enabled, erpOrigin };
}
export function bindTerminalNavigation({ window: win = globalThis.window, entry, onActivate = () => {}, onLogout = async () => {}, deferReady = false }) {
  const allowed = entry?.enabled && entry.erpOrigin && win.parent !== win;
  let generation=0,closed=false;
  const notify = action => { if (allowed) win.parent.postMessage({ type: 'melisa-terminal-child', version: 1, action }, entry.erpOrigin); };
  const receive = event => {
    const data = event.data;
    if (!allowed || event.source !== win.parent || event.origin !== entry.erpOrigin || !data || Array.isArray(data)
      || Object.keys(data).sort().join(',') !== 'action,type,version'
      || data.type !== 'melisa-terminal-parent' || data.version !== 1 || !['activate','logout'].includes(data.action)) return;
    const epoch=++generation;
    const done=action=>{if(!closed&&epoch===generation)notify(action);};
    try {
      const result=data.action==='logout'?onLogout():onActivate();
      const action=data.action==='logout'?'logged-out':'ready';
      if(result&&typeof result.then==='function')Promise.resolve(result).then(()=>done(action),()=>done('unavailable'));
      else done(action);
    }catch{done('unavailable');}
  };
  win.addEventListener('message', receive); if(!deferReady)notify('ready');
  return { home: () => notify('home'), unavailable: () => notify('unavailable'), close: () => {closed=true;generation++;win.removeEventListener('message', receive);} };
}
export function bindTerminalSessionNavigation({sessionLoader,onActivated=()=>{},onClose=async()=>{},...options}){
 return bindTerminalNavigation({...options,deferReady:true,onActivate:async()=>{
  const result=await sessionLoader.start();if(!result)throw Error('Terminal identity unavailable');onActivated();
 },onLogout:async()=>{const closed=sessionLoader.close();await Promise.all([closed,onClose()]);}});
}
export function catalogConversationHeaders(conversationId) {
  if (conversationId === undefined || conversationId === null) return {};
  const id = String(conversationId);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw Error('Konuşma bağlamı doğrulanamadı.');
  return { 'x-crm-conversation-id': id };
}
