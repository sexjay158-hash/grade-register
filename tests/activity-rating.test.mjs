import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ACTIVITY_RATINGS,convertedScore,requireActivityRating} from '../lib/activity-rating.ts';
import {makeWorkbook} from '../lib/excel.ts';

test('activity ratings preserve raw scores and fill paired Excel conversion columns',()=>{
 assert.deepEqual(Object.values(ACTIVITY_RATINGS).map(x=>x.rate),[1,0.8,0.6]);
 assert.equal(convertedScore(90,'scored','excellent'),90);
 assert.equal(convertedScore(90,'scored','good'),72);
 assert.equal(convertedScore(90,'scored','pass'),54);
 assert.equal(convertedScore(0,'scored','pass'),0);
 assert.equal(convertedScore(90,'absent','good'),null);
 assert.equal(convertedScore(90,'scored',null),null);
 assert.throws(()=>requireActivityRating('unrated'));
 const students=[{sid:'001',name:'测试学生',college:'测试学院',group_id:'group-1',position:0}];
 const records=[
  {sid:'001',group_id:'group-1',number:1,date:'2026-09-26',state:'scored',score:90,rating:'excellent'},
  {sid:'001',group_id:'group-1',number:2,date:'2026-09-27',state:'scored',score:90,rating:'good'},
  {sid:'001',group_id:'group-1',number:3,date:'2026-09-28',state:'scored',score:90,rating:'pass'}
 ];
 const book=makeWorkbook(students,[{id:'group-1',name:'甲组'}],records);
 const sheet=book.Sheets.Sheet1;
 assert.equal(sheet.E3.v,90);assert.equal(sheet.F3.v,90);
 assert.equal(sheet.G3.v,90);assert.equal(sheet.H3.v,72);
 assert.equal(sheet.I3.v,90);assert.equal(sheet.J3.v,54);
 const detail=book.Sheets['登记明细'];
 assert.equal(detail.H3.v,'良');assert.equal(detail.I3.v,0.8);assert.equal(detail.I3.z,'0%');assert.equal(detail.J3.v,72);
});
