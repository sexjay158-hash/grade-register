import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReadiness} from '../lib/health.ts';

test('readiness checks both services and treats missing probe objects as a healthy read',async()=>{
 assert.deepEqual(await checkReadiness({database:async()=>({ok:1}),storage:async()=>null}),{status:'ok',dependencies:{database:'ok',storage:'ok'}});
});
test('dependency failure and timeout return a bounded result without exposing internal errors',async()=>{
 const result=await checkReadiness({database:async()=>{throw new Error('secret DB details');},storage:()=>new Promise(()=>{})},10);
 assert.deepEqual(result,{status:'unavailable',dependencies:{database:'unavailable',storage:'unavailable'}});
});
