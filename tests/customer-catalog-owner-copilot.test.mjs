import test from 'node:test';
import assert from 'node:assert/strict';
import {freshOwnerReply,ownerModelContext} from '../deploy/customer-catalog-owner-copilot.mjs';
const correction={attemptedAt:'2026-10-10T01:30:00.000Z'};
const message=(id,direction,text,time='2026-10-10T01:31:00.000Z')=>({id,direction,text,received_at:time});
test('a mirrored catalog message is never a fresh owner reply',()=>{
 assert.equal(freshOwnerReply({messages:[message(1,'outgoing','catalog'),message(2,'incoming','catalog')]},correction),null);
});
test('old replies, private notes and timestamp-less messages cannot trigger paid AI',()=>{
 assert.equal(freshOwnerReply({messages:[message(1,'incoming','old','2026-10-09T01:31:00.000Z'),{...message(2,'incoming','note'),private:true},{id:3,direction:'incoming',text:'undated'}]},correction),null);
});
test('only the latest real incoming reply after the corrective message is selected',()=>{
 const last=message(3,'incoming','second model');
 assert.equal(freshOwnerReply({messages:[message(1,'incoming','opened'),message(2,'outgoing','reply'),last]},correction),last);
});
test('model context excludes private catalog capability URLs and contact numbers',()=>{
 const token='A'.repeat(43);
 const input={messages:[{text:'katalog http://100.87.188.3:62600/katalog#'+token}],products:[{id:'erp-31091',series:{totalPieces:6}}]};
 const result=ownerModelContext(input);
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.equal(JSON.stringify(result).includes('100.87.188.3'),false);
 assert.deepEqual(result.products,input.products);
 assert.equal(input.messages[0].text.includes(token),true);
});
