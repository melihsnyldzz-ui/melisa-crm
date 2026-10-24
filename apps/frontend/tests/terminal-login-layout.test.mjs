import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const sheet=postcss.parse(readFileSync(new URL('../src/terminal.css',import.meta.url),'utf8'));
const compact=sheet.nodes.find(node=>node.type==='atrule'&&node.name==='media'&&node.params==='(max-width:760px)');
function declarations(selector){
 const rule=compact.nodes.find(node=>node.type==='rule'&&node.selector===selector);
 assert.ok(rule,`Missing terminal login rule: ${selector}`);
 return Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
}

test('terminal login can scroll when keyboard or validation content reduces the available viewport',()=>{
 const gate=declarations('.login-gate.terminal-login');
 assert.equal(gate['overflow-y'],'auto');
 assert.equal(gate['align-items'],'flex-start');
 assert.equal(gate['overflow-x'],'hidden');
 assert.equal(gate.display,'flex');
 const card=declarations('.terminal-login .login-card');
 assert.equal(card['min-width'],'0');
 assert.equal(card.width,'min(430px,100%)');
 assert.equal(card.flex,'0 0 auto');
 assert.ok(!card.height&&!card['max-height'],'The complete form must remain scrollable rather than clipped');
});

test('compact login retains touch targets, readable fields, and all authentication/error controls',()=>{
 const input=declarations('.terminal-login .login-card input');
 const button=declarations('.terminal-login .login-card .login-button');
 assert.ok(parseFloat(input.height)>=44);
 assert.ok(parseFloat(button.height)>=44);
 assert.ok(parseFloat(input['font-size'])>=16);
 compact.walkDecls(decl=>{
  assert.notEqual(decl.prop==='display'?decl.value:null,'none','No form or feedback can be hidden to fit the terminal');
  assert.notEqual(decl.prop==='visibility'?decl.value:null,'hidden');
 });
 for(const rule of compact.nodes.filter(node=>node.type==='rule'))
  assert.match(rule.selector,/^\.(?:login-gate\.terminal-login|terminal-login(?:\s|$))/, 'Compact layout must not change desktop/non-terminal login');
});

test('normal login still exposes username, password, enter submit and validation feedback',()=>{
 const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const gate=source.slice(source.indexOf('function LoginGate('),source.indexOf('\nfunction messageClock('));
 assert.match(gate,/login-gate\$\{terminal \? " terminal-login"/);
 assert.match(gate,/autoComplete="username"/);
 assert.match(gate,/type="password"/);
 assert.match(gate,/event\.key === "Enter" && !busy/);
 assert.match(gate,/disabled=\{busy \|\| !credentials\.username\.trim\(\) \|\| !credentials\.password\}/);
 assert.match(gate,/className="login-error"/);
});
