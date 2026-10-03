// Captured-session sign-out is attempted once; local cleanup never waits for it.
export function closeCatalogSession({disconnect,clearPhotos,clearLocal,explicitLogout=true}={}) {
  let pending=Promise.resolve(),invoked=false,failedSynchronously=false;
  try { if(explicitLogout&&typeof disconnect==='function'){invoked=true;pending=Promise.resolve(disconnect());} }
  catch { failedSynchronously=true; }
  try { clearPhotos?.(); } finally { clearLocal?.(); }
  return pending.then(()=>({serverSignOutConfirmed:invoked&&!failedSynchronously}),()=>({serverSignOutConfirmed:false}));
}
