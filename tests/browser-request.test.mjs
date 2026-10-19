import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson,readBrowserPreference,saveBrowserPreference} from '../lib/browser-request.ts';

test('blocked storage and server rendering do not interrupt startup',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 try{
  delete globalThis.window;assert.equal(readBrowserPreference('year'),null);saveBrowserPreference('year','2026');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{get localStorage(){throw new Error('SecurityError');}}});
  assert.equal(readBrowserPreference('year'),null);assert.doesNotThrow(()=>saveBrowserPreference('year','2026'));
  const values=new Map();Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}});
  saveBrowserPreference('year','2026');assert.equal(readBrowserPreference('year'),'2026');
 }finally{if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window;}
});

test('safe reads recover once from a temporary gateway failure and keep cookies',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(path,init)=>{assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');return ++calls===1?new Response('temporary',{status:503}):Response.json({role:'recorder'});};
  assert.deepEqual(await requestJson('/api/me'),{role:'recorder'});assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});

test('a stalled response body times out and releases the request',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(path,{signal})=>{calls++;return {ok:true,status:200,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};};
  await assert.rejects(requestJson('/api/me',{}, {timeoutMs:10,retries:0}),/读取超时/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('login writes are never retried on timeout or gateway failure',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=(path,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
  await assert.rejects(requestJson('/api/auth/login',{method:'POST',body:'{}'},{timeoutMs:10,retries:3}),/操作可能已保存/);assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'暂不可用'},{status:503});};
  await assert.rejects(requestJson('/api/auth/login',{method:'POST'}),error=>error.status===503);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('authentication failures are shown without retrying or hiding their status',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({error:'请先登录'},{status:401});};
  await assert.rejects(requestJson('/api/me'),error=>error.status===401&&error.message==='请先登录');assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
