import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeOnce} from '../lib/query-initialization.ts';

test('concurrent schema initialization shares work and subsequent calls do not repeat it',async()=>{
 let calls=0;const key=crypto.randomUUID();
 const work=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));};
 await Promise.all(Array.from({length:50},()=>initializeOnce(key,work)));
 await initializeOnce(key,work);assert.equal(calls,1);
});
test('failed schema initialization may retry instead of permanently blocking startup',async()=>{
 let calls=0;const key=crypto.randomUUID();
 await assert.rejects(initializeOnce(key,async()=>{calls++;throw new Error('database temporarily unavailable');}));
 await initializeOnce(key,async()=>{calls++;});assert.equal(calls,2);
});
