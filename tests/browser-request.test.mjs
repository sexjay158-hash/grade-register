import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson,requestPhoto,loginWithWaiting,activateWithWaiting,readBrowserPreference,saveBrowserPreference} from '../lib/browser-request.ts';

test('activation waits only for explicit admission rejection and never replays an uncertain write',async()=>{
 const original=globalThis.fetch;let calls=0,waiting=0;
 try{
  globalThis.fetch=async url=>{assert.equal(url,'/api/auth/activate');return ++calls===1?Response.json({code:'LOGIN_BUSY'},{status:503}):Response.json({ok:true});};
  assert.deepEqual(await activateWithWaiting({username:'20240001',code:'abc',password:'abc123'},()=>waiting++,undefined,{retryDelay:()=>1}),{ok:true});assert.equal(waiting,1);assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;throw new TypeError('network lost');};
  await assert.rejects(activateWithWaiting({username:'20240001',code:'abc',password:'abc123'},()=>{}),/操作可能已保存/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

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

test('non-JSON gateway failure keeps its status and does not repeat a write',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response('<html>unavailable</html>',{status:503});};
  await assert.rejects(requestJson('/api/students',{method:'POST'}),e=>e.status===503&&/可能已保存/.test(e.message));assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('login waits only on explicit admission rejection, with a bounded and cancellable wait',async()=>{
 const original=globalThis.fetch;let calls=0,waiting=0;
 try{
  globalThis.fetch=async()=>++calls===1?Response.json({code:'LOGIN_BUSY',error:'繁忙'},{status:503}):Response.json({ok:true});
  assert.deepEqual(await loginWithWaiting({username:'test',password:'test'},()=>waiting++,undefined,{retryDelay:()=>1}),{ok:true});assert.equal(calls,2);assert.equal(waiting,1);
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'服务异常'},{status:503});};
  await assert.rejects(loginWithWaiting({username:'test',password:'test'},()=>{},undefined,{retryDelay:()=>1}),e=>e.status===503);assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json({code:'LOGIN_BUSY'},{status:503});
  await assert.rejects(loginWithWaiting({username:'test',password:'test'},()=>{},undefined,{maxWaitMs:1,retryDelay:()=>10}),/请稍后再次登录/);
  const controller=new AbortController();
  await assert.rejects(loginWithWaiting({username:'test',password:'test'},()=>controller.abort(),controller.signal,{retryDelay:()=>100}),/已取消/);
 }finally{globalThis.fetch=original;}
});


test('photo reads bound body downloads and never retry a permission failure',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response('denied',{status:403});};
  await assert.rejects(requestPhoto('/api/photo/test'),e=>e.status===403);assert.equal(calls,1);
  calls=0;globalThis.fetch=async(path,{signal})=>{calls++;return {ok:true,status:200,blob:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};};
  await assert.rejects(requestPhoto('/api/photo/test',10),/读取超时/);assert.equal(calls,2);
  globalThis.fetch=async()=>new Response(new Uint8Array([137,80,78]),{headers:{'Content-Type':'image/png'}});
  assert.equal((await requestPhoto('/api/photo/test')).size,3);
 }finally{globalThis.fetch=original;}
});
