// Optional source-only browser fixture: real production UI + gateway routes;
// all private files are RAM adapters and all people/customers are synthetic.
// Run from repo root with scripts/ci/offline-guard.mjs after the clean build.
import express from '../../../../apps/gateway/node_modules/express/index.js';
import {fileURLToPath} from 'node:url';
import {createManagementFixture} from '../../../../apps/gateway/src/routes/fixtures/cleanManagementFixture.mjs';
import {env} from '../../../../apps/gateway/src/config/env.js';

// A public, disposable fixture credential. It cannot authenticate on any
// installed/shared CRM, and is never written to its configured private paths.
const f=await createManagementFixture({password:'Offline-B5-CRM-20261024'});
const web=express();web.use('/api/live',f.app);
const assets=fileURLToPath(new URL('../../../../apps/frontend/dist/client/',import.meta.url));
web.use(express.static(assets));
web.get('*',(_req,res)=>res.sendFile(fileURLToPath(new URL('../../../../apps/frontend/dist/client/index.html',import.meta.url))));
const listener=web.listen(0,'127.0.0.1',()=>{const origin=`http://127.0.0.1:${listener.address().port}`;env.cors.origins=[origin];console.log(`SYNTHETIC_MANAGEMENT_BROWSER ${origin}`);});
async function close(){listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await f.close();process.exit(0);}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
process.stdin.resume();process.stdin.on('data',value=>{if(String(value).trim()==='quit')void close();});
