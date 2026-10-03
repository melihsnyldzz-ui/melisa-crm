import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateCount} from './crmExistingStockReadWorker.mjs';
test('real tedious COUNT_BIG decimal strings are supported without losing precision',()=>{
 assert.equal(aggregateCount('1085'),1085);assert.equal(aggregateCount(0),0);
 for(const value of ['9007199254740993','1.2','-1','',null,Infinity])assert.throws(()=>aggregateCount(value));
});
