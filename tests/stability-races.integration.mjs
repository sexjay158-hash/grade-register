import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL,token=process.env.TEST_BOOTSTRAP_TOKEN;
assert.ok(base&&token&&new URL(base).hostname==='127.0.0.1','Use the isolated verification harness');
const origin=new URL(base).origin,password='Race-Test-Only-2026!',admin={cookie:''},college='事务稳定性测试学院';
const report={date:new Date().toISOString().slice(0,10),checks:[],transportErrors:[]};
async function call(user,endpoint,data,method=data===undefined?'GET':'POST'){
 const headers={Origin:origin,Connection:'close'};if(user?.cookie)headers.Cookie=user.cookie;if(data&&!(data instanceof FormData))headers['Content-Type']='application/json';
 const response=await fetch(base+endpoint,{method,headers,body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
 const text=await response.text();let body;try{body=JSON.parse(text);}catch{body={error:text.slice(0,200)};}
 if(response.status>=500)report.transportErrors.push({endpoint,status:response.status,error:body.error});
 return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
}
async function must(endpoint,data,method){const r=await call(admin,endpoint,data,method);assert.equal(r.status,200,endpoint+': '+JSON.stringify(r.body));return r.body;}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlUAAAAASUVORK5CYII=','base64');
function photoForm(year,eventId,batch=randomUUID()){
 const form=new FormData();form.set('yearId',year);form.set('date','2026-10-20');form.set('batchId',batch);if(eventId)form.set('eventId',eventId);
 form.set('file',new Blob([png,Buffer.from(randomUUID())],{type:'image/png'}),'synthetic.png');return form;
}
try{
 const setup=await call(null,'auth/bootstrap',{setupToken:token,username:'race-admin',password});assert.equal(setup.status,200);admin.cookie=setup.cookie;
 const year=(await must('years'))[0].id;await must('colleges',{name:college});
 const rows=Array.from({length:30},(_,i)=>({sid:'2024'+String(i).padStart(7,'0'),name:'导入学生'+i,college,group:'并发导入组'}));
 const imported=await Promise.all(Array.from({length:20},()=>call(admin,'roster',{yearId:year,rows})));
 assert.ok(imported.some(r=>r.status===200));assert.ok(imported.every(r=>r.status===200||r.status===400&&r.body.error.includes('名单已被其他人修改')||r.status===503));
 let state=await must('state?yearId='+year);assert.equal(state.students.length,30);assert.equal(state.groups.length,1);
 report.checks.push('20 个相同名单导入同时提交：最终恰为 30 名学生、1 个小组，没有重复导入或覆盖。');
 const group=state.groups[0].id;
 const added=await Promise.all(Array.from({length:12},(_,i)=>call(admin,'students',{yearId:year,sid:'20249999999',name:'同号不同人'+i,college,group:'并发导入组'})));
 for(let i=0;i<added.length;i++){
  if(added[i].status===200)continue;
  assert.equal(added[i].status,400,JSON.stringify(added[i]));assert.match(added[i].body.error,/本次未覆盖/);
  await must('students',{yearId:year,sid:'20249999999',name:'同号不同人'+i,college,group:'并发导入组'});
 }
 state=await must('state?yearId='+year);assert.equal(state.students.filter(s=>s.student_number==='20249999999').length,12);assert.equal(new Set(state.students.map(s=>s.sid)).size,42);
 report.checks.push('12 名不同姓名、相同学号同时添加：冲突请求明确拒绝后重提，12 人均独立保留，没有覆盖姓名。');
 const creations=await Promise.all(Array.from({length:20},()=>call(admin,'events',{groupId:group,date:'2026-10-20'})));
 assert.ok(creations.every(r=>r.status===200),JSON.stringify(creations.filter(r=>r.status!==200)));
 assert.equal(new Set(creations.map(r=>r.body.id)).size,1);const event=creations[0].body.id;
 report.checks.push('20 次同时新建同组活动均返回同一个草稿，没有创建多次活动。');
 const caps=await Promise.all(Array.from({length:36},()=>call(admin,'photos',photoForm(year,event))));
 assert.equal(caps.filter(r=>r.status===200).length,30,JSON.stringify(caps.filter(r=>r.status!==200)));
 assert.equal(caps.filter(r=>r.status===400&&r.body.error.includes('30')).length,6);
 assert.equal((await must('event/'+event)).photos.length,30);
 report.checks.push('同一活动同时上传 36 张照片：30 张保存、6 张拒绝，活动照片数恰为 30。');
 assert.equal((await call(admin,'events',{groupId:group,date:'2026-02-31'})).status,400);
 const badDate=photoForm(year);badDate.set('date','2026-02-31');assert.equal((await call(admin,'intake',badDate)).status,400);
 report.checks.push('不存在的日期 2026-02-31 在活动和照片入口均被拒绝。');
 const raceRows=Array.from({length:24},(_,i)=>({sid:'2025'+String(i).padStart(7,'0'),name:'确认学生'+i,college,group:'确认争抢组'+Math.floor(i/2)}));
 await must('roster',{yearId:year,rows:raceRows});state=await must('state?yearId='+year);
 for(let i=0;i<12;i++){
  const g=state.groups.find(g=>g.name==='确认争抢组'+i),students=state.students.filter(s=>s.group_id===g.id),id=(await must('events',{groupId:g.id,date:'2026-10-20'})).id;
  const photo=(await must('intake',photoForm(year))).id;
  const [commit,recognize]=await Promise.all([
   call(admin,'event/'+id,{action:'commit',version:0,rows:[{sid:students[0].sid,state:'scored',score:99,note:''}]},'PUT'),
   call(admin,'intake/process',{id:photo,recognizedLines:[students[1].student_number+' '+students[1].name+' 75']})
  ]);
  assert.ok([200,400].includes(commit.status),JSON.stringify(commit));assert.ok([200,400].includes(recognize.status),JSON.stringify(recognize));
  const detail=await must('event/'+id),current=await must('state?yearId='+year),p=current.intake.find(p=>p.id===photo);
  if(commit.status===200){assert.equal(detail.event.status,'committed');assert.equal(detail.scores.find(s=>s.sid===students[0].sid).score,99);assert.ok(!detail.scores.some(s=>s.sid===students[1].sid&&s.state!=='unrecorded'),'OCR cannot write to a just-confirmed event');}
  if(p.status==='assigned')assert.ok(current.intakeLinks.some(link=>link.intake_id===photo),'assigned photos must have a persisted event link');
  for(const extra of current.events.filter(e=>e.group_id===g.id&&e.id!==id))assert.ok(current.intakeLinks.some(link=>link.intake_id===photo&&link.event_id===extra.id),'new activities must have a persisted photo link');
 }
 report.checks.push('12 组“活动确认与照片识别”并发争抢：已确认成绩未被识别修改，照片没有无关联却显示已处理，未产生孤立活动。');
 const first=await must('intake',photoForm(year)),duplicate=await Promise.all(Array.from({length:10},()=>call(admin,'intake/process',{id:first.id,recognizedLines:[rows[0].sid+' '+rows[0].name+' 88']})));
 assert.ok(duplicate.some(r=>r.status===200));assert.ok(duplicate.every(r=>r.status===200||r.status===400));
 state=await must('state?yearId='+year);assert.equal(state.intakeLinks.filter(l=>l.intake_id===first.id).length,1);
 report.checks.push('同一张照片同时识别 10 次：仅保留一份关联记录，没有重复活动或重复成绩。');
 const sameLabel='并发创建学期';
 const semesters=await Promise.all(Array.from({length:10},()=>call(admin,'years',{label:sameLabel})));
 assert.equal(semesters.filter(r=>r.status===200).length,1);assert.equal((await must('years')).filter(y=>y.label===sameLabel).length,1);
 const second=(await must('years')).find(y=>y.label===sameLabel).id;
 const archived=await Promise.all([year,second].map(id=>call(admin,'years',{id,action:'archive'},'PATCH')));
 assert.equal(archived.filter(r=>r.status===200).length,1);assert.equal((await must('years')).length,1,'concurrent archiving must retain one active semester');
 report.checks.push('10 次同名学期创建仅一次成功；同时归档最后两个学期只能归档一个，负责人仍有可用学期。');
 const reset=await Promise.all(['Winner-A-2026!','Winner-B-2026!'].map(next=>call(admin,'auth/password',{current:password,next})));
 assert.equal(reset.filter(r=>r.status===200).length,1);const winner=reset.find(r=>r.status===200);assert.equal((await call(admin,'me')).status,401);assert.equal((await call({cookie:winner.cookie},'me')).status,200);
 report.checks.push('管理员同时提交两个密码修改：仅一个成功，旧会话失效，新会话可用。');
 assert.equal(report.transportErrors.length,0,'recorded transport faults must not be reported as a clean run');
}catch(error){report.failure=error.message;throw error;}finally{
 const dir=process.env.STABILITY_REPORT_DIR;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'races.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'races.md'),[`# 全面稳定性回归（${report.date}）`,'','独立本地 Worker/D1/R2，合成名单与照片；未读取或修改业务数据。','',...report.checks.map(c=>'- '+c),'',`服务传输错误：${report.transportErrors.length}。`,...(report.failure?['','失败：'+report.failure]:[]),'','范围：短时并发与事务一致性；不能代替公网、长期运行、真实手机 OCR 或实际备份恢复验证。'].join('\n')+'\n');
 console.log('REPORT '+path.join(dir,'races.md'));
}
