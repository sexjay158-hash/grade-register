import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupRejectedPhoto} from '../lib/photo-write-cleanup.ts';
import {MutationRejectedError} from '../lib/guarded-batch.ts';
test('an ambiguous database failure must never delete a possibly committed photo',async()=>{
 let removed=0;const remove=async()=>{removed++;};
 assert.equal(await cleanupRejectedPhoto(new Error('database connection lost after write'),remove),false);assert.equal(removed,0);
 assert.equal(await cleanupRejectedPhoto(new MutationRejectedError('archive changed'),remove),true);
 assert.equal(await cleanupRejectedPhoto(new Error('D1_ERROR: UNIQUE constraint failed: photos.owner, photos.hash: SQLITE_CONSTRAINT'),remove),true);
 assert.equal(await cleanupRejectedPhoto(new Error('capacity reached'),remove,true),true);assert.equal(removed,3);
 assert.equal(await cleanupRejectedPhoto(new MutationRejectedError('version changed'),async()=>{throw new Error('storage unavailable');}),false);
});
