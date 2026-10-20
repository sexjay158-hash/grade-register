import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {scheduleRefresh} from '../lib/refresh-scheduler.ts';

test('refreshes never overlap and stop cancels future work',async()=>{
 let calls=0,active=0,maxActive=0;
 const scheduler=scheduleRefresh(async()=>{calls++;maxActive=Math.max(maxActive,++active);await pause(20);active--;return true;},()=>true,{baseMs:5,random:()=>0});
 await pause(65);scheduler.stop();await pause(30);const stoppedCalls=calls;await pause(30);
 assert.ok(calls>=2);assert.equal(maxActive,1);assert.equal(calls,stoppedCalls);
});

test('hidden or editing clients skip work, failures back off',async()=>{
 let eligible=false,calls=0;const starts=[];
 const scheduler=scheduleRefresh(async()=>{calls++;starts.push(Date.now());return false;},()=>eligible,{baseMs:10,maxMs:100,random:()=>0});
 try{await pause(25);assert.equal(calls,0);eligible=true;await pause(90);assert.ok(calls>=2);assert.ok(starts[1]-starts[0]>=18);if(starts.length>2)assert.ok(starts[2]-starts[1]>=38);}finally{scheduler.stop();}
});
