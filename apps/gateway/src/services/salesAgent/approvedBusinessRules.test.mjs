import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {editablePolicy,validatePolicy,modelPolicy,policyFacts} from './policy.mjs';
import {createSalesPolicyStore} from './policyStore.mjs';
import {prepareSalesDraft} from './agent.mjs';
import {createSalesPreview} from './preview.mjs';

const rules=()=>({wholesaleOnly:true,breakSeries:false,shippingPayer:'recipient',sources:[
  'https://github.com/melihsnyldzz-ui/melisa-erp-v2/pull/23#issuecomment-6232818354',
  'https://github.com/melihsnyldzz-ui/melisa-erp-v2/pull/23#issuecomment-6222599673',
]});
const legacyRevision=policy=>createHash('sha256').update(JSON.stringify(policy)).digest('hex');
const conversation=()=>({id:'synthetic-conversation',messages:[{id:'synthetic-incoming',direction:'incoming',text:'Please explain your sales terms.'}]});
const proposal=()=>({action:'reply',reply:'Staff will review the details.',summaryTr:'Koşullar personel tarafından incelenecek.',productIds:[],lines:[],handoffReason:''});

test('approved business facts reach the model and review card without inventing unknown commercial terms',async()=>{
  const policy=validatePolicy({shippingTerms:'Seller pays shipping. Guaranteed tomorrow.',salesNotes:'Sell one piece and split any series.'});
  assert.deepEqual(modelPolicy(policy).businessRules,rules());
  assert.deepEqual(policyFacts(policy).businessRules,rules());
  assert.equal(policy.minimumOrderMode,'unconfigured');assert.equal(policy.minimumOrder,null);assert.deepEqual(policy.countryRules,[]);
  assert.equal(policy.discountAllowed,false);assert.equal(policy.autoSend,false);assert.equal(policy.writeErp,false);
  assert.equal(Object.isFrozen(policy.businessRules),true);assert.equal(Object.isFrozen(policy.businessRules.sources),true);
  let request;
  const result=await prepareSalesDraft({conversation:conversation(),policy:editablePolicy({shippingTerms:policy.shippingTerms,salesNotes:policy.salesNotes})}, {
    generate:async value=>{request=value;return proposal();},readCurrentConversation:async()=>conversation(),
  });
  assert.deepEqual(request.context.policy.businessRules,rules());
  assert.match(request.instructions,/businessRules.*(?:override|precedence)/i);
  assert.match(request.instructions,/shippingPayer=recipient/);
  assert.deepEqual(result.policyFacts.businessRules,rules());
  assert.equal(result.autoSend,false);assert.equal(result.erpWrite,false);
});

test('legacy policy bytes remain unchanged but their old editable-only revision cannot authorize a write',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'crm-approved-rules-fixture-'));
  try {
    const path=join(directory,'rules.json'),policy=editablePolicy();
    const original=JSON.stringify(policy);await writeFile(path,original);
    const store=createSalesPolicyStore({getPath:()=>path}),current=await store.read();
    assert.notEqual(current.revision,legacyRevision(policy));
    assert.deepEqual(current.businessRules,rules());assert.deepEqual(current.policy,policy);
    await assert.rejects(store.write({policy,revision:legacyRevision(policy)}),error=>error.code==='AI_POLICY_CHANGED');
    assert.equal(await readFile(path,'utf8'),original);
    for(const override of [{businessRules:{shippingPayer:'seller'}},{wholesaleOnly:false},{breakSeries:true},{shippingPayer:'seller'}]){
      await assert.rejects(store.write({policy:{...policy,...override},revision:current.revision}),error=>error.code==='AI_POLICY_INVALID');
    }
    const saved=await store.write({policy:{...policy,salesNotes:'Staff note.'},revision:current.revision});
    assert.deepEqual(saved.businessRules,rules());assert.equal(saved.policy.minimumOrderMode,'unconfigured');assert.equal(saved.policy.minimumOrder,null);
    assert.equal(Object.hasOwn(JSON.parse(await readFile(path,'utf8')),'businessRules'),false);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('raw-policy previews and server store share the effective business-rule revision',async()=>{
  const store=createSalesPolicyStore({getPath:()=>undefined}),record=await store.read();
  const preview=createSalesPreview({getMode:()=> 'copilot',loadPolicy:async()=>record.policy,
    readConversation:async()=>conversation(),generate:async()=>proposal()});
  const result=await preview({conversationId:'synthetic-conversation',user:{id:'synthetic-staff'}});
  assert.equal(result.policyFacts.revision,record.revision);
  assert.deepEqual(result.policyFacts.businessRules,rules());
  assert.deepEqual(record.policy,editablePolicy());assert.equal(record.configured,false);
});
