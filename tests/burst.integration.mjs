import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pbkdf2,randomBytes,randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const run=promisify(execFile),derive=promisify(pbkdf2),base=process.env.TEST_BASE_URL,token=process.env.TEST_BOOTSTRAP_TOKEN,state=path.resolve(process.env.TEST_STATE_DIR??'.');
assert.ok(base&&token&&new URL(base).hostname==='127.0.0.1'&&path.dirname(state)===process.cwd()&&path.basename(state).startsWith('.tmp-burst-verify-'),'Use scripts/verify-burst.mjs with its isolated database only');
const origin=new URL(base).origin,fixturePath=path.join(state,'fixture.json'),reportPath=path.join(process.env.LOAD_REPORT_DIR,'concurrency-200-20261020.json'),password='Burst-Test-Only-2026!',phase=process.argv[2];
const hash=value=>createHash('sha256').update(value).digest('hex');
async function call(user,endpoint,data,timeoutMs=30000){
 const started=performance.now();
 try{const headers={Origin:origin};if(user?.cookie)headers.Cookie=user.cookie;if(data&&!(data instanceof FormData))headers['Content-Type']='application/json';
  const response=await fetch(base+endpoint,{method:data?'POST':'GET',headers,body:data?data instanceof FormData?data:JSON.stringify(data):undefined,signal:AbortSignal.timeout(timeoutMs)});
  const bytes=Buffer.from(await response.arrayBuffer());let body;try{body=JSON.parse(bytes.toString());}catch{body={error:bytes.toString().slice(0,160)};}
  return {status:response.status,ms:performance.now()-started,body,cookie:response.headers.get('set-cookie')?.split(';')[0]??'',bytes:bytes.length,hash:hash(bytes)};
 }catch(e){return {status:0,ms:performance.now()-started,body:{error:e.name+': '+e.message}};}
}
async function must(user,endpoint,data){const r=await call(user,endpoint,data);assert.equal(r.status,200,endpoint+': '+JSON.stringify(r.body));return r;}
async function pool(total,concurrency,work){let next=0;const results=new Array(total);await Promise.all(Array.from({length:Math.min(total,concurrency)},async()=>{while(next<total){const i=next++;results[i]=await work(i);}}));return results;}
function summarize(name,rows,elapsed,timeoutMs){const times=rows.map(r=>r.ms).sort((a,b)=>a-b),statuses={};for(const row of rows)statuses[row.status]=(statuses[row.status]??0)+1;return {name,clients:200,requests:rows.length,timeoutMs,successes:rows.filter(r=>r.status===200).length,timeouts:rows.filter(r=>r.status===0&&r.body.error.startsWith('TimeoutError')).length,failed:rows.filter(r=>r.status!==200).length,statuses,p50Ms:Math.round(times[99]),p95Ms:Math.round(times[189]),maxMs:Math.round(times.at(-1)),elapsedMs:Math.round(elapsed),successesPerSecond:+(rows.filter(r=>r.status===200).length/(elapsed/1000)).toFixed(2),examples:rows.filter(r=>r.status!==200).slice(0,3).map(r=>r.body.error)};}
function save(report){fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');const lines=['# 200 人突发并发测试（2026-10-20）','','独立本地 Worker / D1 / R2，200 个不同账号。没有访问真实业务库。账号通过独立库预置，使用 600000 次 PBKDF2-SHA256 及各自随机盐；登录仍由真实登录接口验证。上传使用预置的有效独立会话，以单独测上传能力。',`数据：6000 名合成学生、10 个学院、200 个小组。测试机：${report.machine.logicalCpus} 逻辑 CPU、${report.machine.memoryGiB} GiB 内存。`,'','两个阶段各同时发出 200 个请求，不自动重试。登录超时 20 秒，与登录表单提交上限一致；上传超时 30 秒。阶段之间重启独立测试 Worker，避免尚未完成的密码校验污染上传结果。','','| 场景 | 成功 | 失败 | 超时 | P95(ms) | 阶段耗时(ms) |','|---|---:|---:|---:|---:|---:|'];for(const r of report.results)lines.push(`| ${r.name} | ${r.successes}/200 | ${r.failed} | ${r.timeouts} | ${r.p95Ms} | ${r.elapsedMs} |`);lines.push('','## 校验','',...report.checks.map(s=>'- '+s),'','## 限制','','登录成功指在截止时间内收到成功响应；超时不能断言服务器一定未建立会话。图片为约 512 KiB 的合成 PNG，每人一张、不同内容，总量约 100 MiB；不是每人 30 张。照片成功后从接口下载并核对长度与 SHA256。没有运行手机端 OCR，也没有测试公网带宽、真实手机或云端容量。');if(report.failure)lines.push('','测试中断：'+report.failure);fs.writeFileSync(reportPath.replace('.json','.md'),lines.join('\n')+'\n');}

let report=fs.existsSync(reportPath)&&phase==='upload'?JSON.parse(fs.readFileSync(reportPath,'utf8')):{date:'2026-10-20',machine:{logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1024**3)},results:[],checks:[]};
try{
 if(phase==='login'){
  const admin={cookie:(await must(null,'auth/bootstrap',{setupToken:token,username:'burst-admin',password})).cookie},year=(await must(admin,'years')).body[0].id;
  const colleges=Array.from({length:10},(_,i)=>'并发学院'+i);for(const name of colleges)await must(admin,'colleges',{name});
  const rows=Array.from({length:6000},(_,i)=>({sid:'2024'+String(i).padStart(7,'0'),name:'并发学生'+i,college:colleges[Math.floor(i/600)],group:'并发组'+Math.floor(i/30)}));
  for(let offset=0;offset<rows.length;offset+=500)await must(admin,'roster',{yearId:year,rows:rows.slice(offset,offset+500)});
  const users=await pool(200,8,async i=>{const salt=randomBytes(16).toString('hex'),session=randomBytes(32).toString('hex');return {id:randomUUID(),username:'burst-user-'+i,college:colleges[i%10],salt,passwordHash:(await derive(password,Buffer.from(salt,'hex'),600000,32,'sha256')).toString('hex'),sessionHash:hash(session),cookie:'gr_session='+session};});
  const sql=value=>"'"+String(value).replaceAll("'","''")+"'",created=new Date().toISOString(),expires=new Date(Date.now()+86400000).toISOString();
  const statements=users.flatMap(u=>[`INSERT INTO local_accounts(id,username,password_hash,salt,iterations,role,college,cohort,active,created,updated) VALUES(${[u.id,u.username,u.passwordHash,u.salt].map(sql).join(',')},600000,'recorder',${sql(u.college)},'2024',1,${sql(created)},${sql(created)});`,`INSERT INTO local_sessions(token_hash,account_id,created,expires) VALUES(${[u.sessionHash,u.id,created,expires].map(sql).join(',')});`]);
  const file=path.join(state,'accounts.sql');fs.writeFileSync(file,statements.join('\n'));
  await run(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',state,'--file',file],{cwd:process.cwd(),windowsHide:true,maxBuffer:8*1024*1024});
  fs.unlinkSync(file);assert.equal(new Set(users.map(u=>u.username)).size,200);assert.equal(new Set(users.map(u=>u.cookie)).size,200);
  await pool(200,5,async i=>{const r=await must(users[i],'me');assert.equal(r.body.email,users[i].username);});
  const initial=await must(admin,'state?yearId='+year);assert.equal(initial.body.students.length,6000);
  fs.writeFileSync(fixturePath,JSON.stringify({admin,year,users:users.map(({username,college,cookie})=>({username,college,cookie}))}));
  report.checks.push('200 个不同账号与 200 个不同会话逐个校验，均能读取本人身份。');
  console.log('Starting 200 distinct simultaneous password logins…');const start=performance.now(),responses=await pool(200,200,i=>call(null,'auth/login',{username:users[i].username,password},20000));const row=summarize('200账号同时登录',responses,performance.now()-start,20000);report.results.push(row);console.log(JSON.stringify(row));
 }else if(phase==='upload'){
  const {admin,year,users}=JSON.parse(fs.readFileSync(fixturePath,'utf8'));assert.equal((await must(admin,'state?yearId='+year)).body.students.length,6000);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlUAAAAASUVORK5CYII=','base64');
  const payloads=users.map(()=>{const pad=Buffer.alloc(512*1024);pad.write(randomUUID());return Buffer.concat([png,pad]);});
  console.log('Starting 200 simultaneous uploads (~100 MiB total), without OCR…');const start=performance.now();
  const responses=await pool(200,200,i=>{const form=new FormData();form.set('yearId',year);form.set('date','2026-10-20');form.set('batchId',randomUUID());form.set('file',new Blob([payloads[i]],{type:'image/png'}),'synthetic-'+i+'.png');return call(users[i],'intake',form,30000);});
  const row=summarize('200人同时各上传一张512KiB照片',responses,performance.now()-start,30000);report.results.push(row);save(report);console.log(JSON.stringify(row));
  const successes=responses.map((r,i)=>({r,i})).filter(({r})=>r.status===200);let verified=0;
  await pool(successes.length,5,async index=>{const {r,i}=successes[index],download=await must(users[i],'intake/photo/'+r.body.id);assert.equal(download.bytes,payloads[i].length);assert.equal(download.hash,hash(payloads[i]));verified++;});
  report.checks.push(`上传成功的 ${verified} 张照片全部下载校验长度及 SHA256 一致。`);
  if(successes.length){const {r,i}=successes[0],other=(i+1)%200;assert.equal((await call(users[other],'intake/photo/'+r.body.id)).status,403);report.checks.push('另一个账号无法读取他人未归组照片。');}
  const final=await must(admin,'state?yearId='+year);assert.equal(final.body.students.length,6000);report.checks.push('压力结束后可读取状态，学生仍为 6000 名。');
  console.log('REPORT '+reportPath.replace('.json','.md'));
 }else throw new Error('Expected login or upload phase');
}catch(error){report.failure=error.message;throw error;}finally{save(report);}
