import test from 'node:test';
import assert from 'node:assert/strict';
import {handleNativeLogin,nativeLoginMessage} from '../lib/native-login.ts';
const request=(body,origin='https://school.test')=>new Request('https://school.test/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body});
test('native login preserves Unicode and special characters, sets session and redirects without credentials in URL',async()=>{
 let calls=0;
 const result=await handleNativeLogin(request(new URLSearchParams({username:'负责人',password:'a+&%=密码'})),async req=>{
  calls++;assert.deepEqual(await req.json(),{username:'负责人',password:'a+&%=密码'});
  return Response.json({ok:true},{headers:{'set-cookie':'session=test; HttpOnly; Secure; SameSite=Lax'}});
 });
 assert.equal(calls,1);assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/');
 assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.equal(result.headers.get('cache-control'),'no-store');
});
test('native form rejects cross-site requests before checking a password',async()=>{
 const response=await handleNativeLogin(request('username=x&password=x','https://evil.test'),async()=>assert.fail('no authentication'));
 assert.equal(response.status,403);
});
test('native form bounds streamed input even without content-length',async()=>{
 const response=await handleNativeLogin(request('password='+('x'.repeat(5000))),async()=>assert.fail('oversize body'));
 assert.equal(response.headers.get('location'),'/login?reason=invalid');
});
test('native errors reveal no credentials and never automatically repeat ambiguous writes',async()=>{
 for(const [status,code,reason] of [[401,'','invalid'],[429,'','limited'],[503,'LOGIN_BUSY','busy'],[503,'','unavailable']]){
  let calls=0;const r=await handleNativeLogin(request('username=test&password=private'),async()=>{calls++;return Response.json({code},{status});});
  assert.equal(calls,1);assert.equal(r.headers.get('location'),'/login?reason='+reason);assert.ok(nativeLoginMessage(reason));assert.equal(r.headers.get('set-cookie'),null);
 }
 assert.equal(nativeLoginMessage('<script>'), '');
});
