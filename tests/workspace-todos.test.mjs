import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkspaceTodos} from '../lib/workspace/todos.ts';
import {projectWorkspace} from '../lib/workspace/projection.ts';

const group={id:'g25',name:'同名组',college:'甲院'};
const event={id:'e25',group_id:'g25',status:'draft',recorded:2,number:1,date:'2026-10-21',rating:'good'};
function source(){return {colleges:[{name:'甲院',active:1}],groups:[{...group}],events:[{...event}],intake:[],intakeLinks:[]};}
test('one activity has one actionable task; zero-percent rating is already selected',()=>{
 const rows=source();rows.events=[{...event,recorded:0},{...event,id:'missing',rating:null},{...event,id:'zero',rating:'none'},{...event,id:'done',status:'committed'}];
 const before=structuredClone(rows),todos=buildWorkspaceTodos(rows,'recorder');
 assert.equal(todos.length,3);
 assert.deepEqual(todos.map(row=>[row.target.id,row.reason]),[['e25','scores_missing'],['missing','rating_missing'],['zero','awaiting_confirmation']]);
 assert.match(todos.find(row=>row.target.id==='zero').detail,/等待院负责人/);
 assert.deepEqual(rows,before);
 assert.match(buildWorkspaceTodos(rows,'college_lead').find(row=>row.target.id==='zero').detail,/核对照片、成绩和评级后确认/);
});
test('saved ratings resolve only the stale rating warning, not a real score conflict',()=>{
 const rows=source();
 rows.intake=[{id:'p',name:'表一.png',date:'2026-10-21',status:'assigned',group_id:'g25',event_id:'e25',unresolved:0,error:'右上角等次未能明确识别，请在活动详情中核对选择'}];
 assert.equal(buildWorkspaceTodos(rows,'recorder').filter(row=>row.kind==='photo').length,0);
 rows.events[0].rating=null;
 assert.equal(buildWorkspaceTodos(rows,'recorder').filter(row=>row.kind==='photo').length,1);
 rows.events[0].rating='none';rows.intake[0].error='照片等次与现有活动不一致，请人工核对';
 assert.equal(buildWorkspaceTodos(rows,'college_lead')[0].reason,'photo_conflict');
 rows.events[0].status='committed';
 assert.deepEqual(buildWorkspaceTodos(rows,'college_lead'),[]);
});
test('multi-page/group photos stay in review until every linked activity is confirmed',()=>{
 const rows=source();rows.events.push({...event,id:'second',status:'committed'});
 rows.intake=[{id:'p',name:'两页中的一页.png',status:'assigned',group_id:null,event_id:null,unresolved:1,error:''}];
 rows.intakeLinks=[{intake_id:'p',event_id:'e25',group_id:'g25'},{intake_id:'p',event_id:'second',group_id:'g25'}];
 assert.equal(buildWorkspaceTodos(rows,'admin').filter(row=>row.kind==='photo').length,1);
 rows.events[0].status='committed';assert.deepEqual(buildWorkspaceTodos(rows,'admin'),[]);
});
test('archived semesters and colleges produce no actionable tasks',()=>{
 const rows=source();assert.deepEqual(buildWorkspaceTodos(rows,'admin',true),[]);
 rows.colleges[0].active=0;
 rows.intake=[{id:'bound',status:'needs_review',group_id:'g25',event_id:null},{id:'own',status:'pending',group_id:null,event_id:null}];
 assert.deepEqual(buildWorkspaceTodos(rows,'recorder'),[]);
 assert.deepEqual(buildWorkspaceTodos(rows,'admin').map(row=>row.target.id),['own']);
});
test('unmatched own photos inherit staff scope; administrator unmatched photos remain unassigned',()=>{
 const rows=source();rows.events=[];rows.intake=[{id:'p',name:'错传.png',status:'pending',group_id:null,event_id:null}];
 const staff=buildWorkspaceTodos(rows,'recorder')[0];assert.deepEqual(staff.colleges,['甲院']);assert.equal(staff.reason,'photo_pending');
 assert.deepEqual(buildWorkspaceTodos(rows,'admin')[0].colleges,[]);
});

test('shared pending-photo todo uses captured college and explains lead view-only access',()=>{
 const rows=source();rows.events=[];rows.intake=[{id:'p',name:'待识别.png',status:'pending',group_id:null,event_id:null,upload_college:'甲院',read_only:true}];
 const todo=buildWorkspaceTodos(rows,'college_lead')[0];
 assert.deepEqual(todo.colleges,['甲院']);assert.match(todo.detail,/上传者/);
 assert.deepEqual(buildWorkspaceTodos(rows,'admin')[0].colleges,['甲院']);
});
test('todos use authorized projection, preserving college isolation and the mixed-cohort group rule',()=>{
 const rows={colleges:[{id:'a',name:'甲院',active:1},{id:'b',name:'乙院',active:1}],groups:[group,{id:'g24',name:'同名组',college:'甲院'},{id:'gb',name:'同名组',college:'乙院'}],
 students:[{sid:'older',name:'随组学生',college:'甲院',group_id:'g25',position:0,cohort:'2024',management_cohort:'2025'},{sid:'s24',name:'24级',college:'甲院',group_id:'g24',position:1,cohort:'2024',management_cohort:'2024'},{sid:'sb',name:'乙院',college:'乙院',group_id:'gb',position:2,cohort:'2025',management_cohort:'2025'}],
 events:[event,{...event,id:'e24',group_id:'g24'},{...event,id:'eb',group_id:'gb'}],grades:[],links:[],
 intake:[{id:'own',status:'pending',group_id:null,event_id:null,matched:0},{id:'other',status:'pending',group_id:null,event_id:null,matched:0}],
 actors:[{id:'own',kind:'intake',account_id:'r25',event_id:null},{id:'other',kind:'intake',account_id:'r24',event_id:null}]};
 const a={role:'recorder',userId:'r25',college:'甲院',cohort:'2025'};
 const visible=projectWorkspace(a,rows,true),todos=buildWorkspaceTodos(visible,a.role);
 assert.deepEqual(new Set(todos.map(row=>row.target.id)),new Set(['e25','own']));
 assert.ok(todos.every(row=>row.colleges.every(college=>college==='甲院')));
 const lead=projectWorkspace({...a,role:'college_lead'},rows,true);
 assert.deepEqual(new Set(buildWorkspaceTodos(lead,'college_lead').map(row=>row.target.id)),new Set(['e25','e24','own']));
});
test('large pending-photo sets are stable, bounded to one task per photo, and do not mutate input',()=>{
 const rows=source();rows.events=[];
 rows.intake=Array.from({length:5000},(_,i)=>({id:`p${i}`,name:'同名照片.png',date:'2026-10-21',status:'pending',group_id:null,event_id:null}));
 const todos=buildWorkspaceTodos(rows,'admin');assert.equal(todos.length,5000);assert.equal(new Set(todos.map(row=>row.id)).size,5000);
 assert.deepEqual(buildWorkspaceTodos(rows,'admin'),todos);assert.equal(rows.intake[0].id,'p0');
});
