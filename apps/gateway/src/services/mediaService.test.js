import assert from 'node:assert/strict';
import test from 'node:test';
import { getCrmMessageMedia } from './mediaService.js';

test('external Chatwoot message media uses its direct URL instead of the local UUID repository', async () => {
  await assert.rejects(
    () => getCrmMessageMedia(1089),
    (error) => error.code === 'WHATSAPP_CRM_EXTERNAL_MEDIA_DIRECT' && error.statusCode === 404,
  );
});

test('local media refuses another personnel assignment before provider access and again after retrieval',async()=>{
  let assignment='staff-1',providerCalls=0;
  const source=()=>({id:'synthetic-message',conversation_id:'synthetic-conversation',assigned_user_id:assignment,message_type:'image',raw_payload:{},instance_key:'synthetic-instance'});
  const user=()=>({id:'staff-1',role:'personel',active:true,permissions:['crm.view']});
  const options={getCurrentUser:user,readSource:async()=>source(),getProvider:()=>({getMessageMedia:async()=>{providerCalls++;return{url:'synthetic-media'};}})};
  assignment='staff-2';await assert.rejects(()=>getCrmMessageMedia('synthetic-message',options),e=>e.statusCode===403);assert.equal(providerCalls,0);
  assignment='staff-1';assert.equal((await getCrmMessageMedia('synthetic-message',options)).messageId,'synthetic-message');assert.equal(providerCalls,1);
  options.getProvider=()=>({getMessageMedia:async()=>{providerCalls++;assignment='staff-2';return{url:'must-not-return'};}});
  await assert.rejects(()=>getCrmMessageMedia('synthetic-message',options),e=>e.statusCode===403);assert.equal(providerCalls,2);
});
