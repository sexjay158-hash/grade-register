import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';

const base=process.env.TEST_BASE_URL,state=path.resolve(process.env.TEST_STATE_DIR??'.');
assert.ok(base&&new URL(base).hostname==='127.0.0.1'&&path.dirname(state)===process.cwd()&&path.basename(state).startsWith('.tmp-burst-verify-'),'Use the isolated verification harness');
const {admin,year,users}=JSON.parse(fs.readFileSync(path.join(state,'fixture.json'),'utf8'));
const clients=Number(process.env.TEST_CLIENTS),origin=new URL(base).origin,reportDir=process.env.LOAD_REPORT_DIR;
assert.equal(users.length,clients);assert.ok(reportDir);
const report={date:new Date().toISOString(),environment:'isolated local Worker/D1/R2; 6000 synthetic students, 10 colleges, 200 groups',clients,machine:{platform:process.platform,node:process.version,logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1024**3)},requestTimeoutMs:15000,results:[],checks:[]};
const failures=[];

async function call(user,endpoint,timeoutMs=15000){
 const started=performance.now();
 try{
  const response=await fetch(base+endpoint,{headers:{Origin:origin,Cookie:user.cookie},signal:AbortSignal.timeout(timeoutMs)});
  const text=await response.text();let body;try{body=JSON.parse(text);}catch{}
  let valid=response.status===200&&body!==undefined,error;
  if(valid&&endpoint==='me')valid=body.email===user.username;
  if(valid&&endpoint==='years')valid=Array.isArray(body)&&body.some(row=>row.id===year);
  if(valid&&endpoint.startsWith('state?'))valid=body.yearId===year&&Array.isArray(body.students)&&Array.isArray(body.groups)&&(user===admin||body.students.length===600&&body.groups.length===20&&body.students.every(row=>row.college===user.college&&row.management_cohort==='2024')&&body.groups.every(row=>row.college===user.college));
  if(!valid)error=response.status===200?'Unexpected response or scope mismatch':body?.code??body?.error??'Non-JSON error';
  return {status:response.status,ms:performance.now()-started,valid,error,body};
 }catch(error){return {status:0,ms:performance.now()-started,valid:false,error:error.name+': '+error.message};}
}
const compact=({body,...result})=>result;
const percentile=(times,p)=>times.length?Math.round(times[Math.max(0,Math.ceil(times.length*p)-1)]):null;
function summarize(name,rows,elapsedMs){
 const times=rows.map(row=>row.ms).sort((a,b)=>a-b),statuses={};
 for(const row of rows)statuses[row.status]=(statuses[row.status]??0)+1;
 const result={name,clients,requests:rows.length,successes:rows.filter(row=>row.valid).length,statuses,invalidResponses:rows.filter(row=>row.status===200&&!row.valid).length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),p99Ms:percentile(times,.99),maxMs:Math.round(times.at(-1)??0),elapsedMs:Math.round(elapsedMs),examples:rows.filter(row=>!row.valid).slice(0,5)};
 report.results.push(result);console.log(JSON.stringify(result));
 if(result.successes!==result.requests)failures.push(`${name}: ${result.successes}/${result.requests}`);
 save();return result;
}
function save(){
 fs.mkdirSync(reportDir,{recursive:true});
 fs.writeFileSync(path.join(reportDir,'online.json'),JSON.stringify(report,null,2)+'\n');
 const lines=[`# ${clients} 人在线压力测试（${report.date.slice(0,10)}）`,'',report.environment,'','| 场景 | 成功/请求 | P95(ms) | 最大(ms) |','|---|---:|---:|---:|',...report.results.map(row=>`| ${row.name} | ${row.successes}/${row.requests} | ${row.p95Ms} | ${row.maxMs} |`),'','## 校验','',...report.checks.map(value=>'- '+value),'','## 边界','',`${clients} 个不同账号和有效会话预置在隔离库中并逐个验证身份；密码保持 600000 次 PBKDF2-SHA256。在线访问每人 3 轮身份、学期、状态，共 ${clients*9} 次读取，首次进入分散于 12 秒，轮间停顿 10–14 秒。另测 ${clients} 个客户端同一时刻读取本院状态。每次请求 15 秒截止，不自动重试，成功率还验证身份和学院/年级数据范围。`,'','本轮没有测试同时输入密码登录、上传照片或 OCR；这是本机短时承载测试，不代表公网/生产环境或长期容量。'];
 if(report.failure)lines.push('','测试失败：'+report.failure);
 fs.writeFileSync(path.join(reportDir,'online.md'),lines.join('\n')+'\n');
}
const fingerprint=body=>createHash('sha256').update(JSON.stringify(['students','groups','events','grades','intake','intakeLinks'].map(key=>body[key]))).digest('hex');
try{
 const before=await call(admin,'state?yearId='+year);assert.ok(before.valid,'Initial admin state must be available');
 assert.equal(before.body.students.length,6000);const beforeHash=fingerprint(before.body);
 report.checks.push(`${clients} 个独立账号和会话已逐个验证，未复用单个账号模拟全部用户。`);
 console.log(`Testing ${clients} online clients, three reading cycles with think time…`);
 const reads=[],start=performance.now();
 await Promise.all(users.map(async(user,index)=>{
  await pause(index*12000/clients);
  for(let cycle=0;cycle<3;cycle++){
   for(const endpoint of ['me','years','state?yearId='+year])reads.push(compact(await call(user,endpoint)));
   if(cycle<2)await pause(10000+(index%5)*1000);
  }
 }));
 summarize(`${clients} 人在线读取（三轮）`,reads,performance.now()-start);
 console.log(`Testing ${clients} simultaneous state reads without a ramp or retry…`);
 const burstStart=performance.now(),burst=await Promise.all(users.map(async user=>compact(await call(user,'state?yearId='+year))));
 summarize(`${clients} 人同一时刻读取状态`,burst,performance.now()-burstStart);
 console.log('Checking recovery and unchanged business data…');
 const recoveryStart=performance.now(),recovery=[];let recovered;
 while(performance.now()-recoveryStart<45000){
  const row=await call(admin,'state?yearId='+year,Math.max(1,Math.min(15000,Math.ceil(45000-(performance.now()-recoveryStart)))));
  recovery.push(compact(row));
  if(row.valid){recovered=row;break;}await pause(1000);
 }
 report.recovery={elapsedMs:Math.round(performance.now()-recoveryStart),attempts:recovery};
 assert.ok(recovered,'Service did not recover within 45 seconds');
 assert.equal(fingerprint(recovered.body),beforeHash,'Roster, groups, grades, events and photo metadata must remain unchanged');
 report.checks.push('压力结束后管理员仍可读取状态，6000 名学生及分组、成绩、活动、照片元数据摘要与开始时一致。');
 if(failures.length)throw new Error(failures.join('; '));
 report.checks.push('两个阶段均无请求失败、身份混淆或权限范围异常。');
}catch(error){report.failure=error.message;throw error;}
finally{save();console.log('REPORT '+path.join(reportDir,'online.md'));}
