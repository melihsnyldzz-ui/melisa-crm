import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const sheet=postcss.parse(readFileSync(new URL('../src/terminal.css',import.meta.url),'utf8'));
const scope='.app-shell.redesigned.whatsapp-ui.terminal-entry';
const compact=sheet.nodes.find(node=>node.type==='atrule'&&node.name==='media'&&node.params==='(max-width:760px)'&&node.nodes.some(rule=>rule.selector===scope+' .chat-scroll'));
function declarations(suffix){
 const rule=compact.nodes.find(node=>node.type==='rule'&&node.selector===scope+' '+suffix);
 assert.ok(rule,`Missing scoped terminal conversation rule: ${suffix}`);
 return Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
}

test('message history keeps the remaining flex space while a large draft/action area scrolls independently',()=>{
 const history=declarations('.chat-scroll'),composer=declarations('.composer-area');
 assert.equal(history.flex,'1 1 auto');
 assert.equal(history['min-height'],'0');
 assert.equal(composer['max-height'],'50%');
 assert.equal(composer['overflow-y'],'auto');
 assert.equal(composer['overscroll-behavior'],'contain');
 const textarea=declarations('.composer-row textarea');
 assert.ok(parseFloat(textarea['min-height'])>=44);
 assert.ok(parseFloat(textarea['font-size'])>=16);
 assert.ok(parseFloat(textarea['max-height'])>=parseFloat(textarea['min-height']));
});

test('permission explanation and renewal stay visible; only dormant disabled AI has a hiding rule',()=>{
 assert.equal(declarations('.send-permission-notice')['flex-wrap'],'nowrap');
 assert.equal(declarations('.send-permission-notice > span')['min-width'],'0');
 assert.ok(parseFloat(declarations('.chat-header').height)>=44);
 const hidden=[];
 compact.walkDecls('display',decl=>{if(decl.value==='none')hidden.push(decl.parent.selector);});
 assert.deepEqual(hidden,[scope+' .sales-suggestion:has(> .sales-suggestion-request > .sales-suggestion-trigger:disabled):not(:has(.sales-suggestion-panel))']);
 for(const rule of compact.nodes.filter(node=>node.type==='rule'))assert.ok(rule.selector.startsWith(scope+' '),'Conversation compacting must remain terminal-only');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/className="send-permission-notice" role="status"/);
 assert.match(app,/Bu hesabın mesaj gönderme yetkisi yok/);
 assert.match(app,/Gönderim iznini yenile/);
 assert.match(app,/className="send-button"[^\n]*!liveSession\.liveSendEnabled/);
});
