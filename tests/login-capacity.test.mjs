import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginAdmission} from '../lib/login-capacity.ts';

test('serial password checks are rate limited even when concurrent work stays at one',()=>{
 let now=0;const acquire=createLoginAdmission(()=>now);
 let accepted=0,rejected=0;
 for(let i=0;i<200;i++){const release=acquire();if(release){accepted++;release();now+=220;}else rejected++;}
 assert.ok(accepted<10);assert.ok(rejected>190);
 now+=1000;assert.ok(acquire());
});

test('slow checks are bounded and release is idempotent',()=>{
 let now=0;const acquire=createLoginAdmission(()=>now),slots=[];
 for(let i=0;i<6;i++){slots.push(acquire());assert.ok(slots.at(-1));now+=1000;}
 assert.equal(acquire(),null);slots[0]();slots[0]();assert.ok(acquire());assert.equal(acquire(),null);
});
