import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {loginWithWaiting} from '../lib/browser-request.ts';

const base=process.env.TEST_BASE_URL,state=path.resolve(process.env.TEST_STATE_DIR??'.');
assert.ok(base&&new URL(base).hostname==='127.0.0.1'&&path.dirname(state)===process.cwd()&&path.basename(state).startsWith('.tmp-burst-verify-'),'Isolated test database required');
const {admin,year,users}=JSON.parse(fs.readFileSync(path.join(state,'fixture.json'),'utf8')),origin=new URL(base).origin;
const capacityOnly=process.argv[2]==='capacity',savedReport=path.join(process.env.LOAD_REPORT_DIR,'stability.json');
const report=capacityOnly&&fs.existsSync(savedReport)?JSON.parse(fs.readFileSync(savedReport,'utf8')):{date:'2026-10-20',environment:'isolated local Worker/D1/R2; 6000 synthetic students, 200 distinct accounts',results:[],checks:[]};
if(capacityOnly){
 assert.ok(report.results.some(r=>r.clients===200&&r.requests===200&&r.successes===200)&&report.results.some(r=>r.name.includes('上传')&&r.successes===200),'Run the full stability test before repeating only capacity verification');
 if(report.failure){assert.equal(report.failedStage,'capacity','Cannot clear a failure from another stage');report.notes=[...(report.notes??[]),'先前批次容量校验失败，本次仅复测此项；其他结果沿用相同构建。'];delete report.failure;delete report.failedStage;}
}
let stage=capacityOnly?'capacity':'online';
const originalFetch=globalThis.fetch,hash=b=>createHash('sha256').update(b).digest('hex');
const cookieByUser=new Map(),loginHttp=[];
async function call(user,endpoint,data,timeoutMs=15000){
 const start=performance.now();
 try{
  const headers={Origin:origin};if(user?.cookie)headers.Cookie=user.cookie;if(data&&!(data instanceof FormData))headers['Content-Type']='application/json';
  const response=await originalFetch(base+endpoint,{method:data?'POST':'GET',headers,body:data?(data instanceof FormData?data:JSON.stringify(data)):undefined,signal:AbortSignal.timeout(timeoutMs)});
  const bytes=Buffer.from(await response.arrayBuffer());let body;try{body=JSON.parse(bytes.toString());}catch{body={error:bytes.toString().slice(0,200)};}
  return {status:response.status,ms:performance.now()-start,body,hash:hash(bytes),bytes:bytes.length};
 }catch(error){return {status:0,ms:performance.now()-start,error:error.message};}
}
function summary(name,rows,extra={}){
 const times=rows.map(r=>r.ms).sort((a,b)=>a-b),statuses={};for(const r of rows)statuses[r.status]=(statuses[r.status]??0)+1;
 const result={name,requests:rows.length,successes:rows.filter(r=>r.status===200).length,statuses,p50Ms:Math.round(times[Math.ceil(times.length*.5)-1]),p95Ms:Math.round(times[Math.ceil(times.length*.95)-1]),maxMs:Math.round(times.at(-1)),...extra};
 report.results.push(result);console.log(JSON.stringify(result));return result;
}
async function pool(total,concurrency,work){let next=0;const results=new Array(total);await Promise.all(Array.from({length:Math.min(total,concurrency)},async()=>{while(next<total){const i=next++;results[i]=await work(i);}}));return results;}
function save(){
 const dir=process.env.LOAD_REPORT_DIR;fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'stability.json'),JSON.stringify(report,null,2)+'\n');
 const lines=['# 稳定性与 200 人测试（2026-10-20）','',report.environment,'','| 场景 | 成功/请求 | P95(ms) | 最大(ms) |','|---|---:|---:|---:|',...report.results.map(r=>`| ${r.name} | ${r.successes}/${r.requests} | ${r.p95Ms} | ${r.maxMs} |`),'','## 校验','',...report.checks.map(s=>'- '+s),'','## 测试边界','','在线测试为 200 个有效会话，每人 3 轮读取身份、学期及本院状态，初次进入分散在 12 秒内，每轮之间停顿 10–14 秒（比页面正常 45–60 秒刷新更频繁）。集中登录同时调用真实前端等待逻辑：仅服务器明确返回 LOGIN_BUSY 时，首次间隔 3–6 秒、持续繁忙后最长间隔 15–30 秒重试，最长等待 300 秒；其他错误和超时不重试。密码保留 600000 次 PBKDF2。登录期间每秒读取一次已有会话状态以检查可用性。','', '这是本机短时测试，不是公网或长期容量承诺，也没有测试手机端 OCR 或 200 人每人连续上传 30 张。'];
 if(report.notes)lines.push('',...report.notes.map(s=>'- '+s));
 if(report.failure)lines.push('','测试失败：'+report.failure);
 fs.writeFileSync(path.join(dir,'stability.md'),lines.join('\n')+'\n');
}
try{
 if(!capacityOnly){
 console.log('Testing 200 online sessions with staggered reads and think time…');
 const reads=[],start=performance.now();
 await pool(200,200,async i=>{
  await pause(i*60);
  for(let cycle=0;cycle<3;cycle++){
   for(const endpoint of ['me','years','state?yearId='+year])reads.push(await call(users[i],endpoint));
   if(cycle<2)await pause(10000+(i%5)*1000);
  }
 });
 summary('200 人在线读取（每人3轮，共1800次）',reads,{clients:200,elapsedMs:Math.round(performance.now()-start)});
 assert.ok(reads.every(r=>r.status===200),'Online requests must all succeed');
 report.checks.push('200 个账号共 1800 次读取全部成功。');save();

 stage='login';
 console.log('Testing 200 simultaneous login clients with bounded busy waiting…');
 globalThis.fetch=async(url,init={})=>{
  const start=performance.now(),headers=new Headers(init.headers);headers.set('Origin',origin);
  const response=await originalFetch(new URL(url,origin),{...init,headers});
  loginHttp.push({status:response.status,ms:performance.now()-start});
  if(response.status>=500&&!(response.headers.get('content-type')??'').includes('json')){
   report.unexpectedLoginResponses??=[];
   if(report.unexpectedLoginResponses.length<5)report.unexpectedLoginResponses.push((await response.clone().text()).slice(0,500));
  }
  if(response.ok){const name=JSON.parse(init.body).username;cookieByUser.set(name,response.headers.get('set-cookie')?.split(';')[0]);}
  return response;
 };
 let monitoring=true;const monitor=[];
 const monitored=(async()=>{while(monitoring){monitor.push(await call(users[0],'state?yearId='+year));await pause(1000);}})();
 const loginStart=performance.now();let responses;
 try{responses=await pool(200,200,async i=>{const start=performance.now();try{await loginWithWaiting({username:users[i].username,password:'Burst-Test-Only-2026!'},()=>{});return {status:200,ms:performance.now()-start};}catch(error){return {status:error.status??0,ms:performance.now()-start,error:error.message};}});}
 finally{monitoring=false;await monitored;globalThis.fetch=originalFetch;}
 summary('200 人同时登录（含繁忙等待）',responses,{clients:200,elapsedMs:Math.round(performance.now()-loginStart),examples:responses.filter(r=>r.status!==200).slice(0,3)});
 summary('登录期间已有会话查询',monitor);
 report.loginAttempts=summary('登录HTTP尝试（503为明确拒绝，非成功）',loginHttp);
 assert.ok(responses.every(r=>r.status===200),'All 200 clients must finish login within bounded waiting');
 assert.ok(monitor.every(r=>r.status===200),'Existing sessions must remain usable during login');
 await pool(200,5,async i=>{const cookie=cookieByUser.get(users[i].username);assert.ok(cookie);const r=await call({cookie},'me');assert.equal(r.status,200);assert.equal(r.body.email,users[i].username);});
 report.checks.push('200 个新登录会话逐个验证身份一致，登录期间已有会话查询全部成功。');save();

 }
 console.log('Checking simultaneous upload capacity and atomic 30-photo batch cap…');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlUAAAAASUVORK5CYII=','base64');
 const payloads=users.map(()=>{const pad=Buffer.alloc(512*1024);pad.write(randomUUID());return Buffer.concat([png,pad]);});
 const upload=(i,batchId,payload=payloads[i])=>{const f=new FormData();f.set('yearId',year);f.set('date','2026-10-20');f.set('batchId',batchId);f.set('file',new Blob([payload],{type:'image/png'}),'synthetic.png');return call(users[i], 'intake',f,60000);};
 if(!capacityOnly){
 stage='upload';
 const uploads=await pool(200,200,i=>upload(i,randomUUID()));summary('200 人同时各上传512KiB照片',uploads);
 assert.ok(uploads.every(r=>r.status===200),'All 200 uploads must succeed');
 await pool(200,5,async i=>{const r=await call(users[i],'intake/photo/'+uploads[i].body.id);assert.equal(r.status,200);assert.equal(r.hash,hash(payloads[i]));assert.equal(r.bytes,payloads[i].length);});
 assert.equal((await call(users[1],'intake/photo/'+uploads[0].body.id)).status,403);
 report.checks.push('200 张上传照片全部下载并核对 SHA256；跨账号读取仍被拒绝。');
 }
 stage='capacity';
 const batch=randomUUID(),capped=await pool(36,36,i=>upload(0,batch,Buffer.concat([png,Buffer.from(randomUUID())])));
 report.capacityResponses=capped.map(({status,body})=>({status,error:body?.error}));
 assert.equal(capped.filter(r=>r.status===200).length,30);assert.equal(capped.filter(r=>r.status===400&&r.body.error?.includes('30')).length,6);
 report.checks.push('同一批次 36 张同时上传，30 张成功，6 张明确拒绝，未突破批次上限。');
 const final=await call(admin,'state?yearId='+year);assert.equal(final.status,200);assert.equal(final.body.students.length,6000);
 assert.equal(final.body.intake.filter(p=>p.batch_id===batch).length,30);
 report.checks.push('结束后全校仍为 6000 名学生，名单未改变，同批次照片记录恰为 30 条。');
}catch(error){report.failedStage=stage;report.failure=error.message;throw error;}finally{globalThis.fetch=originalFetch;save();console.log('REPORT '+path.join(process.env.LOAD_REPORT_DIR,'stability.md'));}
