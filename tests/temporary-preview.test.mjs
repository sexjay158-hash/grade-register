import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPreviewProxy} from '../scripts/temporary-preview-proxy.mjs';

// Node's fetch normalizes Host; use HTTP directly to model the tunnel request.
function request(url,options={}){return new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method,headers:options.headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(Object.entries(res.headers).flatMap(([name,value])=>Array.isArray(value)?value.map(item=>[name,item]):[[name,value]])),json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(options.body);});}

test('temporary proxy keeps login origin checks, cookies and local files protected',async()=>{
 const upstream=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':'gr_session=test; HttpOnly; SameSite=Strict'});res.end(JSON.stringify({host:req.headers.host,origin:req.headers.origin,forwarded:req.headers['x-forwarded-host'],method:req.method}));});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const localOrigin=`http://127.0.0.1:${upstream.address().port}`;
 let publicOrigin=null,stopped=false;
 const proxy=createPreviewProxy({upstream:localOrigin,getPublicOrigin:()=>publicOrigin,stopToken:'test-stop-token',onStop:()=>{stopped=true;}});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${proxy.address().port}`;
 const headers={host:'acceptance.trycloudflare.com',origin:'https://acceptance.trycloudflare.com'};
 try{
  assert.equal((await request(base+'/login',{headers})).status,403);
  publicOrigin='https://acceptance.trycloudflare.com';
  const allowed=await request(base+'/api/auth/login',{method:'POST',headers:{...headers,'x-forwarded-host':'evil.example'},body:'{}'});
  assert.equal(allowed.status,200);
  assert.deepEqual(await allowed.json(),{host:new URL(localOrigin).host,origin:localOrigin,method:'POST'});
  assert.match(allowed.headers.get('set-cookie'),/; Secure$/);
  assert.equal((await request(base+'/api/auth/login',{method:'POST',headers:{...headers,origin:'https://evil.example'}})).status,403);
  assert.equal((await request(base+'/login',{headers:{...headers,host:'other.trycloudflare.com'}})).status,403);
  for(const secret of ['/.env','/.dev.vars','/.wrangler/state','/@fs/D:/project/.sites-runtime/internet-preview.json','/@fs/D:/project/.env.local'])assert.equal((await request(base+secret,{headers})).status,403);
  assert.equal((await request(base+'/__preview_control__/stop',{method:'POST',headers:{...headers,'x-preview-stop':'test-stop-token'}})).status,403);
  assert.equal((await request(base+'/__preview_control__/stop',{method:'POST',headers:{'x-preview-stop':'wrong'}})).status,403);
  assert.equal((await request(base+'/__preview_control__/stop',{method:'POST',headers:{'x-preview-stop':'test-stop-token'}})).status,200);
  await new Promise(resolve=>setTimeout(resolve,120));assert.equal(stopped,true);
 }finally{proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(resolve=>proxy.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
});
