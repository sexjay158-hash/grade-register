import assert from 'node:assert/strict';

const base='http://127.0.0.1:8787/api/',user='mv8ZMW175sSptJ0AXZgmLeGabJHg4hRfhFqVUc1zESzqojA8X7PJ4B';
const nonce=crypto.randomUUID();
let yearId='';
async function request(path,data,method='POST',who=user){
 if(yearId&&['state','export'].includes(path))path+='?yearId='+yearId;
 if(data instanceof FormData){if(path==='intake')data.set('yearId',yearId);}else if(data&&path==='roster')data={...data,yearId};
 const r=await fetch(base+path,{method:data===undefined?'GET':method,headers:{'Connection':'close','oai-authenticated-user-id':who,'oai-authenticated-user-email':'admin@example.com',...(data instanceof FormData?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data)});return {status:r.status,data:await r.json()};
}
const call=request;
yearId=(await call('years',{label:'集成测试-'+nonce})).data.id;
function photo(batchId,variant){const png=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlUAAAAASUVORK5CYII=','base64'),Buffer.from(nonce)]),form=new FormData();form.set('batchId',batchId);form.set('date','2026-09-25');form.set('file',new Blob([png,Buffer.from(variant)],{type:'image/png'}),'mixed.png');return form;}

assert.equal((await call('roster',{rows:[
 {sid:'202500001',name:'张甲',college:'测试学院',group:'甲组'},
 {sid:'202500002',name:'李乙',college:'测试学院',group:'甲组'},
 {sid:'202500003',name:'王丙',college:'测试学院',group:'乙组'}
]})).status,200);
const batch=crypto.randomUUID(),first=await call('intake',photo(batch,'first'));assert.equal(first.status,200);
const assigned=await call('intake/process',{id:first.data.id,recognizedLines:['1 202500003 王丙 70','2 202500001 张甲 90','3 李乙 80'],recognizedRatingText:'等级：良'});
assert.equal(assigned.status,200,JSON.stringify(assigned.data));assert.equal(assigned.data.status,'assigned');
assert.equal(assigned.data.groupCount,2);assert.equal(assigned.data.matched,3);
let state=(await call('state')).data;
assert.equal(state.events.length,2);assert.equal(state.intakeLinks.filter(link=>link.intake_id===first.data.id).length,2);
assert.ok(state.events.every(event=>event.rating==='good'),'one photo rates both matched groups');
assert.deepEqual(state.grades.map(row=>[row.sid,row.score]).sort(),[['202500001',90],['202500002',80],['202500003',70]]);
for(const event of state.events){const detail=await call('event/'+event.id);assert.equal(detail.data.photos[0].id,first.data.id);}
const image=await fetch(base+'photo/'+first.data.id,{headers:{'Connection':'close','oai-authenticated-user-id':user}});assert.equal(image.status,200);

const second=await call('intake',photo(batch,'second'));assert.equal(second.status,200);
const continued=await call('intake/process',{id:second.data.id,recognizedLines:['202500002 李乙 80'],recognizedRatingText:'优'});
assert.equal(continued.data.status,'assigned');assert.equal((await call('state')).data.events.length,2,'later photo continues the open group activity');
assert.equal(continued.data.conflicts,1,'different grade on the same group needs review');
assert.ok((await call('state')).data.events.every(event=>event.rating==='good'),'conflict does not silently overwrite an earlier grade');
for(const event of state.events){const detail=await call('event/'+event.id);const rows=detail.data.scores.map(row=>({sid:row.sid,state:row.state,score:row.score}));assert.equal((await call('event/'+event.id,{version:detail.data.event.version,action:'commit',rows},'PUT')).status,200);}
assert.equal((await call('export')).data.find(row=>row.sid==='202500001').converted_score,72,'photo grade calculates exported converted score without manual rating');
const third=await call('intake',photo(crypto.randomUUID(),'third'));assert.equal(third.status,200);
const assignedNext=await call('intake/process',{id:third.data.id,recognizedLines:['202500001 张甲 91','202500003 王丙 75']});assert.equal(assignedNext.data.status,'assigned',JSON.stringify(assignedNext.data));
state=(await call('state')).data;assert.equal(state.events.filter(event=>event.number===2).length,2);
const a=state.groups.find(group=>group.name==='甲组'),a2=state.events.find(event=>event.group_id===a.id&&event.number===2);
assert.equal((await call('event/'+a2.id,{version:a2.version},'DELETE')).status,200);
state=(await call('state')).data;assert.equal(state.intakeLinks.filter(link=>link.intake_id===third.data.id).length,1,'deleting one draft preserves the other group link');
assert.equal(state.intake.find(photo=>photo.id===third.data.id).matched,1,'photo summary keeps only the remaining group score');
assert.equal(state.events.some(event=>event.id===a2.id),false);
const b2=state.events.find(event=>event.number===2);assert.equal((await call('event/'+b2.id)).data.photos[0].id,third.data.id);
const bDetail=(await call('event/'+b2.id)).data;
assert.equal((await call('event/'+b2.id,{version:bDetail.event.version,action:'commit',rows:bDetail.scores.map(row=>({sid:row.sid,state:row.state,score:row.score}))},'PUT')).status,200);
const exported=(await call('export')).data;
assert.equal(exported.find(row=>row.sid==='202500003'&&row.number===2).score,75);
assert.equal(exported.some(row=>row.sid==='202500001'&&row.number===2),false);
console.log('PASS: mixed-group row matching, shared photo, per-group activity order, retry, draft deletion and export.');
