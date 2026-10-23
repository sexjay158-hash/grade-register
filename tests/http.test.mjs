import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonBody,readBoundedBytes,readPhotoForm,HttpError,failure} from '../lib/http.ts';

const request=body=>new Request('https://example.test/api/students',{method:'POST',body});
test('photo requests reject oversized streamed bodies before multipart parsing',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedBytes(new Request('https://example.test',{method:'POST',body,duplex:'half'}),1500),e=>e.status===413);
 assert.equal(cancelled,true);
 const form=new FormData();form.set('file',new Blob(['photo'],{type:'image/png'}),'photo.png');form.set('eventId','test');
 const parsed=await readPhotoForm(request(form));assert.equal(parsed.get('eventId'),'test');assert.equal(await parsed.get('file').text(),'photo');
 await assert.rejects(readPhotoForm(request('invalid multipart')),e=>e.status===400);
 await assert.rejects(readPhotoForm(new Request(request(form),{headers:{'Content-Length':String(9*1024*1024)}})),e=>e.status===413);
});
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
