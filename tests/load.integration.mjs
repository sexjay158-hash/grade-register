import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';

const base=process.env.TEST_BASE_URL,token=process.env.TEST_BOOTSTRAP_TOKEN;
assert.ok(base&&token&&new URL(base).hostname==='127.0.0.1','Run scripts/verify-load.mjs against its isolated local Worker only');
const origin=new URL(base).origin,password='Load-Test-Only-2026!',results=[],checks=[];
const admin={username:'load-admin',cookie:''},users=[];
const report={date:'2026-10-20',environment:'Windows local production build, Wrangler local D1/R2; no public tunnel, real phones or OCR inference',machine:{logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1024**3)},dataset:{students:6000,colleges:10,groups:200,seededGradeActivities:60,seededGrades:1800},results,checks};
async function call(user,endpoint,data,method=data===undefined?'GET':'POST'){
 const start=performance.now();
 try{
  const headers={Origin:origin};if(user?.cookie)headers.Cookie=user.cookie;
  if(data!==undefined&&!(data instanceof FormData))headers['Content-Type']='application/json';
  const response=await fetch(base+endpoint,{method,headers,body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
  let body;if(response.headers.get('content-type')?.includes('image/'))body={bytes:(await response.arrayBuffer()).byteLength};else{const text=await response.text();try{body=JSON.parse(text);}catch{body={error:text.slice(0,140)};}}
  return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]??'',ms:performance.now()-start};
 }catch(error){return {status:0,body:{error:error.name+': '+error.message},ms:performance.now()-start};}
}
async function must(user,endpoint,data,method){const r=await call(user,endpoint,data,method);assert.equal(r.status,200,endpoint+': '+JSON.stringify(r.body));return r;}
async function pool(total,concurrency,work){let next=0;const out=new Array(total);await Promise.all(Array.from({length:Math.min(total,concurrency)},async()=>{while(next<total){const index=next++;out[index]=await work(index);}}));return out;}
function stats(name,concurrency,records,elapsed,expected=r=>r.status===200){
 const times=records.map(r=>r.ms).sort((a,b)=>a-b),p=q=>Math.round(times[Math.min(times.length-1,Math.ceil(times.length*q)-1)]??0),errors=records.filter(r=>!expected(r));
 const statuses={};for(const r of records)statuses[r.status]=(statuses[r.status]??0)+1;
 const row={name,concurrency,requests:records.length,statuses,errors:errors.length,errorPct:+(errors.length/records.length*100).toFixed(2),p50Ms:p(.5),p95Ms:p(.95),maxMs:p(1),requestsPerSecond:+(records.length/(elapsed/1000)).toFixed(2),elapsedMs:Math.round(elapsed),examples:errors.slice(0,3).map(r=>r.body?.error??'unexpected response')};results.push(row);save();console.log(JSON.stringify(row));return row;
}
function save(){
 const dir=process.env.LOAD_REPORT_DIR;assert.ok(dir);fs.mkdirSync(dir,{recursive:true});
 const stem='concurrency-20261020';fs.writeFileSync(path.join(dir,stem+'.json'),JSON.stringify(report,null,2)+'\n');
 const lines=['# 并发压力测试（2026-10-20）','','独立本地生产构建 + Wrangler 本地 D1/R2。没有访问真实业务库。',`测试机：${report.machine.logicalCpus} 个逻辑 CPU，${report.machine.memoryGiB} GiB 内存。`,'','数据：6000 名合成学生、10 个学院、200 个小组、60 个已填分活动（1800 条成绩）。账号为合成账号。','采用无思考时间的闭环客户端；并发数是测试客户端数，不是线上承载人数保证。单请求超时 15 秒，不自动重试，响应体读取计入耗时。','','| 场景 | 并发客户端 | 请求数 | 非预期失败 | P50(ms) | P95(ms) | 最慢(ms) | 请求/秒 |','|---|---:|---:|---:|---:|---:|---:|---:|'];
 for(const r of results)lines.push(`| ${r.name} | ${r.concurrency} | ${r.requests} | ${r.errors} (${r.errorPct}%) | ${r.p50Ms} | ${r.p95Ms} | ${r.maxMs} | ${r.requestsPerSecond} |`);
 lines.push('','## 数据与安全校验','',...checks.map(s=>'- '+s),'','## 限制','','不包括公网延迟、临时隧道、移动浏览器、手机 OCR 运算、云端 D1 配额和线上区域差异；不能将本地结果直接当作正式网站容量。读写成功不代表页面交互不卡顿。混合查询包含登录身份、学期和完整数据接口；各请求类别详见 JSON。图片上传测试不执行 OCR。照片为含唯一填充内容的合成 PNG，文件大小见场景名称。');
 fs.writeFileSync(path.join(dir,stem+'.md'),lines.join('\n')+'\n');
}
try{
 console.log('Seeding synthetic accounts and 6000 students…');
 admin.cookie=(await must(null,'auth/bootstrap',{setupToken:token,username:admin.username,password})).cookie;
 const year=(await must(admin,'years')).body[0].id,colleges=Array.from({length:10},(_,i)=>'压测学院'+String(i).padStart(2,'0'));
 for(const name of colleges)await must(admin,'colleges',{name});
 const rows=Array.from({length:6000},(_,i)=>({sid:String(2024+Math.floor(i/30)%3)+String(i).padStart(7,'0'),name:'压测学生'+i,college:colleges[Math.floor(i/600)],group:'压测小组'+Math.floor(i/30)}));
 for(let offset=0;offset<rows.length;offset+=500)await must(admin,'roster',{yearId:year,rows:rows.slice(offset,offset+500)});
 for(let i=0;i<20;i++){const user={username:'load-user-'+i,cookie:'',role:i%4===0?'college_lead':'recorder',college:colleges[i%10],cohort:String(2024+i%3)};await must(admin,'members',{...user,password});user.cookie=(await must(null,'auth/login',{username:user.username,password})).cookie;users.push(user);}
 const state=(await must(admin,'state?yearId='+year)).body;assert.equal(state.students.length,6000);assert.equal(state.groups.length,200);
 const groups=state.groups,events=[];
 for(let i=0;i<60;i++){const g=groups[i],event=(await must(admin,'events',{groupId:g.id,date:'2026-10-20'})).body.id;const members=state.students.filter(s=>s.group_id===g.id);await must(admin,'event/'+event,{action:'save',version:0,rows:members.map(s=>({sid:s.sid,state:'scored',score:80,note:''}))},'PUT');events.push({id:event,gid:g.id,sid:members[0].sid,version:1});}
 checks.push('种子校验：6000 名学生、200 个小组；60 个活动各 30 条成绩，1800 条成绩。');
 for(const concurrency of [5,10,25,50]){const start=performance.now();const records=await pool(concurrency,concurrency,i=>call(null,'auth/login',{username:users[i%users.length].username,password}));stats('同时登录',concurrency,records,performance.now()-start);}
 let stopReads=false;
 for(const concurrency of [10,25,50,100]){
  if(stopReads)break;const start=performance.now(),records=[];
  await pool(concurrency,concurrency,async i=>{const user=i%10===0?admin:users[i%users.length];for(let round=0;round<2;round++)for(const endpoint of ['me','years','state?yearId='+year]){const r=await call(user,endpoint);records.push({...r,endpoint:endpoint.split('?')[0]});if(r.status===200&&endpoint.startsWith('state')&&user!==admin){assert.ok(r.body.students.every(s=>s.college===user.college));if(user.role==='recorder')assert.ok(r.body.students.every(s=>s.management_cohort===user.cohort));}}});
  const summary=stats('身份/学期/数据混合查询',concurrency,records,performance.now()-start);for(const endpoint of ['me','years','state']){const subset=records.filter(r=>r.endpoint===endpoint);const times=subset.map(r=>r.ms).sort((a,b)=>a-b);summary[endpoint]={requests:subset.length,errors:subset.filter(r=>r.status!==200).length,p95Ms:Math.round(times[Math.ceil(times.length*.95)-1])};}
  stopReads=summary.errorPct>10;if(stopReads)checks.push('混合查询错误率超过 10%，停止继续升压，保护测试机。');
 }
 checks.push('混合查询中所有成功响应均验证学院和年级隔离，未发现越权学生数据。');
 for(const concurrency of [10,25,50]){const selected=events.slice(0,concurrency),start=performance.now();const records=await pool(concurrency,concurrency,i=>call(admin,'event/'+selected[i].id,{version:selected[i].version,sid:selected[i].sid,score:81+i},'PATCH'));stats('不同活动同时改分',concurrency,records,performance.now()-start);for(let i=0;i<selected.length;i++)if(records[i].status===200)selected[i].version=records[i].body.version;}
 const target=events[0],version=(await must(admin,'event/'+target.id)).body.event.version,startConflict=performance.now();
 const conflicts=await pool(20,20,i=>call(admin,'event/'+target.id,{version,sid:target.sid,score:200+i},'PATCH'));
 stats('同一成绩冲突保护',20,conflicts,performance.now()-startConflict,r=>r.status===200||r.status===400&&String(r.body.error).includes('已被更新'));
 const winners=conflicts.filter(r=>r.status===200);assert.equal(winners.length,1,'same-version edits must have exactly one winner');
 const final=(await must(admin,'event/'+target.id)).body;assert.equal(final.event.version,version+1);assert.equal(final.scores.find(s=>s.sid===target.sid).score,winners[0].body.score);checks.push('20 个请求携同一版本同时改同一成绩：仅 1 个成功，其余冲突拒绝，最终分数与成功请求一致。');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlUAAAAASUVORK5CYII=','base64');
 for(const concurrency of [5,10,20]){const start=performance.now();const records=await pool(concurrency,concurrency,i=>{const pad=Buffer.alloc(512*1024);pad.write(crypto.randomUUID());const form=new FormData();form.set('batchId',crypto.randomUUID());form.set('yearId',year);form.set('date','2026-10-20');form.set('file',new Blob([png,pad],{type:'image/png'}),'synthetic.png');return call(users[i%users.length],'intake',form);});stats('同时上传512KiB照片',concurrency,records,performance.now()-start);for(let i=0;i<records.length;i++)if(records[i].status===200){const r=await must(users[i%users.length],'intake/photo/'+records[i].body.id);assert.equal(r.status,200);assert.equal(r.body.bytes,512*1024+png.length);}}
 const recoveryStart=performance.now(),recovery=await pool(10,5,()=>call(admin,'state?yearId='+year));stats('压测后恢复读取',5,recovery,performance.now()-recoveryStart);assert.ok(recovery.every(r=>r.status===200),'recovery requests must succeed');assert.equal(recovery[0].body.students.length,6000);checks.push('压测结束后工作进程仍能响应；学生仍为 6000 人。');
 console.log('REPORT '+path.join(process.env.LOAD_REPORT_DIR,'concurrency-20261020.md'));
}catch(error){report.failure=error.message;console.error('Load check failure:',error.message);throw error;}finally{save();}
