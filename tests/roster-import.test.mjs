import {readRoster} from '../lib/excel.ts';
import {validateRoster} from '../lib/domain.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {parseRosterRows} from '../lib/roster-import.ts';

test('college and school roster headers accept common labels without dropping blank rows',()=>{
 const rows=[
  ['说明'],
  ['学生 学号','学生姓名','学 院','小组','入学年级'],
  ['2024001','甲一','机械工程学院','第一组','2024级'],
  ['', '', '', '', ''],
  ['2024002','甲二','土建学院','第二组','2024']
 ];
 assert.deepEqual(parseRosterRows(rows),[
  {sid:'2024001',name:'甲一',college:'机械工程学院',group:'第一组',cohort:'2024级'},
  {sid:'2024002',name:'甲二',college:'土建学院',group:'第二组',cohort:'2024'}
 ]);
});

test('a selected college may supply the college when the sheet omits that column',()=>{
 assert.deepEqual(parseRosterRows([['学号','姓名','小组名称'],['2025001','乙一','活动一组']]),[
  {sid:'2025001',name:'乙一',college:'',group:'活动一组',cohort:''}
 ]);
});

test('the two-row exported score template skips its activity subheadings',()=>{
 assert.deepEqual(parseRosterRows([
  ['学号','姓名','院系','小组名称','活动一',''],
  ['','','','','签到表成绩','折算后成绩'],
  ['2025002','乙二','土建学院','第二组','','']
 ]),[{sid:'2025002',name:'乙二',college:'土建学院',group:'第二组',cohort:''}]);
});

test('formatted numeric student IDs retain their displayed leading zeros',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['学号','姓名','学院','小组'],[123,'丙一','机械工程学院','第三组']]);
 sheet.A2.z='000000';
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
 assert.equal(parseRosterRows(rows)[0].sid,'000123');
});

test('incomplete and duplicate students report their actual Excel rows',()=>{
 assert.throws(()=>parseRosterRows([['学号','姓名','小组'],['1','甲一','一组'],['','甲二','一组']]),/第 3 行缺少学号/);
 assert.throws(()=>parseRosterRows([['学号','姓名','小组'],['1','甲一','一组'],['1','甲二','一组']]),/第 3 行学号 1 重复.*第 2 行/);
 assert.throws(()=>parseRosterRows([['学号','姓名','小组'],['','','']]),/没有可导入的学生/);
});

test('mixed cohorts retain spreadsheet order and scientific display uses actual numeric student ID',async()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['学号','姓名','学院','小组'],[2026000123,'丙','测试院','院队'],[2024000456,'甲','测试院','普通组'],[2025000789,'乙','测试院','普通组']]);
 sheet.A2.z='0.00E+00';
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'名单');
 const file=new File([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],'mixed.xlsx');
 const rows=validateRoster(await readRoster(file));
 assert.deepEqual(rows.map(row=>row.sid),['2026000123','2024000456','2025000789']);
 assert.deepEqual(rows.map(row=>row.cohort),['2026','2024','2025']);
});
