import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadBatch} from '../lib/read-batch.ts';

test('state reads use one database batch and preserve order without reusing results',async()=>{
 const batches=[];const database={batch:async statements=>{batches.push(statements);return statements.map(statement=>({success:true,results:[statement],meta:{}}));}};
 const read=createReadBatch(database);
 const [first,second]=await Promise.all([read({id:'first'}),read({id:'second'})]);
 assert.equal(batches.length,1);assert.equal(batches[0].length,2);
 assert.equal(first.results[0].id,'first');assert.equal(second.results[0].id,'second');
 await createReadBatch(database)({id:'different request'});assert.equal(batches.length,2);
});
test('database batch failure rejects every queued read instead of hanging requests',async()=>{
 const read=createReadBatch({batch:async()=>{throw new Error('database unavailable');}});
 const results=await Promise.allSettled([read({id:1}),read({id:2})]);
 assert.ok(results.every(result=>result.status==='rejected'&&result.reason.message==='database unavailable'));
});
