import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizeSalesPolicyFacts,normalizeSalesRules,formToPolicy,policyToForm} from '../src/lib/salesRules.js';
import {createSalesDraftFlow} from '../src/lib/salesDraft.js';
const rules=()=>({wholesaleOnly:true,breakSeries:false,shippingPayer:'recipient',sources:[
 'https://github.com/melihsnyldzz-ui/melisa-erp-v2/pull/23#issuecomment-6232818354',
 'https://github.com/melihsnyldzz-ui/melisa-erp-v2/pull/23#issuecomment-6222599673',
]});
const blank=()=>({version:'synthetic-v1',minimumOrderMode:'unconfigured',minimumOrder:null,telegramUrl:null,countryRules:[],shippingTerms:'',salesNotes:''});
const facts=()=>({...blank(),revision:'a'.repeat(64),requiresStaffConfirmation:true,countrySelection:'unverified',shippingConfirmation:'staff',discountAllowed:false,breakSeries:false,autoSend:false,writeErp:false});
const record=(businessRules)=>({policy:blank(),revision:'a'.repeat(64),configured:true,writable:true,...(businessRules===undefined?{}:{businessRules})});

test('only complete server business facts are verified; legacy facts never invent recipient payment',()=>{
 assert.deepEqual(normalizeSalesRules(record(rules())).businessRules,rules());
 assert.deepEqual(normalizeSalesPolicyFacts({...facts(),businessRules:rules()}).businessRules,rules());
 assert.equal(normalizeSalesRules(record()).businessRules,null);
 assert.equal(normalizeSalesPolicyFacts(facts()).businessRules,null);
 for(const value of [{...rules(),shippingPayer:'seller'},{...rules(),wholesaleOnly:false},{...rules(),breakSeries:true},
  {...rules(),sources:[]},{...rules(),sources:['https://example.invalid/not-approved']},{shippingPayer:'recipient'}]){
   assert.throws(()=>normalizeSalesPolicyFacts({...facts(),businessRules:value}));
 }
 assert.deepEqual(formToPolicy(policyToForm(normalizeSalesRules(record(rules())).policy)),blank());
});

test('a pre-upgrade suggestion is rejected when fresh effective-rule revision changes, preserving human text',async()=>{
 const context={token:'synthetic',identity:'synthetic-staff',canSend:true,conversation:{id:'synthetic-conversation',messages:[]}};
 let state;const human='Personelin korunan metni';
 const flow=createSalesDraftFlow({getContext:()=>context,getDraft:()=>human,onChange:value=>{state=value;},
  generate:async()=>({mode:'copilot',autoSend:false,erpWrite:false,requiresHumanReview:true,conversationId:'synthetic-conversation',conversationRevision:'c'.repeat(64),generatedAt:new Date().toISOString(),action:'reply',reply:'Old suggestion',summaryTr:'Eski öneri',policyFacts:facts()}),
  readPolicy:async()=>({...record(rules()),revision:'b'.repeat(64)})});
 assert.equal(await flow.start(),true);assert.equal(await flow.takeDraft(human),null);
 assert.equal(state.preview,null);assert.match(state.error,/kuralları değişti/);assert.equal(human,'Personelin korunan metni');
});

test('the real staff review card shows the three sourced fixed rules, with an honest legacy fallback',async()=>{
 const frontend=fileURLToPath(new URL('../',import.meta.url));
 const directory=await mkdtemp(join(frontend,'node_modules/.sales-rules-test-'));
 try{
  const output=await build({absWorkingDir:frontend,entryPoints:['src/SalesRulesSettings.jsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'});
  const modulePath=join(directory,'summary.mjs');await writeFile(modulePath,output.outputFiles[0].text);
  const {SalesPolicySummary}=await import(pathToFileURL(modulePath).href);
  const html=renderToStaticMarkup(React.createElement(SalesPolicySummary,{policy:normalizeSalesPolicyFacts({...facts(),businessRules:rules()})}));
  assert.match(html,/Yalnız toptan/);assert.match(html,/Seri bölünmez/);assert.match(html,/Kargo alıcıya ait/);
  for(const source of rules().sources)assert.ok(html.includes(source));
  assert.match(html,/Minimum sipariş henüz belirlenmedi/);assert.doesNotMatch(html,/1000|1[.,]000/);
  const legacy=renderToStaticMarkup(React.createElement(SalesPolicySummary,{policy:normalizeSalesPolicyFacts(facts())}));
  assert.doesNotMatch(legacy,/Kargo alıcıya ait/);assert.match(legacy,/doğrulanmadı/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
