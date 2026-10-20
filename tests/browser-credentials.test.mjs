import test from 'node:test';
import assert from 'node:assert/strict';
import {saveOcrCredentials,clearOcrCredentials,loadOcrCredentials} from '../lib/browser-credentials.ts';
test('blocked optional OCR storage cannot break settings or startup',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{get localStorage(){throw new Error('SecurityError');}}});
  assert.equal(loadOcrCredentials(),null);assert.doesNotThrow(()=>saveOcrCredentials({apiKey:'test',secretKey:'test'}));assert.doesNotThrow(clearOcrCredentials);
  const data=new Map();Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}}});
  saveOcrCredentials({apiKey:'test',secretKey:'test'});assert.deepEqual(loadOcrCredentials(),{apiKey:'test',secretKey:'test'});clearOcrCredentials();assert.equal(loadOcrCredentials(),null);
 }finally{if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window;}
});
