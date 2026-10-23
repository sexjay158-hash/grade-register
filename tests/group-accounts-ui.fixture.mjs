// Disposable browser QA fixture. Never points at the daily school database.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const base=process.env.TEST_BASE_URL,origin=new URL(base).origin,dir=process.env.TEST_STATE_DIR,password='a6P9x2';
assert.ok(dir&&path.basename(dir).startsWith('.tmp-role-verify-'));
let cookie='';
async function call(endpoint,data){const response=await fetch(base+endpoint,{method:data?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const body=await response.json();assert.equal(response.status,200,endpoint+': '+JSON.stringify(body));return {body,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
cookie=(await call('auth/bootstrap',{setupToken:process.env.TEST_BOOTSTRAP_TOKEN,username:'ui-test-admin',password})).cookie;
const year=(await call('years')).body[0].id,college='测试学院';await call('colleges',{name:college});
const rows=Array.from({length:20},(_,i)=>({sid:'20249999'+String(i+1).padStart(4,'0'),name:'验收学生'+(i+1),college,group:i<10?'第一组':'第二组',cohort:'2024'}));
await call('roster',{yearId:year,rows});await call('members',{username:'ui-test-head',password,role:'college_lead',college});await call('group-accounts',{action:'issue',yearId:year,rows:[rows[0]]});
writeFileSync(path.join(dir,'组长收集验收.csv'),'\ufeff学号,姓名,学院,入学年级,小组名称\r\n'+[rows[0],rows[10]].map(r=>[r.sid,r.name,r.college,r.cohort,r.group].join(',')).join('\r\n'));
console.log(`UI fixture ready. Import file: ${path.join(dir,'组长收集验收.csv')}`);
const end=Date.now()+180000;while(Date.now()<end&&!existsSync(path.join(dir,'ui-done')))await new Promise(resolve=>setTimeout(resolve,1000));
console.log('UI fixture closed; owned database and CSV will be removed.');
