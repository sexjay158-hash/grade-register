import test from 'node:test';
import assert from 'node:assert/strict';
import {projectWorkspace} from '../lib/workspace/projection.ts';

function fixture(){return {
 colleges:['甲院','乙院'].map((name,i)=>({id:`c${i}`,name,active:1,students:3,groups:2,events:2,drafts:0})),
 groups:[{id:'g25',name:'25级混合组',college:'甲院'},{id:'g24',name:'24级组',college:'甲院'},{id:'gb',name:'乙组',college:'乙院'}],
 students:[
  {sid:'s25',name:'甲',college:'甲院',group_id:'g25',position:0,cohort:'2025',management_cohort:'2025'},
  {sid:'s24mix',name:'乙',college:'甲院',group_id:'g25',position:1,cohort:'2024',management_cohort:'2025'},
  {sid:'s24',name:'丙',college:'甲院',group_id:'g24',position:2,cohort:'2024',management_cohort:'2024'},
  {sid:'sb',name:'丁',college:'乙院',group_id:'gb',position:3,cohort:'2025',management_cohort:'2025'},
 ],
 events:[{id:'e25',group_id:'g25',recorded:2,photos:2,status:'committed'},{id:'e24',group_id:'g24',recorded:1,photos:1,status:'draft'},{id:'eb',group_id:'gb',recorded:1,photos:1,status:'committed'}],
 grades:[{sid:'s25',event_id:'e25'},{sid:'s24mix',event_id:'e25'},{sid:'s24',event_id:'e24'},{sid:'sb',event_id:'eb'}],
 intake:[
  {id:'i25',group_id:'g25',event_id:'e25',matched:2,status:'done'},
  {id:'i24',group_id:'g24',event_id:'e24',matched:1,status:'done'},
  {id:'cross',group_id:null,event_id:null,matched:4,status:'done'},
  {id:'own',group_id:null,event_id:null,matched:0,status:'pending'},
  {id:'other',group_id:null,event_id:null,matched:0,status:'pending'},
 ],
 links:[{intake_id:'i25',event_id:'e25',group_id:'g25',matched:2},{intake_id:'i24',event_id:'e24',group_id:'g24',matched:1},{intake_id:'cross',event_id:'e25',group_id:'g25',matched:2},{intake_id:'cross',event_id:'eb',group_id:'gb',matched:1}],
 actors:[{kind:'intake',id:'own',account_id:'r25',event_id:null},{kind:'intake',id:'other',account_id:'r24',event_id:null},{kind:'photo',id:'p25',account_id:'r24',event_id:'e25'}],
};}
const recorder={role:'recorder',college:'甲院',cohort:'2025',userId:'r25'};
test('group management scope includes the older member and preserves Excel order',()=>{
 const rows=fixture(),before=structuredClone(rows),result=projectWorkspace(recorder,rows,true);
 assert.deepEqual(result.students.map(row=>row.sid),['s25','s24mix']);
 assert.deepEqual(result.groups.map(row=>[row.id,row.members]),[['g25',2]]);
 assert.deepEqual(result.events.map(row=>row.id),['e25']);
 assert.deepEqual(result.grades.map(row=>row.sid),['s25','s24mix']);
 assert.deepEqual(rows,before,'projection never mutates repository rows');
});
test('foreign and cross-college photos are hidden, unassigned photos require ownership',()=>{
 const result=projectWorkspace(recorder,fixture(),true);
 assert.deepEqual(result.intake.map(row=>row.id),['i25','own']);
 assert.deepEqual(result.intakeLinks.map(row=>row.intake_id),['i25']);
 assert.equal(result.intake[0].matched,2);
 assert.equal(result.events[0].recorded,2);
 assert.equal(result.events[0].photos,2,'one regular photo plus one intake, not two copies of direct/link');
 assert.deepEqual(result.colleges.map(row=>[row.name,row.students,row.groups,row.events,row.drafts]),[['甲院',2,1,1,0]]);
});
test('college lead sees all own cohorts while administrator sees all colleges',()=>{
 const rows=fixture();
 const lead=projectWorkspace({...recorder,role:'college_lead'},rows,true);
 assert.deepEqual(lead.students.map(row=>row.sid),['s25','s24mix','s24']);
 assert.deepEqual(lead.events.map(row=>row.id),['e25','e24']);
 assert.deepEqual(lead.intake.map(row=>row.id),['i25','i24','own']);
 const admin=projectWorkspace({...recorder,role:'admin'},rows,true);
 assert.deepEqual(admin.students,rows.students);assert.deepEqual(admin.grades,rows.grades);
 assert.deepEqual(admin.intake,rows.intake);assert.deepEqual(admin.intakeLinks,rows.links);
});
test('legacy photo scope falls back to uploader ownership without broadening grade permissions',()=>{
 const result=projectWorkspace(recorder,fixture(),false);
 assert.deepEqual(result.intake.map(row=>row.id),['own']);
 assert.equal(result.events[0].photos,0);assert.equal(result.grades.length,2);
});
test('large photo sets keep exact counts and deduplicate only within the same event',()=>{
 const rows=fixture();rows.intake=[];rows.links=[];rows.actors=[];
 for(let i=0;i<5000;i++){
  rows.intake.push({id:`i${i}`,group_id:'g25',event_id:'e25',matched:2,status:'done'});
  rows.links.push({intake_id:`i${i}`,event_id:'e25',group_id:'g25',matched:2});
 }
 const result=projectWorkspace(recorder,rows,true);
 assert.equal(result.events[0].photos,5000);assert.equal(result.intakeLinks.length,5000);
 assert.equal(result.intake.reduce((sum,row)=>sum+row.matched,0),10000);
});
