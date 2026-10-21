import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonBody,HttpError,failure} from '../lib/http.ts';

const request=body=>new Request('https://example.test/api/students',{method:'POST',body});
test('JSON boundary accepts objects and refuses malformed/non-object JSON',async()=>{
 assert.deepEqual(await readJsonBody(request('{"name":"学生"}')),{name:'学生'});
 for(const value of ['[]','null','1','"text"','{',''])await assert.rejects(readJsonBody(request(value)),error=>error.status===400&&error.code==='INVALID_JSON');
});
test('body size is bounded by bytes even without a declared length and cancels the stream',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new TextEncoder().encode('学生'));},cancel(){cancelled=true;}});
 const req=new Request('https://example.test/api/roster',{method:'POST',body,duplex:'half'});
 await assert.rejects(readJsonBody(req,10),error=>error.status===413);
 assert.equal(cancelled,true);
 await assert.rejects(readJsonBody(new Request(request('{}'),{headers:{'Content-Length':'100'}}),10),error=>error.status===413);
});
test('split UTF-8 characters decode correctly and invalid UTF-8 is rejected',async()=>{
 const bytes=new TextEncoder().encode('{"name":"学生"}');
 const body=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();}});
 assert.deepEqual(await readJsonBody(new Request('https://example.test',{method:'POST',body,duplex:'half'})),{name:'学生'});
 await assert.rejects(readJsonBody(request(new Uint8Array([0xff]))),error=>error.status===400);
});
test('failure responses keep legacy permissions but hide infrastructure internals and private logs',async()=>{
 const original=console.error,logs=[];console.error=value=>logs.push(value);
 try{
  for(const [error,status] of [[new Error('请先登录后再操作'),401],[new Error('无权限：不能编辑成绩'),403],[new Error('该学期已经归档'),400],[new HttpError(409,'STALE_WRITE','记录已变化'),409],[new Error('D1_ERROR: SELECT secret FROM students'),503],[new Error('password=private-value'),500]]){
   const response=failure(error),body=await response.json();
   assert.equal(response.status,status);assert.equal(response.headers.get('Cache-Control'),'no-store');
   assert.equal(body.requestId,response.headers.get('X-Request-ID'));
   assert.doesNotMatch(JSON.stringify(body),/SELECT secret|private-value/);
  }
  assert.doesNotMatch(logs.join(''),/SELECT secret|private-value|成绩|归档/);
 }finally{console.error=original;}
});
