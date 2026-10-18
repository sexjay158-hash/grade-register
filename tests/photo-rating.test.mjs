import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ratingFromPhotoText,convertedScore} from '../lib/activity-rating.ts';

test('one clear top-right grade drives the converted score',()=>{
 assert.equal(ratingFromPhotoText('等级：优'),'excellent');
 assert.equal(ratingFromPhotoText('活动等次 良'),'good');
 assert.equal(ratingFromPhotoText('合格'),'pass');
 assert.equal(ratingFromPhotoText('及格'),'pass');
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('良')),72);
 assert.equal(convertedScore(90,'scored',ratingFromPhotoText('合格')),54);
});

test('printed alternatives and unclear markings are not guessed',()=>{
 assert.equal(ratingFromPhotoText('优 良 合格'),null);
 assert.equal(ratingFromPhotoText('不合格'),null);
 assert.equal(ratingFromPhotoText(''),null);
});
