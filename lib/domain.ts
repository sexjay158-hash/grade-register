import {normalizeCohort} from './cohort';
export type Student={sid:string;name:string;college:string;group_id:string;position:number;cohort?:string;management_cohort?:string|null};
export type Score={sid:string;score:number|null;state:string;note?:string};
export function validateScores(rows:unknown,members:string[]):Score[]{
 if(!Array.isArray(rows)||rows.length>500)throw new Error('成绩记录格式不正确');
 const seen=new Set<string>(),valid=new Set(members);
 return rows.map(r=>{
  if(!r||typeof r.sid!=='string'||!valid.has(r.sid)||seen.has(r.sid))throw new Error('存在重复学号或非本组学生');
  seen.add(r.sid);
  if(!['scored','absent','excused','unrecorded'].includes(r.state))throw new Error('成绩状态不正确');
  if(r.state==='scored'&&(typeof r.score!=='number'||!Number.isFinite(r.score)||r.score<0||r.score>10000))throw new Error('成绩须为 0～10000 的数字');
  return {sid:r.sid,state:r.state,score:r.state==='scored'?r.score:null,note:String(r.note??'').slice(0,300)};
 });
}
export function validateRoster(rows:unknown,maxRows=10000){
 if(!Array.isArray(rows)||!rows.length||rows.length>maxRows)throw new Error(`请导入 1～${maxRows} 人的名单`);
 const seen=new Set<string>();
 return rows.map((r,i)=>{
  const sid=String(r.sid??'').trim(),name=String(r.name??'').trim(),college=String(r.college??'').trim(),group=String(r.group??'').trim();
  if(!sid||!name||!group||sid.length>40||name.length>80||group.length>150||college.length>150)throw new Error(`第 ${i+1} 条名单缺少学号、姓名或小组，或内容过长`);
  if(seen.has(sid))throw new Error(`学号 ${sid} 重复，请先修正名单`);
  let cohort:string;try{cohort=normalizeCohort(r.cohort,sid);}catch(e){throw new Error(`第 ${i+1} 条名单，学号 ${sid}：${(e as Error).message}`);}
  seen.add(sid);return {sid,name,college,group,cohort,position:i};
 });
}
export function matchLines(lines:string[],members:{sid:string;name:string}[]){
 const matched:Score[]=[],unresolved:string[]=[],seen=new Set<string>();
 for(const line of lines){
  const compact=line.replace(/\s+/g,''),byId=members.filter(m=>new RegExp('(^|\\D)'+m.sid.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?!\\d)').test(line));
  const found=byId.length?byId:members.filter(m=>m.name.length>=2&&compact.includes(m.name));
  if(found.length!==1){unresolved.push(line);continue;}
  const m=found[0];
  if(byId.length&&members.some(other=>other.sid!==m.sid&&other.name!==m.name&&!m.name.includes(other.name)&&other.name.length>=2&&compact.includes(other.name))){unresolved.push(line);continue;}
  const rest=line.replaceAll(m.sid,' ').replaceAll(m.name,' '),absent=/缺席|缺勤/.test(rest),excused=/请假/.test(rest);
  let nums=[...rest.matchAll(/\d+(?:\.\d+)?/g)].map(x=>Number(x[0]));
  const leadingIndex=(nums.length>1||absent||excused)&&Number.isInteger(nums[0])&&nums[0]>=1&&nums[0]<=60;
  if(leadingIndex)nums=nums.slice(1);
  if(seen.has(m.sid)||(absent&&excused)||((absent||excused)&&nums.length)||(!absent&&!excused&&nums.length!==1)){unresolved.push(line);continue;}
  const score=nums.length?nums[0]:null;
  if(score!==null&&score>10000){unresolved.push(line);continue;}
  seen.add(m.sid);matched.push({sid:m.sid,state:absent?'absent':excused?'excused':'scored',score,note:'识别结果，请对照照片核对'});
 }
 return {matched,unresolved};
}
export function groupMatchedLines(lines:string[],students:{sid:string;name:string;group_id:string}[]){
 const parsed=matchLines(lines,students),bySid=new Map(students.map(s=>[s.sid,s.group_id])),groups=new Map<string,Score[]>();
 for(const score of parsed.matched){const groupId=bySid.get(score.sid)!;if(!groups.has(groupId))groups.set(groupId,[]);groups.get(groupId)!.push(score);}
 return {groups,unresolved:parsed.unresolved};
}
