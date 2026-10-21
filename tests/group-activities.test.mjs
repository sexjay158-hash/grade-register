import test from 'node:test';
import assert from 'node:assert/strict';
import {groupActivityArchives} from '../lib/group-activities.ts';
const groups=[{id:'a',name:'同名组',college:'甲院',members:30},{id:'b',name:'同名组',college:'乙院',members:25},{id:'empty',name:'未开展活动组',college:'甲院',members:12}];
const event=(id,group_id,number,status='committed',rating='good')=>({id,group_id,number,date:'2026-10-21',status,rating,photos:2,recorded:12});
test('same-named groups use separate IDs and keep all existing activity numbers',()=>{
 const result=groupActivityArchives(groups,[event('a1','a',1),event('b1','b',1),event('a3','a',3,'draft','none'),event('a2','a',2)]);
 assert.deepEqual(result[0].activities.map(e=>[e.id,e.number]),[['a3',3],['a2',2],['a1',1]]);
 assert.deepEqual(result[1].activities.map(e=>e.id),['b1']);
 assert.equal(result[0].committed,2);assert.equal(result[0].drafts,1);assert.equal(result[0].photos,6);
 assert.equal(result[0].activities[0].rating,'none');
});
test('empty groups have an accessible directory entry without inventing activities',()=>{
 const result=groupActivityArchives(groups,[]);assert.equal(result.length,3);
 assert.ok(result.every(row=>row.activities.length===0&&row.photos===0));
});
test('out-of-scope and other-semester group IDs cannot enter the visible archives',()=>{
 const result=groupActivityArchives([groups[0]],[event('a1','a',1),event('b1','b',1),event('old','previous-semester-group',1)]);
 assert.equal(result.length,1);assert.deepEqual(result[0].activities.map(e=>e.id),['a1']);
});
test('grouping is read-only, does not renumber gaps or merge equal numbers',()=>{
 const events=[event('later','a',5),event('first','a',1),event('duplicate-number','a',1)];
 const before=structuredClone({groups,events}),result=groupActivityArchives(groups,events);
 assert.deepEqual({groups,events},before);assert.deepEqual(result[0].activities.map(e=>e.number),[5,1,1]);
});
