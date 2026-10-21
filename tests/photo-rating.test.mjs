import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ratingFromPhotoText,convertedScore,isRatingAnnotation} from '../lib/activity-rating.ts';
import {arrangeBrowserOcr} from '../lib/browser-ocr.ts';

test('one clear top-right grade drives the converted score',()=>{
 assert.equal(ratingFromPhotoText('等级：优'),'excellent');
 assert.equal(ratingFromPhotoText('活动等次 良'),'good');
 assert.equal(ratingFromPhotoText('合格'),'pass');
 assert.equal(ratingFromPhotoText('及格'),'pass');
 assert.equal(ratingFromPhotoText('评定级别：中'),'pass');
 assert.equal(ratingFromPhotoText('等级差'),'poor');
 assert.equal(ratingFromPhotoText('评级：无（0%）'),'none');
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('良')),72);
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('合格')),54);
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('中')),54);
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('差')),45);
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('无')),0);
});

test('printed alternatives and unclear markings are not guessed',()=>{
 assert.equal(ratingFromPhotoText('优 良 合格'),null);
 assert.equal(ratingFromPhotoText('优 良 中 差 无'),null);
 assert.equal(ratingFromPhotoText('不合格'),null);
 assert.equal(ratingFromPhotoText(''),null);
 for(const text of ['无故缺席','张中','中午','无评级','暂无评级'])assert.equal(ratingFromPhotoText(text),null,text);
});

test('five-tier annotations leave student and score lines intact in browser OCR',()=>{
 const item=(text,x,y)=>({text,poly:[[x,y],[x+100,y],[x+100,y+20],[x,y+20]]});
 for(const rating of ['优','良','中','差','无']){
  assert.ok(isRatingAnnotation(rating));
  const result=arrangeBrowserOcr([item('评定级别',650,30),item(rating,800,30),item('张中',600,140),item('20240001 张中 90',100,400)],1000,1000);
  assert.equal(ratingFromPhotoText(result.ratingText),ratingFromPhotoText(rating));
  assert.deepEqual(result.lines,['张中','20240001 张中 90']);
 }
 assert.equal(isRatingAnnotation('张中'),false);assert.equal(isRatingAnnotation('无故缺席'),false);
});
