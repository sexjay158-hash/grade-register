import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadRosterBatches,ROSTER_BATCH_SIZE} from '../lib/roster-batch.ts';

test('a school roster larger than the single-request limit is sent in complete batches',async()=>{
 const rows=Array.from({length:10001},(_,i)=>({sid:`2024${String(i).padStart(7,'0')}`,name:`学生${i}`,college:i%2?'甲学院':'乙学院',group:'第一组'}));
 const sizes=[],progress=[];
 const result=await uploadRosterBatches(rows,async batch=>{sizes.push(batch.length);return {students:batch.length,groups:0,skipped:0};},(done,total)=>progress.push([done,total]));
 assert.equal(sizes.length,Math.ceil(rows.length/ROSTER_BATCH_SIZE));
 assert.equal(sizes.reduce((sum,size)=>sum+size,0),rows.length);
 assert.equal(result.students,rows.length);
 assert.deepEqual(progress.at(-1),[rows.length,rows.length]);
});

test('a failed batch reports completed rows so the same file can be retried',async()=>{
 const rows=Array.from({length:ROSTER_BATCH_SIZE+1},(_,i)=>i),sizes=[];
 await assert.rejects(uploadRosterBatches(rows,async batch=>{sizes.push(batch.length);if(sizes.length===2)throw new Error('连接中断');return {students:batch.length,groups:1,skipped:0};},()=>{}),/已处理 500\/501 人.*重新选择同一文件继续/);
 assert.deepEqual(sizes,[ROSTER_BATCH_SIZE,1]);
});
