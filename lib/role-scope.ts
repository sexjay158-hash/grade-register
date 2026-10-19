import {requireAccessibleYear,requireIntakeSemester} from './semester-access';
import {FEATURES} from './flags';
import {access,db,type Access} from './server';
import {requireActiveCollege} from './colleges';
export {normalizeCohort} from './cohort';

export const cohortJoin=(alias='s')=>`LEFT JOIN student_numbers sn ON sn.owner=${alias}.owner AND sn.year_id=${alias}.year_id AND sn.sid=${alias}.sid LEFT JOIN student_cohorts sc ON sc.owner=${alias}.owner AND sc.year_id=${alias}.year_id AND sc.sid=${alias}.sid LEFT JOIN group_cohorts gc ON gc.owner=${alias}.owner AND gc.group_id=${alias}.group_id`;
export const cohortExpr=(alias='s')=>FEATURES.sidCohort?`CASE WHEN substr(COALESCE(sn.number,${alias}.sid),1,4) GLOB '[12][0-9][0-9][0-9]' THEN substr(COALESCE(sn.number,${alias}.sid),1,4) ELSE '' END`:`COALESCE(sc.cohort,CASE WHEN substr(COALESCE(sn.number,${alias}.sid),1,4) GLOB '[12][0-9][0-9][0-9]' THEN substr(COALESCE(sn.number,${alias}.sid),1,4) ELSE '' END)`;
export const scopeCohortExpr=(alias='s')=>FEATURES.groupCohortScope?'gc.cohort':cohortExpr(alias);
export function canReadCollege(a:Access,college:string){return a.role==='admin'||a.college===college;}
export function assertRosterEditor(a:Access,college:string,cohort?:string){
 if(a.role==='admin')return;
 if(a.college===college&&(a.role==='college_lead'||a.role==='recorder'&&FEATURES.gradeRosterManagement&&!!cohort&&cohort===a.cohort))return;
 throw new Error('无权限：只能管理负责学院和年级的学生名单');
}
export async function assertStudentScope(a:Access,yearId:string,sid:string,_write=false){
 if(a.role==='admin')return;
 const row=await db().prepare(`SELECT s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=? AND s.active=1`).bind(a.owner,yearId,sid).first<{college:string;cohort:string}>();
 if(!row||row.college!==a.college||(a.role==='recorder'&&row.cohort!==a.cohort))throw new Error('无权限：学生不在你的负责范围');
}
export async function assertGroupScope(a:Access,groupId:string,write=false){
 const group=await db().prepare('SELECT year_id,college FROM roster_groups WHERE id=? AND owner=?').bind(groupId,a.owner).first<{year_id:string;college:string}>();
 if(group)await requireAccessibleYear(a,group.year_id,write);
 if(!group||!canReadCollege(a,group.college))throw new Error('无权限：小组不在你的负责范围');
 if(a.role==='recorder'){
  const row=await db().prepare(`SELECT 1 FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.group_id=? AND s.active=1 AND ${scopeCohortExpr()}=? LIMIT 1`).bind(a.owner,group.year_id,groupId,a.cohort).first();
  if(!row)throw new Error('无权限：小组不属于你负责的年级');
 }
 if(write)await requireActiveCollege(a.owner,group.college);
 return group;
}
export async function assertEventScope(a:Access,eventId:string,write=false){
 const row=await db().prepare('SELECT group_id FROM events WHERE id=? AND owner=?').bind(eventId,a.owner).first<{group_id:string}>();
 if(!row)throw new Error('找不到该活动');return assertGroupScope(a,row.group_id,write);
}
export async function assertPhotoScope(req:Request,kind:'intake'|'photo',id:string){
 const a=await access(req);
 const table=kind==='intake'?'intake':'photos';
 const row=await db().prepare(`SELECT ${kind==='intake'?'group_id':'event_id'} AS scope FROM ${table} WHERE id=? AND owner=?`).bind(id,a.owner).first<{scope:string|null}>();
 if(!row)throw new Error('照片不存在');
 if(kind==='intake')await requireIntakeSemester(a,id);else if(row.scope)await assertEventScope(a,row.scope);
 if(a.role==='admin')return a;
 if(a.role==='recorder'){
  if(FEATURES.groupCohortScope){
   if(kind==='photo')return a;
   const links=await db().prepare('SELECT g.college,gc.cohort FROM intake_event_links l JOIN events e ON e.id=l.event_id JOIN roster_groups g ON g.id=e.group_id LEFT JOIN group_cohorts gc ON gc.owner=g.owner AND gc.group_id=g.id WHERE l.owner=? AND l.intake_id=?').bind(a.owner,id).all<{college:string;cohort:string|null}>();
   if(links.results.length){if(links.results.some(group=>group.college!==a.college||group.cohort!==a.cohort))throw new Error('无权限：照片包含不负责的小组');return a;}
   if(row.scope){await assertGroupScope(a,row.scope);return a;}
  }
  const actor=await db().prepare("SELECT account_id FROM photo_actors WHERE id=? AND owner=? AND (kind=? OR kind='intake') ORDER BY CASE WHEN kind=? THEN 0 ELSE 1 END LIMIT 1").bind(id,a.owner,kind,kind).first<{account_id:string}>();
  if(actor?.account_id!==a.userId)throw new Error('无权限：仅能查看自己上传的照片');
 }else {
  const linked=await db().prepare('SELECT DISTINCT g.college FROM intake_event_links l JOIN events e ON e.id=l.event_id JOIN roster_groups g ON g.id=e.group_id WHERE l.intake_id=? AND l.owner=?').bind(id,a.owner).all<{college:string}>();
  if(linked.results.length){if(linked.results.some(g=>g.college!==a.college))throw new Error('无权限：照片包含其他学院信息');}
  else if(row.scope){if(kind==='photo')await assertEventScope(a,row.scope);else await assertGroupScope(a,row.scope);}
  else {const actor=await db().prepare("SELECT account_id FROM photo_actors WHERE id=? AND owner=? AND kind='intake'").bind(id,a.owner).first<{account_id:string}>();if(actor?.account_id!==a.userId)throw new Error('无权限：照片尚未归入学院');}
 }
 return a;
}
