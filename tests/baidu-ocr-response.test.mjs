import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeBaiduOcr,baiduAccessToken,baiduOcrError} from '../lib/baidu-ocr-response.ts';

test('untrusted OCR responses reject malformed words and overlong results',()=>{
 assert.equal(baiduAccessToken({access_token:'token'}),'token');
 assert.equal(baiduAccessToken({access_token:5}),null);
 assert.equal(baiduOcrError({error_code:18}),'18');
 assert.throws(()=>arrangeBaiduOcr(null),/格式/);
 assert.throws(()=>arrangeBaiduOcr({words_result:{}}),/格式/);
 assert.throws(()=>arrangeBaiduOcr({words_result:[{words:9}]}),/格式/);
 assert.throws(()=>arrangeBaiduOcr({words_result:Array.from({length:1001},()=>({words:'张甲 90'}))}),/过多/);
 assert.deepEqual(arrangeBaiduOcr({words_result:[{words:'张甲 90',location:{left:'invalid',top:1,width:1,height:1}}]}).lines,['张甲 90']);
});

test('Baidu OCR keeps score lines and extracts a top-right rating consistently',()=>{
 const row=(words,left,top)=>({words,location:{left,top,width:80,height:18}});
 const result=arrangeBaiduOcr({words_result:[row('90',250,160),row('优',300,10),row('张甲',100,160),row('评定级别',190,10)]});
 assert.deepEqual(result.lines,['张甲 90']);
 assert.match(result.ratingText,/优/);
});
