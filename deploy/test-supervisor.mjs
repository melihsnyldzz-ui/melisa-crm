import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of ['CRM_BASELINE_ENV','CRM_ERP_API_ROOT'])if(!process.env[name]||!fs.existsSync(process.env[name]))throw Error(name+'_REQUIRED');
const ports=[62400,62401,62402,62403];for(const port of ports)await new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();reject(Error('TEST_PORT_IN_USE_'+port));});socket.once('error',resolve);});
const runtime=path.join(root,'runtime','test-completion');fs.mkdirSync(runtime,{recursive:true});const children=new Map();let stopping=false;
function start(file){if(stopping)return;const log=fs.openSync(path.join(runtime,file+'.log'),'a');const child=spawn(process.execPath,[path.join(root,'deploy',file)],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);children.set(file,child);fs.writeFileSync(path.join(runtime,'processes.json'),JSON.stringify({supervisor:process.pid,root,children:Object.fromEntries([...children].map(([name,p])=>[name,p.pid]))}));child.once('exit',()=>{children.delete(file);if(!stopping)setTimeout(()=>start(file),3000);});}
for(const file of ['test-erp-catalog.mjs','test-erp-orders.mjs','test-server.mjs'])start(file);
function stop(){stopping=true;for(const child of children.values())child.kill();setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
