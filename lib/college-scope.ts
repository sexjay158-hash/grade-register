import {FEATURES} from './flags';
import {teamLast} from './roster-order';
import type {Student} from './domain';

export const ALL_COLLEGES='all';
export function collegeNames(students:Student[]):string[]{
 return [...new Set(students.map(student=>student.college.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}
export function studentsInCollege(students:Student[],college:string):Student[]{
 return college===ALL_COLLEGES?students:students.filter(student=>student.college===college);
}
export function scopeWorkbook(students:Student[],groups:{id:string;name:string}[],records:{sid:string;[key:string]:unknown}[],college:string){
 const selected=studentsInCollege(students,college);
 const names=new Map(groups.map(group=>[group.id,group.name]));
 const ordered=teamLast(!FEATURES.preserveExcelOrder&&college===ALL_COLLEGES?[...selected].sort((a,b)=>a.college.localeCompare(b.college,'zh-CN')||a.position-b.position):selected,student=>names.get(student.group_id)??'');
 const sids=new Set(ordered.map(student=>student.sid));
 const groupIds=new Set(ordered.map(student=>student.group_id));
 const positionBySid=new Map(ordered.map((student,index)=>[student.sid,index]));
 const selectedRecords=records.filter(record=>sids.has(record.sid)).sort((a,b)=>(positionBySid.get(a.sid)??0)-(positionBySid.get(b.sid)??0)||Number(a.number??0)-Number(b.number??0));
 return {students:ordered,groups:groups.filter(group=>groupIds.has(group.id)),records:selectedRecords};
}
