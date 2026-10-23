import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const base=process.env.TEST_BASE_URL,origin=new URL(base).origin,password='a6P9x2',admin={cookie:''},anonymous={cookie:''};
const report={started:new Date().toISOString(),environment:'本机独立 workerd / D1 SQLite / R2 模拟存储，非生产服务器',checks:0,authAttempts:0,busyAdmissions:0,metrics:[],limits:['读取压测使用 40 个真实激活账号；100 并发请求会复用这些账号，不代表 1000 人同时使用。','登录/激活仅对明确 LOGIN_BUSY 限流响应等待重试，激活指标包含等待时间；成功率是逻辑操作成功率，原始限流次数单列。','照片测试提供已识别文字，仅验证匹配、权限与入分，不代表手写 OCR 识别准确率。','未测试真实手机、跨省网络和正式云端容量。'],failure:null};
const reportDir=process.env.GROUP_ACCOUNT_REPORT_DIR;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);report.checks++;};
const ok=(condition,label)=>{assert.ok(condition,label);report.checks++;};
async function callOnce(user,endpoint,data,method=data===undefined?'GET':'POST'){
 const headers={Origin:origin};if(user.cookie)headers.Cookie=user.cookie;
 if(data!==undefined&&!(data instanceof FormData))headers['Content-Type']='application/json';
 const start=performance.now();let response,body;
 try{response=await fetch(base+endpoint,{method,headers,body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data),signal:AbortSignal.timeout(60000)});const text=await response.text();try{body=JSON.parse(text);}catch{body={text:text.slice(0,300),bytes:Buffer.byteLength(text)};}}
 catch(error){return {status:0,body:{error:error.message},ms:performance.now()-start,cookie:''};}
 return {status:response.status,body,ms:performance.now()-start,cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
}
async function call(user,endpoint,data,method){const start=performance.now();for(let i=0;;i++){const r=await callOnce(user,endpoint,data,method);if(endpoint==='auth/login'||endpoint==='auth/activate')report.authAttempts++;if(r.status!==503||r.body.code!=='LOGIN_BUSY')return {...r,ms:performance.now()-start};report.busyAdmissions++;if(i>=60)return {...r,ms:performance.now()-start};await new Promise(resolve=>setTimeout(resolve,1000+Math.random()*500));}}
async function must(user,endpoint,data,method){const result=await call(user,endpoint,data,method);eq(result.status,200,`${endpoint}: ${JSON.stringify(result.body).slice(0,300)}`);return result;}
async function login(user){const r=await must(user,'auth/login',{username:user.username,password});user.cookie=r.cookie;return r;}
async function pool(count,concurrency,work){const results=new Array(count);let next=0;await Promise.all(Array.from({length:Math.min(count,concurrency)},async()=>{while(next<count){const i=next++;results[i]=await work(i);}}));return results;}
function metric(name,concurrency,records,elapsed){const times=records.map(r=>r.ms).sort((a,b)=>a-b);const value={name,concurrency,requests:records.length,success:records.filter(r=>r.status===200).length,p50Ms:Math.round(times[Math.ceil(times.length*.5)-1]??0),p95Ms:Math.round(times[Math.ceil(times.length*.95)-1]??0),maxMs:Math.round(times.at(-1)??0),elapsedMs:Math.round(elapsed)};value.successPct=Number((value.success/records.length*100).toFixed(2));report.metrics.push(value);console.log(JSON.stringify(value));return value;}
function save(){mkdirSync(reportDir,{recursive:true});writeFileSync(path.join(reportDir,'results.json'),JSON.stringify(report,null,2));writeFileSync(path.join(reportDir,'验收测试报告.md'),`# 小组批量开户与权限验收\n\n时间：${report.started}\n\n环境：${report.environment}\n\n学生：${report.students??0}；小组：${report.groups??0}；创建小组账号：${report.accounts??0}；实际激活：${report.activated??0}。\n\n登录/激活实际 HTTP 请求 ${report.authAttempts} 次，其中明确限流 ${report.busyAdmissions} 次（仅对此等待重试）。\n\n业务断言通过 ${report.checks} 项。${report.failure?'未通过：'+report.failure:'本轮通过。'}\n\n|场景|并发|请求数|成功数|成功率|P50(ms)|P95(ms)|最大(ms)|总耗时(ms)|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${report.metrics.map(m=>`|${m.name}|${m.concurrency}|${m.requests}|${m.success}|${m.successPct}%|${m.p50Ms}|${m.p95Ms}|${m.maxMs}|${m.elapsedMs}|`).join('\n')}\n\n${report.limits.map(v=>'- '+v).join('\n')}\n\n测试数据和测试账号仅存在于本次隔离数据库；测试结束后由运行器清理。报告不含密码、激活码或会话。\n`);}

try{
 eq((await call(anonymous,'state')).status,401,'匿名不可读成绩');
 const bootstrap=await must(admin,'auth/bootstrap',{setupToken:process.env.TEST_BOOTSTRAP_TOKEN,username:'school-test-admin',password});admin.cookie=bootstrap.cookie;
 const year=(await must(admin,'years')).body[0].id;
 const otherYear=(await must(admin,'years',{label:'隔离测试另一学期'})).body.id;
 console.log('Seeding 20 colleges, 20000 students and 1000 groups…');
 const colleges=Array.from({length:20},(_,i)=>'规模学院'+String(i).padStart(2,'0'));
 for(const name of colleges)await must(admin,'colleges',{name});
 const rows=Array.from({length:20000},(_,i)=>({sid:'2024'+String(i+1).padStart(8,'0'),name:'学生'+String(i+1).padStart(5,'0'),college:colleges[Math.floor(i/1000)],group:'规模组'+String(Math.floor(i/20)).padStart(4,'0'),cohort:'2024'}));
 const seedStart=performance.now();
 for(let i=0;i<rows.length;i+=500){await must(admin,'roster',{yearId:year,rows:rows.slice(i,i+500)});if(i%5000===0)console.log(`Roster ${i+500}/20000`);}
 report.seedMs=Math.round(performance.now()-seedStart);
 const full=(await must(admin,'state?yearId='+year)).body;
 eq(full.students.length,20000);eq(full.groups.length,1000);report.students=20000;report.groups=1000;
 const heads=[{username:'head-college-0',cookie:''},{username:'head-college-1',cookie:''}];
 for(let i=0;i<2;i++){await must(admin,'members',{username:heads[i].username,password,role:'college_lead',college:colleges[i]});await login(heads[i]);}
 const leaders=rows.filter((_,i)=>i%20===0);
 const preview=(await must(admin,'group-accounts',{action:'preview',yearId:year,rows:leaders})).body;
 eq(preview.errors,0);eq(preview.newCount,1000);
 eq((await must(heads[0],'group-accounts',{action:'preview',yearId:year,rows:leaders.slice(0,50)})).body.newCount,50);
 eq((await must(heads[0],'group-accounts',{action:'preview',yearId:year,rows:[leaders[50]]})).body.errors,1);
 const bad=[{...leaders[0],name:'不匹配'},{...leaders[1]},leaders[1],rows[21]];
 ok((await must(admin,'group-accounts',{action:'preview',yearId:year,rows:bad})).body.errors>=3);
 eq((await call(admin,'group-accounts',{action:'issue',yearId:year,rows:bad})).status,400,'错误批次不写入');
 eq((await must(admin,'group-accounts?yearId='+year)).body.accounts.length,0);
 console.log('Provisioning 1000 accounts in batches of 25…');
 const issued=[],issueRecords=[],issueStart=performance.now();
 for(let i=0;i<leaders.length;i+=25){const result=await must(i<50?heads[0]:admin,'group-accounts',{action:'issue',yearId:year,rows:leaders.slice(i,i+25)});issueRecords.push(result);issued.push(...result.body.issued);if(i%250===0)console.log(`Accounts ${i+25}/1000`);}
 metric('批量开户（每批25人）',1,issueRecords,performance.now()-issueStart);
 eq(issued.length,1000);eq(new Set(issued.map(r=>r.activationCode)).size,1000);report.accounts=1000;
 const accountList=(await must(admin,'group-accounts?yearId='+year)).body.accounts;
 eq(accountList.length,1000);ok(!JSON.stringify(accountList).includes('token_hash'));ok(!JSON.stringify(accountList).includes(issued[0].activationCode));
 eq((await must(heads[0],'group-accounts?yearId='+year)).body.accounts.length,50);
 eq((await must(admin,'group-accounts',{action:'preview',yearId:year,rows:leaders})).body.existingCount,1000);
 const repeated=await must(admin,'group-accounts',{action:'issue',yearId:year,rows:leaders.slice(0,25)});eq(repeated.body.created,0);eq(repeated.body.skipped,25);
 eq((await call(anonymous,'auth/login',{username:issued[0].username,password})).status,401,'待激活不能登录');
 eq((await call(anonymous,'auth/activate',{username:issued[0].username,code:issued[0].activationCode,password:'12345'})).status,400);
 eq((await call(anonymous,'auth/activate',{username:issued[0].username,code:'0'.repeat(48),password})).status,400);
 const cross=await fetch(base+'auth/activate',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify({username:issued[0].username,code:issued[0].activationCode,password})});eq(cross.status,403);
 console.log('Activating 40 distinct group leaders…');
 const users=issued.slice(0,40).map(r=>({...r,cookie:''})),activateStart=performance.now();
 const activations=await pool(users.length,4,async i=>{const r=await must(anonymous,'auth/activate',{username:users[i].username,code:users[i].activationCode,password});users[i].cookie=r.cookie;return r;});
 metric('首次激活（真实40账号）',4,activations,performance.now()-activateStart);report.activated=40;
 eq((await call(anonymous,'auth/activate',{username:users[0].username,code:users[0].activationCode,password})).status,400,'激活码不可重放');
 const me=(await must(users[0],'me')).body,ownGroup=full.groups.find(g=>g.name===leaders[0].group),foreignGroup=full.groups.find(g=>g.name===leaders[1].group);
 eq(me.groupId,ownGroup.id);eq(me.role,'recorder');
 const ownState=(await must(users[0],'state?yearId='+year)).body;eq(ownState.students.length,20);eq(ownState.groups.map(g=>g.id),[ownGroup.id]);
 eq((await must(heads[0],'state?yearId='+year)).body.students.length,1000);
 eq((await must(users[0],'years')).body.map(v=>v.id),[year]);
 eq((await call(users[0],'state?yearId='+otherYear)).status,403);
 eq((await call(users[0],'group-accounts?yearId='+year)).status,403);
 eq((await call(users[0],'group-accounts',{action:'issue',yearId:year,rows:[leaders[2]]})).status,403);
 eq((await call(users[0],'students',{yearId:year,...rows[0],oldSid:rows[0].sid,name:'擅自改名'},'PUT')).status,403);
 eq((await call(users[0],'members',{username:'illegal',password,role:'admin'})).status,403);
 eq((await call(users[0],'events',{groupId:foreignGroup.id,date:'2026-10-23'})).status,403);
 eq((await call(heads[1],'group-accounts',{action:'reset',username:users[0].username})).status,403);
 eq((await call(admin,'members',{username:users[0].username,oldUsername:users[0].username,role:'recorder',college:colleges[0],cohort:'2024'},'PUT')).status,400,'旧账号管理入口不能改小组角色');
 eq((await must(users[0],'colleges?yearId='+year)).body[0].students,20,'目录数量也限制到本组');
 const ownEvent=(await must(users[0],'events',{groupId:ownGroup.id,date:'2026-10-23'})).body.id;
 const foreignEvent=(await must(admin,'events',{groupId:foreignGroup.id,date:'2026-10-23'})).body.id;
 eq((await call(users[0],'event/'+foreignEvent)).status,403);
 eq((await call(users[0],'event/'+foreignEvent,{version:0,sid:leaders[1].sid,score:100},'PATCH')).status,403);
 let event=(await must(users[0],'event/'+ownEvent)).body.event;
 const saved=await must(users[0],'event/'+ownEvent,{version:event.version,sid:rows[0].sid,score:90},'PATCH');
 eq(saved.body.score,90);
 eq((await call(users[0],'event/'+ownEvent,{action:'commit',version:saved.body.version,rows:[{sid:rows[0].sid,state:'scored',score:90,note:''}]},'PUT')).status,403);
 await must(heads[0],'event/'+ownEvent,{action:'commit',rating:'good',version:saved.body.version,rows:[{sid:rows[0].sid,state:'scored',score:90,note:''}]},'PUT');
 const exported=(await must(users[0],'export?yearId='+year)).body;eq(exported.length,1);eq(exported[0].score,90);eq(exported[0].converted_score,72);
 event=(await must(users[0],'event/'+ownEvent)).body.event;
 eq((await call(users[0],'event/'+ownEvent,{version:event.version,sid:rows[0].sid,score:99},'PATCH')).status,403,'确认后不可自行改分');
 eq((await call(users[0],'student-grades?yearId='+year+'&sid='+leaders[1].sid)).status,403);
 // Synthetic upload verifies transport and pre-recognized score matching, not OCR accuracy.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlUAAAAASUVORK5CYII=','base64');
 const form=new FormData();form.set('yearId',year);form.set('date','2026-10-23');form.set('batchId',crypto.randomUUID());form.set('file',new Blob([png,crypto.randomUUID()],{type:'image/png'}),'synthetic.png');
 const photo=(await must(users[1],'intake',form)).body.id;
 const processed=(await must(users[1],'intake/process',{id:photo,recognizedLines:[`${leaders[1].sid} ${leaders[1].name} 88`,`${leaders[0].sid} ${leaders[0].name} 95`],recognizedRatingText:'良'})).body;
 eq(processed.matched,1,'跨组识别不能写入别组成绩');
 const photoState=(await must(users[1],'state?yearId='+year)).body;
 eq(photoState.grades.filter(r=>r.state==='scored').length,1);eq(photoState.grades[0].score,88);eq(photoState.events.find(e=>e.id===foreignEvent).rating,'good');
 eq((await call(users[0],'intake/photo/'+photo)).status,403);
 console.log('Seeding one confirmed activity per group and 20000 real score records…');
 const activityStart=performance.now();
 await pool(1000,4,async index=>{
  const group=full.groups.find(g=>g.name===leaders[index].group);
  const id=index===0?ownEvent:index===1?foreignEvent:(await must(admin,'events',{groupId:group.id,date:'2026-10-23'})).body.id;
  let current=(await must(admin,'event/'+id)).body.event;
  if(current.status==='committed'){await must(admin,'event/'+id,{action:'reopen',version:current.version},'PUT');current=(await must(admin,'event/'+id)).body.event;}
  await must(admin,'event/'+id,{action:'commit',version:current.version,rating:'good',rows:rows.slice(index*20,index*20+20).map((s,j)=>({sid:s.sid,state:'scored',score:j===0&&index===0?90:j===0&&index===1?88:75,note:'synthetic scale fixture'}))},'PUT');
  if(index%200===0)console.log(`Activities ${index+1}/1000`);
 });
 report.activitySeedMs=Math.round(performance.now()-activityStart);
 const scoredState=(await must(admin,'state?yearId='+year)).body;eq(scoredState.events.length,1000);eq(scoredState.grades.length,20000);report.activities=1000;report.grades=20000;
 report.limits.push('容量数据含每组一次已确认活动，共1000次活动、20000条成绩；未模拟连续一整学年的照片与成绩增长。');
 for(const concurrency of [5,10,20]){
  const start=performance.now();const uploads=await pool(20,concurrency,async i=>{const pad=Buffer.alloc(512*1024);pad.write(crypto.randomUUID());const body=new FormData();body.set('yearId',year);body.set('date','2026-10-23');body.set('batchId',crypto.randomUUID());body.set('file',new Blob([png,pad],{type:'image/png'}),'synthetic-512KiB.png');const r=await call(users[i],'intake',body);if(r.status===200)ok(!!r.body.id);return r;});
  metric('图片上传（512KiB合成图片，无OCR）',concurrency,uploads,performance.now()-start);ok(uploads.every(r=>r.status===200),'上传压测零失败');
 }
 const activeStart=performance.now();
 for(const concurrency of [10,25,50,100]){
  const start=performance.now();const reads=await pool(100,concurrency,async i=>{const user=users[i%users.length];const r=await call(user,'state?yearId='+year);if(r.status===200){eq(r.body.students.length,20);ok(r.body.students.every(s=>s.group_id===r.body.groups[0].id));eq(r.body.groups.length,1);eq(r.body.students.some(s=>s.sid===user.username),true);}return r;});
  metric('组长工作台读取（40账号复用）',concurrency,reads,performance.now()-start);ok(reads.every(r=>r.status===200),'读取压测零失败');
 }
 report.readLoadMs=Math.round(performance.now()-activeStart);
 const adminStart=performance.now();const adminReads=await pool(5,1,async()=>{const r=await call(admin,'state?yearId='+year);eq(r.body.students?.length,20000);return r;});metric('管理员两万人总表读取',1,adminReads,performance.now()-adminStart);
 console.log('Checking reset, disabling and leader handover…');
 const reset=(await must(heads[0],'group-accounts',{action:'reset',username:users[0].username})).body;
 eq((await call(users[0],'me')).status,401);eq((await call(anonymous,'auth/login',{username:users[0].username,password})).status,401);
 eq((await call(anonymous,'auth/activate',{username:users[0].username,code:users[0].activationCode,password})).status,400);
 users[0].cookie=(await must(anonymous,'auth/activate',{username:users[0].username,code:reset.activationCode,password})).cookie;
 await must(heads[0],'group-accounts',{action:'disable',username:users[0].username});eq((await call(users[0],'state?yearId='+year)).status,401);
 await must(heads[0],'group-accounts',{action:'handover',username:users[0].username});
 eq((await must(admin,'event/'+ownEvent)).body.scores[0].score,90,'交接保留历史成绩');
 const nextLeader=rows[1];const next=(await must(heads[0],'group-accounts',{action:'issue',yearId:year,rows:[nextLeader]})).body.issued[0];
 const replacement={username:next.username,cookie:(await must(anonymous,'auth/activate',{username:next.username,code:next.activationCode,password})).cookie};
 eq((await must(replacement,'state?yearId='+year)).body.students.length,20);eq((await must(replacement,'event/'+ownEvent)).body.scores[0].score,90);
 eq((await call(anonymous,'auth/login',{username:users[0].username,password})).status,401,'原组长不能恢复为年级权限');
 // Reassigning the same former leader after handover must not require a new username.
 await must(heads[0],'group-accounts',{action:'handover',username:replacement.username});
 const returning=(await must(heads[0],'group-accounts',{action:'issue',yearId:year,rows:[rows[0]]})).body;
 eq(returning.created,1);eq(returning.issued[0].username,users[0].username);
 // Two valid requests race for one one-time code: exactly one may activate.
 const race=issued[40];const raced=await pool(2,2,()=>call(anonymous,'auth/activate',{username:race.username,code:race.activationCode,password}));eq(raced.filter(r=>r.status===200).length,1,'并发激活只成功一次');ok(raced.every(r=>[200,400].includes(r.status)));
 report.activated+=2;report.completed=new Date().toISOString();console.log(`PASS ${report.checks} assertions. Auth attempts ${report.authAttempts}; busy admissions ${report.busyAdmissions}. Report: ${reportDir}`);
}catch(error){report.failure=error.message;throw error;}finally{save();}
