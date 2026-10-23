import {studentNumber} from './student-number';
import {teamLast} from './roster-order';
import * as XLSX from 'xlsx';
import type {Student} from './domain';
import {ACTIVITY_RATINGS,convertedScore,type ActivityRating} from './activity-rating';
import {parseRosterRows} from './roster-import';
export type ExportRecord={sid:string;student_number?:string;group_id:string;number:number;date?:string;state:string;score:number|null;rating?:ActivityRating|null};
const stateLabels:Record<string,string>={scored:'已录入',absent:'缺席',excused:'请假',unrecorded:'未登记'};
export async function readRoster(file:File){
 if(file.size>10*1024*1024)throw new Error('名单文件请控制在 10 MB 以内');
 let wb:XLSX.WorkBook;try{wb=XLSX.read(await file.arrayBuffer(),{type:'array'});}catch{throw new Error('无法读取名单文件，请选择有效的 Excel 文件');}
 if(!wb.SheetNames.length)throw new Error('名单文件没有工作表');
 const data=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
 const rawData=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:true});
 return parseRosterRows(data,rawData);
}
export function makeWorkbook(students:Student[],groups:{id:string;name:string}[],records:ExportRecord[]){
 const n=Math.max(5,...records.map(r=>r.number)),names=new Map(groups.map(g=>[g.id,g.name])),scores=new Map(records.map(r=>[r.sid+'|'+r.number,r]));
 const headings:(string|number)[]=['学号','姓名','院系','小组名称'],sub:string[]=['','','',''];
 for(let i=1;i<=n;i++){headings.push('活动'+(['一','二','三','四','五'][i-1]??i),'');sub.push('签到表成绩','折算后成绩');}headings.push('得分');sub.push('');
 const rows:(string|number|null)[][]=[headings,sub];
 for(const s of teamLast(students,student=>names.get(student.group_id)??'')){const row:(string|number|null)[]=[studentNumber(s),s.name,s.college,names.get(s.group_id)??''];for(let i=1;i<=n;i++){const r=scores.get(s.sid+'|'+i),raw=!r?'':r.state==='scored'?r.score:r.state==='absent'?'缺席':r.state==='excused'?'请假':'',scaled=r?convertedScore(r.score,r.state,r.rating):null;row.push(raw,scaled??'');}row.push('');rows.push(row);}
 const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=[{wch:16},{wch:12},{wch:22},{wch:36},...Array.from({length:n*2+1},()=>({wch:16}))];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'Sheet1');
 const numberBySid=new Map(students.map(s=>[s.sid,studentNumber(s)]));
 const collegeBySid=new Map(students.map(student=>[student.sid,student.college]));
 const detail=XLSX.utils.aoa_to_sheet([['学号','院系','小组','活动次数','活动日期','状态','原始成绩','活动等次','折算比例','折算后成绩'],...records.map(r=>[r.student_number??numberBySid.get(r.sid)??r.sid,collegeBySid.get(r.sid)??'',names.get(r.group_id),r.number,r.date,stateLabels[r.state]??r.state,r.score??'',r.rating?ACTIVITY_RATINGS[r.rating].label:'',r.rating?ACTIVITY_RATINGS[r.rating].rate:'',convertedScore(r.score,r.state,r.rating)??''])]);
 detail['!cols']=[{wch:16},{wch:22},{wch:36},{wch:12},{wch:16},{wch:12},{wch:14},{wch:12},{wch:12},{wch:16}];for(let i=1;i<=records.length;i++){const cell=detail['I'+(i+1)];if(cell&&cell.t==='n')cell.z='0%';}XLSX.utils.book_append_sheet(wb,detail,'登记明细');
 return wb;
}
export function downloadWorkbook(students:Student[],groups:{id:string;name:string}[],records:ExportRecord[],scope='学院'){
 XLSX.writeFile(makeWorkbook(students,groups,records),`${scope.replace(/[\\/:*?"<>|]/g,'_')}_活动成绩_${new Date().toISOString().slice(0,10)}.xlsx`);
}
