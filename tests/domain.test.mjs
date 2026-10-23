import {majorityCohort} from '../lib/group-cohort-domain.ts';
import {normalizeCohort} from '../lib/cohort.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRoster,validateScores,matchLines,groupMatchedLines} from '../lib/domain.ts';
import {makeWorkbook} from '../lib/excel.ts';
import * as XLSX from 'xlsx';
import {detectGroup} from '../lib/group-detection.ts';
import {validatedOcrLines} from '../lib/ocr-lines.ts';
import {collegeNames,scopeWorkbook} from '../lib/college-scope.ts';

test('OCR preserves score digits matching short IDs and refuses ambiguous score columns',()=>{
 const members=[{sid:'01',name:'张甲'}];
 for(const line of ['01 张甲 101','01 张甲 1001']){
  const result=matchLines([line],members);
  assert.equal(result.matched.length,0,line);assert.deepEqual(result.invalidScores,[line]);
 }
 for(const line of ['01 张甲 50 80','张甲 20 90','01 张甲 1 缺席'])assert.equal(matchLines([line],members).matched.length,0,line);
 for(const line of ['1 01 张甲 90','2. 张甲 90','01 张甲 90'])assert.equal(matchLines([line],members).matched[0].score,90,line);
 assert.equal(matchLines(['3 张甲 缺席'],members).matched[0].state,'absent');
});

test('scores accept 0 and 100 inclusively; reject out of range, nonnumeric and nonfinite values',()=>{
 for(const score of [0,0.5,99.99,100])assert.equal(validateScores([{sid:'s',state:'scored',score}],['s'])[0].score,score);
 for(const score of [-1,-0.01,100.01,101,10000,NaN,Infinity,-Infinity,'50',null])assert.throws(()=>validateScores([{sid:'s',state:'scored',score}],['s']),/0～100/);
});
test('OCR refuses signed out-of-range scores without stripping minus signs or clipping values',()=>{
 const members=[{sid:'001',name:'张甲'},{sid:'002',name:'李乙'}];
 for(const value of ['-1','−2','－3','101','100.01','1000','1e3','1,000']){
  const result=matchLines([`001 张甲 ${value}`,'002 李乙 100'],members);
  assert.deepEqual(result.matched.map(row=>[row.sid,row.score]),[['002',100]],value);
  assert.equal(result.unresolved.length,1,value);assert.equal(result.invalidScores.length,1,value);
 }
 assert.equal(matchLines(['1 001 张甲 0'],members).matched[0].score,0);
 const corrected=matchLines(['001 张甲 101','001 张甲 90'],members);
 assert.equal(corrected.matched[0].score,90,'an invalid row must not prevent a later valid row for the same student');
});
test('college and school exports select the right students and scores, including same-named groups',()=>{
 const students=[{sid:'002',name:'乙',college:'医学院',group_id:'g2',position:1},{sid:'001',name:'甲',college:'机械工程学院',group_id:'g1',position:0}];
 const groups=[{id:'g1',name:'第一组'},{id:'g2',name:'第一组'}];
 const records=[{sid:'001',group_id:'g1',number:1,date:'2026-09-25',state:'scored',score:90},{sid:'002',group_id:'g2',number:1,date:'2026-09-25',state:'scored',score:80}];
 assert.deepEqual(collegeNames(students),['医学院','机械工程学院'].sort((a,b)=>a.localeCompare(b,'zh-CN')));
 const college=scopeWorkbook(students,groups,records,'机械工程学院');
 assert.deepEqual(college.students.map(s=>s.sid),['001']);assert.deepEqual(college.groups.map(g=>g.id),['g1']);assert.deepEqual(college.records.map(r=>r.sid),['001']);
 const book=makeWorkbook(college.students,college.groups,college.records);
 assert.equal(book.Sheets.Sheet1.A3.v,'001');assert.equal(book.Sheets.Sheet1.E3.v,90);assert.equal(book.Sheets['登记明细'].B2.v,'机械工程学院');
 const school=scopeWorkbook(students,groups,records,'all');assert.equal(school.students.length,2);assert.equal(school.records.length,2);
});
test('local OCR accepts clean rows and rejects malformed or oversized results',()=>{
 assert.deepEqual(validatedOcrLines([' 001 张三 95 ','']),['001 张三 95']);
 assert.throws(()=>validatedOcrLines(['001 张三 95',4]),/格式错误/);
 assert.throws(()=>validatedOcrLines(Array(301).fill('a')),/格式错误/);
});
test('roster derives valid cohorts while retaining duplicate or incorrect numbers',()=>{
 assert.deepEqual(validateRoster([{sid:'2024001',cohort:'2025',name:'甲',group:'组'}])[0],{sid:'2024001',cohort:'2024',name:'甲',college:'',group:'组',position:0});
 assert.equal(validateRoster([{sid:'001',cohort:'2024',name:'甲',group:'组'}])[0].cohort,'2024');
 assert.equal(validateRoster([{sid:'2024001',cohort:'2024',name:'甲',group:'组'},{sid:'2024001',cohort:'2024',name:'乙',group:'组'}]).length,2);
});
test('zero, absent and unrecorded stay distinct; invalid and foreign rows rejected',()=>{
 const rows=validateScores([{sid:'01',score:0,state:'scored'},{sid:'02',score:99,state:'absent'},{sid:'03',score:null,state:'unrecorded'}],['01','02','03']);
 assert.equal(rows[0].score,0);assert.equal(rows[1].score,null);assert.equal(rows[2].state,'unrecorded');
 assert.throws(()=>validateScores([{sid:'01',score:null,state:'scored'}],['01']));
 assert.throws(()=>validateScores([{sid:'99',score:2,state:'scored'}],['01']));
});
test('matching refuses ambiguous names and numbers, matches exact ID with zero',()=>{
 const members=[{sid:'001',name:'张同'},{sid:'002',name:'张同'},{sid:'003',name:'王甲'}];
 const r=matchLines(['张同 90','001 张同 0','王甲 85 90','003 请假'],members);
 assert.equal(r.matched.length,2);assert.equal(r.matched[0].score,0);assert.equal(r.matched[1].state,'excused');assert.equal(r.unresolved.length,2);
});
test('OCR rows enter scores by exact ID or unique name without requiring every teammate',()=>{
 const members=[{sid:'202500001',name:'张甲'},{sid:'202500002',name:'李乙'},{sid:'202500003',name:'王丙'}];
 const r=matchLines(['1 202500001张甲 92','李乙：88分'],members);
 assert.deepEqual(r.matched.map(x=>[x.sid,x.score]),[['202500001',92],['202500002',88]]);
 assert.equal(r.unresolved.length,0);assert.equal(r.matched.some(x=>x.sid==='202500003'),false);
});
test('mixed-group photo assigns each ordered row to its own student and group',()=>{
 const students=[{sid:'202500001',name:'张甲',group_id:'a'},{sid:'202500002',name:'李乙',group_id:'a'},{sid:'202500003',name:'王丙',group_id:'b'},{sid:'202500004',name:'重名',group_id:'a'},{sid:'202500005',name:'重名',group_id:'b'}];
 const result=groupMatchedLines(['序号 学号 姓名 成绩','1 202500003 王丙 95','2 李乙 88','3 202500001 张甲 0','重名 76','202500004 重名 72','202500002 张甲 99'],students);
 assert.deepEqual(result.groups.get('a')?.map(row=>[row.sid,row.score]),[['202500002',88],['202500001',0],['202500004',72]]);
 assert.deepEqual(result.groups.get('b')?.map(row=>[row.sid,row.score]),[['202500003',95]]);
 assert.equal(result.unresolved.length,3,'header, ambiguous duplicate name and mismatched ID/name need review');
});
test('Excel preserves activity holes, two columns per activity, no guessed conversion',()=>{
 const wb=makeWorkbook([{sid:'001',name:'甲',college:'学院',group_id:'g',position:0}],[{id:'g',name:'组'}],[{sid:'001',number:1,group_id:'g',date:'2026-09-23',state:'scored',score:0},{sid:'001',number:3,group_id:'g',date:'2026-09-30',state:'scored',score:87}]);
 const saved=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 const s=saved.Sheets.Sheet1;assert.equal(s.A3.v,'001');assert.equal(s.E3.v,0);assert.equal(s.G3.v,'');assert.equal(s.I3.v,87);assert.equal(s.F3.v,'');assert.equal(s.O3.v,'');
});
test('photo automatically identifies a group from an exact ID or a unique name with score',()=>{
 const g=[{id:'a',name:'机械足球队'},{id:'b',name:'机械羽毛球队'}],s=[{sid:'202500001',name:'张甲',group_id:'a'},{sid:'202500002',name:'李乙',group_id:'a'},{sid:'202500003',name:'王丙',group_id:'b'},{sid:'202500004',name:'重名',group_id:'a'},{sid:'202500005',name:'重名',group_id:'b'}];
 assert.equal(detectGroup(['202500001 张甲 90','202500002 李乙 80'],g,s).groupId,'a');
 assert.equal(detectGroup(['202500001 张甲 90'],g,s).groupId,'a');
 assert.equal(detectGroup(['202500001 90'],g,s).groupId,'a');
 assert.equal(detectGroup(['李乙：88分'],g,s).groupId,'a');
 assert.equal(detectGroup(['李乙'],g,s).groupId,null);
 assert.equal(detectGroup(['重名 90'],g,s).groupId,null);
 assert.equal(detectGroup(['机械足球队','202500001 张甲 90'],g,s).groupId,'a');
 assert.equal(detectGroup(['202500001 张甲 90','202500003 王丙 80'],g,s).groupId,null);
 assert.equal(detectGroup(['没有清楚的名单'],g,s).groupId,null);
});

test('roster and exports retain Excel order including college teams',()=>{
 const students=[{sid:'2024001',name:'队员',college:'甲院',group_id:'t',position:0},{sid:'2025002',name:'普通',college:'乙院',group_id:'g',position:1},{sid:'2024003',name:'新队员',college:'甲院',group_id:'t',position:2}];
 const groups=[{id:'t',name:'篮球院队'},{id:'g',name:'普通组'}];
 const scoped=scopeWorkbook(students,groups,[],'all');
 assert.deepEqual(scoped.students.map(row=>row.sid),['2024001','2025002','2024003']);
 const wb=makeWorkbook(students,groups,[]);
 assert.equal(wb.Sheets.Sheet1.A3.v,'2024001');
 assert.equal(wb.Sheets.Sheet1.A4.v,'2025002');
});

test('short cohort assignments normalize to years while student IDs take precedence',()=>{
 for(const value of ['24','24级','2024','2024级','２４级'])assert.equal(normalizeCohort(value),'2024');
 assert.equal(normalizeCohort('25级'),'2025');
 assert.equal(normalizeCohort('24级','20250001'),'2025');
 assert.throws(()=>normalizeCohort('大二'));
});

test('group responsibility follows dominant cohort while ties need assignment',()=>{
 assert.equal(majorityCohort([...Array(28).fill('2025'),'2024','2024']),'2025');
 assert.equal(majorityCohort(['2024','2025']),null);
 assert.equal(majorityCohort([]),null);
});

test('duplicate displayed numbers match only when name disambiguates, while Excel keeps separate rows',()=>{const students=[{sid:'a',student_number:'2024001',name:'张甲',college:'学院',group_id:'g',position:0},{sid:'b',student_number:'2024001',name:'李乙',college:'学院',group_id:'g',position:1}];const matched=matchLines(['2024001 张甲 80','2024001 李乙 91','2024001 99'],students);assert.deepEqual(matched.matched.map(r=>[r.sid,r.score]),[['a',80],['b',91]]);assert.equal(matched.unresolved.length,1);const wb=makeWorkbook(students,[{id:'g',name:'组'}],matched.matched.map(r=>({...r,number:1,group_id:'g'})));assert.equal(wb.Sheets.Sheet1.A3.v,'2024001');assert.equal(wb.Sheets.Sheet1.A4.v,'2024001');assert.equal(wb.Sheets.Sheet1.E3.v,80);assert.equal(wb.Sheets.Sheet1.E4.v,91);});
