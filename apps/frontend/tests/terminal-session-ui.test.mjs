import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('actual linked login screen omits a second password while the ordinary CRM login remains available',async()=>{
 const frontend=fileURLToPath(new URL('../',import.meta.url)),file=join(frontend,'.sites-runtime','terminal-session-ui-test.mjs');
 mkdirSync(join(frontend,'.sites-runtime'),{recursive:true});
 try{
  const source=readFileSync(join(frontend,'src','App.jsx'),'utf8'),start=source.indexOf('function LoginGate('),end=source.indexOf('\nfunction messageClock',start);
  assert(start>0&&end>start);
  await build({absWorkingDir:frontend,tsconfigRaw:{},stdin:{contents:"import React from 'react';import {Butterfly} from '@phosphor-icons/react';\n"+source.slice(start,end)+'\nexport {LoginGate};',resolveDir:frontend,loader:'jsx'},
   outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react']});
  const {LoginGate}=await import(pathToFileURL(file).href);
  const base={credentials:{username:'',password:''},onChange(){},onConnect(){},onRetry(){},onChangeAccount(){}};
  const ordinary=renderToStaticMarkup(React.createElement(LoginGate,base));assert.match(ordinary,/type="password"/);assert.match(ordinary,/Kullanıcı adı/);
  const linked=renderToStaticMarkup(React.createElement(LoginGate,{...base,terminal:true,linkedTerminal:true,retryAvailable:true,onChangeAccount:null,
   error:'Terminal hesabının CRM bağlantısı doğrulanamadı. ERP oturumunu kontrol edin.'}));
  assert.match(linked,/Müşterilerim/);assert.match(linked,/Terminal oturumunuz ve CRM hesabınız doğrulanıyor/);assert.match(linked,/Bağlantıyı yeniden dene/);
  assert.doesNotMatch(linked,/type="password"|Kullanıcı adı|Farklı hesapla giriş yap|TEST ADMIN|Semih olarak devam et/);
 }finally{rmSync(file,{force:true});}
});
