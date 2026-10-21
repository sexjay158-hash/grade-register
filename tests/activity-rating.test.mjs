import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ACTIVITY_RATINGS,ACTIVITY_RATING_RULES,activityRatingOptions,convertedScore,requireActivityRating} from '../lib/activity-rating.ts';
import {FEATURES} from '../lib/flags.ts';
import {makeWorkbook} from '../lib/excel.ts';

test('activity ratings preserve raw scores and fill paired Excel conversion columns',()=>{
 assert.deepEqual(Object.values(ACTIVITY_RATINGS).map(x=>[x.label,x.rate]),[['优',1],['良',0.8],['中',0.6],['差',0.5],['无',0]]);
 assert.equal(convertedScore(90,'scored','excellent'),90);
 assert.equal(convertedScore(90,'scored','good'),72);
 assert.equal(convertedScore(90,'scored','pass'),54);
 assert.equal(convertedScore(90,'scored','poor'),45);
 assert.equal(convertedScore(90,'scored','none'),0);
 assert.equal(convertedScore(0,'scored','pass'),0);
 assert.equal(convertedScore(90,'absent','good'),null);
 assert.equal(convertedScore(90,'scored',null),null);
 assert.throws(()=>requireActivityRating('unrated'));
 const students=[{sid:'001',name:'测试学生',college:'测试学院',group_id:'group-1',position:0}];
 const records=[
  {sid:'001',group_id:'group-1',number:1,date:'2026-09-26',state:'scored',score:90,rating:'excellent'},
  {sid:'001',group_id:'group-1',number:2,date:'2026-09-27',state:'scored',score:90,rating:'good'},
  {sid:'001',group_id:'group-1',number:3,date:'2026-09-28',state:'scored',score:90,rating:'pass'},
  {sid:'001',group_id:'group-1',number:4,date:'2026-09-29',state:'scored',score:90,rating:'poor'},
  {sid:'001',group_id:'group-1',number:5,date:'2026-09-30',state:'scored',score:90,rating:'none'}
 ];
 const book=makeWorkbook(students,[{id:'group-1',name:'甲组'}],records);
 const sheet=book.Sheets.Sheet1;
 assert.equal(sheet.E3.v,90);assert.equal(sheet.F3.v,90);
 assert.equal(sheet.G3.v,90);assert.equal(sheet.H3.v,72);
 assert.equal(sheet.I3.v,90);assert.equal(sheet.J3.v,54);
 assert.equal(sheet.K3.v,90);assert.equal(sheet.L3.v,45);
 assert.equal(sheet.M3.v,90);assert.equal(sheet.N3.v,0,'zero-percent rating exports numeric zero, not a blank');
 const detail=book.Sheets['登记明细'];
 assert.equal(detail.H3.v,'良');assert.equal(detail.I3.v,0.8);assert.equal(detail.I3.z,'0%');assert.equal(detail.J3.v,72);
 assert.equal(detail.H4.v,'中');assert.equal(detail.H5.v,'差');assert.equal(detail.I5.v,0.5);
 assert.equal(detail.H6.v,'无');assert.equal(detail.I6.v,0);assert.equal(detail.I6.z,'0%');assert.equal(detail.J6.v,0);
});

test('zero-percent rating is distinct from a missing rating or attendance state',()=>{
 for(const state of ['absent','excused','unrecorded'])assert.equal(convertedScore(90,state,'none'),null);
 assert.equal(convertedScore(null,'scored','none'),null);
 assert.equal(convertedScore(90,'scored',null),null);
 assert.equal(convertedScore(79.99,'scored','poor'),40);
 assert.equal(convertedScore(79.91,'scored','poor'),39.96);
 assert.equal(convertedScore(90,'scored','invalid'),null);
 for(const value of ['excellent','good','pass','poor','none'])assert.equal(requireActivityRating(value),value);
 for(const value of ['constructor','__proto__',null,''])assert.throws(()=>requireActivityRating(value));
 assert.equal(ACTIVITY_RATING_RULES,'优 100%、良 80%、中 60%、差 50%、无 0%');
});

test('UI rollback preserves saved poor/none ratings and their calculations',()=>{
 const original=FEATURES.fiveLevelRating;
 try{
  FEATURES.fiveLevelRating=false;
  assert.deepEqual(activityRatingOptions(),['excellent','good','pass']);
  assert.deepEqual(activityRatingOptions('none'),['excellent','good','pass','none']);
  assert.equal(convertedScore(80,'scored','poor'),40);assert.equal(convertedScore(80,'scored','none'),0);
 }finally{FEATURES.fiveLevelRating=original;}
});
