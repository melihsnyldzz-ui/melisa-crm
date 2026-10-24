import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePermissions,normalizeInboxPayload} from '../src/liveApi.js';

for(const flag of [{assignmentEnabled:false},{canAssign:false},{capabilities:{assign:false}}]){
  test(`B5 explicit assignment denial survives manager role: ${JSON.stringify(flag)}`,()=>{
    const result=normalizePermissions({role:'mudur',permissions:['crm.view','crm.assign'],...flag});
    assert.equal(result.assignmentEnabled,false);
    assert.equal(result.canAssign,false);
  });
}

test('B5 supported manager and patron assignment remains enabled; personnel cannot acquire it from a source flag',()=>{
  for(const role of ['mudur','patron'])assert.equal(normalizePermissions({role,permissions:['crm.view','crm.assign'],capabilities:{assign:true}}).assignmentEnabled,true);
  assert.equal(normalizePermissions({role:'personel',permissions:['crm.view'],capabilities:{assign:true}}).assignmentEnabled,false);
});

for(const complete of [true,false]){
  test(`B5 inbox assignment capability survives normalization with complete=${complete}`,()=>{
    const result=normalizeInboxPayload({conversations:[],summary:{complete},capabilities:{read:true,send:false,assign:false}});
    assert.equal(result.capabilities?.assign,false);
  });
}
