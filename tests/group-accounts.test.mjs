import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupAccounts} from '../lib/group-account-domain.ts';
import {projectWorkspace} from '../lib/workspace/projection.ts';

const leader={sid:'202400000001',name:'甲组长',college:'甲学院',cohort:'2024',group:'甲组'};
const catalog=[{...leader,group_id:'ga',group_name:'甲组'},{sid:'202400000002',name:'甲副组长',college:'甲学院',cohort:'2024',group_id:'ga',group_name:'甲组'},{sid:'202400000003',name:'乙组长',college:'乙学院',cohort:'2024',group_id:'gb',group_name:'乙组'}];
const check=(input,accounts=[])=>validateGroupAccounts(input,catalog,accounts,'甲学院');
test('leader roster validates identity, scope and group before provisioning',()=>{
 assert.equal(check([leader])[0].status,'new');
 assert.equal(check([{...leader,cohort:'24级'}])[0].status,'new');
 assert.equal(check([{...leader,cohort:''}])[0].cohort,'2024');
 for(const changed of [{name:'错名'},{sid:'111111'},{college:'乙学院'},{group:'其他组'},{cohort:'2025'}])assert.equal(check([{...leader,...changed}])[0].status,'error');
 assert.equal(check([leader,leader])[1].status,'error');
 assert.equal(check([leader,{...leader,sid:'202400000002',name:'甲副组长'}])[1].status,'error');
 assert.equal(check([leader],[{id:'x',username:leader.sid,group_id:'ga',year_id:'y'}])[0].status,'existing');
 assert.equal(check([leader],[{id:'x',username:leader.sid,group_id:null,year_id:null}])[0].status,'error');
 assert.equal(check([leader],[{id:'x',username:leader.sid,group_id:null,year_id:null,role:'group_recorder',active:0}])[0].status,'new');
 assert.equal(check([leader],[{id:'x',username:leader.sid,group_id:null,year_id:null,role:'recorder',active:0}])[0].status,'error');
 assert.equal(check([leader],[{id:'x',username:'other',group_id:'ga',year_id:'y'}])[0].status,'error');
 assert.equal(validateGroupAccounts([leader],[catalog[0],catalog[0]],[],'甲学院')[0].status,'error');
 assert.throws(()=>check([]));assert.throws(()=>check(Array(2001).fill(leader)));
});
test('1000 group leaders match 20000 students without per-group full roster scans',()=>{
 const people=Array.from({length:20000},(_,i)=>({sid:'2024'+String(i).padStart(8,'0'),name:'学生'+i,college:'学院'+Math.floor(i/1000),cohort:'2024',group_id:'g'+Math.floor(i/20),group_name:'组'+Math.floor(i/20)}));
 const rows=people.filter((_,i)=>i%20===0).map(row=>({...row,group:row.group_name}));
 const result=validateGroupAccounts(rows,people,[],null);
 assert.equal(result.length,1000);assert.ok(result.every(row=>row.status==='new'));assert.equal(new Set(result.map(row=>row.groupId)).size,1000);
});
test('group-scoped recorder never receives same-cohort other group or mixed photo',()=>{
 const a={role:'recorder',college:'甲学院',cohort:'2024',userId:'leader-a',groupId:'ga'};
 const rows={colleges:[],groups:[{id:'ga',name:'甲组',college:'甲学院'},{id:'gb',name:'另一组',college:'甲学院'}],students:[{sid:'a',name:'甲',college:'甲学院',group_id:'ga',position:0,cohort:'2024',management_cohort:'2025'},{sid:'b',name:'乙',college:'甲学院',group_id:'gb',position:1,cohort:'2024',management_cohort:'2024'}],events:[{id:'ea',group_id:'ga',recorded:1},{id:'eb',group_id:'gb',recorded:1}],grades:[{sid:'a',event_id:'ea',group_id:'ga'},{sid:'b',event_id:'eb',group_id:'gb'}],intake:[{id:'mixed',group_id:null,event_id:null,matched:2,status:'assigned'},{id:'own',group_id:null,event_id:null,matched:0,status:'pending'}],links:[{intake_id:'mixed',event_id:'ea',group_id:'ga',matched:1},{intake_id:'mixed',event_id:'eb',group_id:'gb',matched:1}],actors:[{kind:'intake',id:'own',account_id:'leader-a',event_id:null}]};
 const result=projectWorkspace(a,rows,true);assert.deepEqual(result.students.map(r=>r.sid),['a']);assert.deepEqual(result.groups.map(r=>r.id),['ga']);assert.deepEqual(result.events.map(r=>r.id),['ea']);assert.deepEqual(result.grades.map(r=>r.sid),['a']);assert.deepEqual(result.intake.map(r=>r.id),['own']);assert.deepEqual(result.intakeLinks,[]);
});
