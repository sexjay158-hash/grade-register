import {rosterCohort,studentNumber} from './student-number';
import {FEATURES} from './flags';
import {isValidScore,SCORE_RANGE_MESSAGE} from './score-range';
export type Student={sid:string;student_number?:string;name:string;college:string;group_id:string;position:number;cohort?:string;management_cohort?:string|null};
export type Score={sid:string;score:number|null;state:string;note?:string};
export function validateScores(rows:unknown,members:string[]):Score[]{
 if(!Array.isArray(rows)||rows.length>500)throw new Error('成绩记录格式不正确');
 const seen=new Set<string>(),valid=new Set(members);
 return rows.map(r=>{
  if(!r||typeof r.sid!=='string'||!valid.has(r.sid)||seen.has(r.sid))throw new Error('存在重复学号或非本组学生');
  seen.add(r.sid);
  if(!['scored','absent','excused','unrecorded'].includes(r.state))throw new Error('成绩状态不正确');
  if(r.state==='scored'&&!isValidScore(r.score))throw new Error(SCORE_RANGE_MESSAGE);
  return {sid:r.sid,state:r.state,score:r.state==='scored'?r.score:null,note:String(r.note??'').slice(0,300)};
 });
}
export function validateRoster(rows:unknown,maxRows=10000){
 if(!Array.isArray(rows)||!rows.length||rows.length>maxRows)throw new Error(`请导入 1～${maxRows} 人的名单`);
 const seen=new Set<string>();
 return rows.map((r,i)=>{
  const sid=String(r.sid??'').trim(),name=String(r.name??'').trim(),college=String(r.college??'').trim(),group=String(r.group??'').trim();
  if(!sid||!name||!group||sid.length>40||name.length>80||group.length>150||college.length>150)throw new Error(`第 ${i+1} 条名单缺少学号、姓名或小组，或内容过长`);
  if(!FEATURES.duplicateStudentNumbers&&seen.has(sid))throw new Error(`学号 ${sid} 重复，请先修正名单`);
  const cohort=rosterCohort(sid,r.cohort);
  seen.add(sid);return {sid,name,college,group,cohort,position:i,...(Number.isInteger(r.occurrence)&&r.occurrence>0&&r.occurrence<=50000?{occurrence:r.occurrence as number}:{})};
 });
}
export function matchLines(lines:string[],members:{sid:string;student_number?:string;name:string}[]){
 const matched:Score[]=[],unresolved:string[]=[],invalidScores:string[]=[],seen=new Set<string>();
 for(const line of lines){
  const compact=line.replace(/\s+/g,''),byId=members.filter(m=>new RegExp('(^|\\D)'+studentNumber(m).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?!\\d)').test(line));
  const found=byId.length>1?byId.filter(m=>m.name.length>=2&&compact.includes(m.name)):byId.length?byId:members.filter(m=>m.name.length>=2&&compact.includes(m.name));
  if(found.length!==1){unresolved.push(line);continue;}
  const m=found[0];
  if(byId.length&&members.some(other=>other.sid!==m.sid&&other.name!==m.name&&!m.name.includes(other.name)&&other.name.length>=2&&compact.includes(other.name))){unresolved.push(line);continue;}
  const idPattern=new RegExp('(^|\\D)('+studentNumber(m).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?!\\d)'),idMatch=idPattern.exec(line);
  const idStart=idMatch?idMatch.index+idMatch[1].length:-1,nameStart=line.indexOf(m.name);
  const identityStart=Math.min(...[idStart,nameStart].filter(index=>index>=0));
  // A row number must occur before the student's identity, never between two scores.
  const prefix=Number.isFinite(identityStart)?line.slice(0,identityStart):'',rowNumber=/^\s*(\d{1,2})[\s、.)）:：|]+$/.exec(prefix);
  const hasRowNumber=!!rowNumber&&Number(rowNumber[1])>=1&&Number(rowNumber[1])<=60;
  // Remove one complete ID token; replaceAll would change score 101 for ID 01.
  let rest=idMatch?line.slice(0,idStart)+' '+line.slice(idStart+idMatch[2].length):line;
  if(hasRowNumber)rest=rest.slice(prefix.length);
  rest=rest.replaceAll(m.name,' ');
  const absent=/缺席|缺勤/.test(rest),excused=/请假/.test(rest);
  if(/\d\s*[eE]\s*[+-]?\d|\d[,，]\d/.test(rest)){invalidScores.push(line);unresolved.push(line);continue;}
  const nums=[...rest.replace(/[−－]/g,'-').matchAll(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/g)].map(x=>Number(x[0]));
  if(seen.has(m.sid)||(absent&&excused)||((absent||excused)&&nums.length)||(!absent&&!excused&&nums.length!==1)){unresolved.push(line);continue;}
  const score=nums.length?nums[0]:null;
  if(score!==null&&!isValidScore(score)){invalidScores.push(line);unresolved.push(line);continue;}
  seen.add(m.sid);matched.push({sid:m.sid,state:absent?'absent':excused?'excused':'scored',score,note:'识别结果，请对照照片核对'});
 }
 return {matched,unresolved,invalidScores};
}
export function groupMatchedLines(lines:string[],students:{sid:string;name:string;group_id:string}[]){
 const parsed=matchLines(lines,students),bySid=new Map(students.map(s=>[s.sid,s.group_id])),groups=new Map<string,Score[]>();
 for(const score of parsed.matched){const groupId=bySid.get(score.sid)!;if(!groups.has(groupId))groups.set(groupId,[]);groups.get(groupId)!.push(score);}
 return {groups,unresolved:parsed.unresolved,invalidScores:parsed.invalidScores};
}
