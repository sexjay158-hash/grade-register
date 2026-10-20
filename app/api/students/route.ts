import {guardedBatch,writableYearGuard,writableGroupGuard,accountWriteGuard} from '@/lib/guarded-batch';
import {cohortForGroup} from '@/lib/group-cohorts';
import {requireAccessibleYear} from '@/lib/semester-access';
import {db,access,json,failure,readBody} from '@/lib/server';
import {assertRosterEditor,cohortExpr,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';
import {requireYear,cleanRosterText} from '@/lib/yearly-rosters';
import {requireActiveCollege} from '@/lib/colleges';
import {rosterCohort} from '@/lib/student-number';
import {FEATURES} from '@/lib/flags';

async function groupFor(owner:string,yearId:string,college:string,name:string){
 const d=db(),existing=await d.prepare('SELECT id FROM roster_groups WHERE owner=? AND year_id=? AND college=? AND name=?').bind(owner,yearId,college,name).first<{id:string}>();
 if(existing)return existing.id;
 const id=crypto.randomUUID();await d.batch([
  d.prepare('INSERT INTO groups(id,owner,name) VALUES(?,?,?)').bind(id,owner,`roster:${id}`),
  d.prepare('INSERT INTO roster_groups(id,owner,year_id,college,name) VALUES(?,?,?,?,?)').bind(id,owner,yearId,college,name)
 ]);return id;
}
async function values(input:Record<string,unknown>){const sid=cleanRosterText(input.sid,'学号',40);return {sid,name:cleanRosterText(input.name,'姓名',80),college:cleanRosterText(input.college,'院系'),group:cleanRosterText(input.group,'小组名称'),cohort:rosterCohort(sid,input.cohort)};}

export async function POST(req:Request){try{
 const a=await access(req),u=a.owner,input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),v=await values(input),d=db();assertRosterEditor(a,v.college,await cohortForGroup(u,yearId,v.college,v.group,v.cohort));
 const number=v.sid;let old=await d.prepare(`SELECT s.active,s.name,s.college,s.group_id,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=?`).bind(u,yearId,v.sid).first<{active:number;name:string;college:string;group_id:string;cohort:string}>();if(old&&!old.active)assertRosterEditor(a,old.college,old.cohort);if(old?.active){if(!FEATURES.duplicateStudentNumbers)throw new Error('该学年已有此学号，请使用编辑');old=null;v.sid=(v.cohort||'0000')+crypto.randomUUID();}
 await requireActiveCollege(u,v.college);
 const groupId=await groupFor(u,yearId,v.college,v.group),max=await d.prepare('SELECT COALESCE(MAX(position),-1) AS n FROM roster_students WHERE owner=? AND year_id=?').bind(u,yearId).first<{n:number}>();
 if(old){const scored=await d.prepare("SELECT 1 FROM scores s JOIN events e ON e.id=s.event_id WHERE e.owner=? AND e.group_id=? AND s.sid=? AND s.state<>'unrecorded' LIMIT 1").bind(u,old.group_id,v.sid).first();if(scored&&(old.name!==v.name||old.college!==v.college||old.group_id!==groupId))throw new Error('该学号有历史成绩，只能按原姓名和小组恢复名单');}
 await guardedBatch(d,[d.prepare('INSERT INTO student_numbers(owner,year_id,sid,number) VALUES(?,?,?,?) ON CONFLICT(owner,year_id,sid) DO UPDATE SET number=excluded.number').bind(u,yearId,v.sid,number),d.prepare('INSERT INTO roster_students(owner,year_id,sid,name,college,group_id,position,active) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(owner,year_id,sid) DO UPDATE SET name=excluded.name,college=excluded.college,group_id=excluded.group_id,active=1').bind(u,yearId,v.sid,v.name,v.college,groupId,(max?.n??-1)+1),d.prepare('INSERT INTO student_cohorts(owner,year_id,sid,cohort) VALUES(?,?,?,?) ON CONFLICT(owner,year_id,sid) DO UPDATE SET cohort=excluded.cohort').bind(u,yearId,v.sid,v.cohort)],[writableYearGuard(u,yearId),writableGroupGuard(u,groupId),accountWriteGuard(a),{sql:old?'EXISTS(SELECT 1 FROM roster_students WHERE owner=? AND year_id=? AND sid=? AND active=0)':'NOT EXISTS(SELECT 1 FROM roster_students WHERE owner=? AND year_id=? AND sid=?)',values:[u,yearId,v.sid]}],'名单已变化，请刷新后重新添加；本次未覆盖其他学生');return json({ok:true});
}catch(e){return failure(e);}}
export async function PUT(req:Request){try{
 const a=await access(req),u=a.owner,input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),v=await values(input),oldSid=cleanRosterText(input.oldSid,'原学号',40),d=db();
 const old=await d.prepare(`SELECT s.group_id,s.college,s.name,COALESCE(sn.number,s.sid) AS number,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=? AND s.active=1`).bind(u,yearId,oldSid).first<{group_id:string;college:string;cohort:string;name:string;number:string}>();if(!old)throw new Error('找不到该学生');assertRosterEditor(a,old.college,old.cohort);assertRosterEditor(a,v.college,await cohortForGroup(u,yearId,v.college,v.group,v.cohort));

 const scored=await d.prepare("SELECT 1 FROM scores s JOIN events e ON e.id=s.event_id WHERE e.owner=? AND e.group_id=? AND s.sid=? AND s.state<>'unrecorded' LIMIT 1").bind(u,old.group_id,oldSid).first();
 const oldGroup=await d.prepare('SELECT college,name FROM roster_groups WHERE id=? AND owner=? AND year_id=?').bind(old.group_id,u,yearId).first<{college:string;name:string}>();
 if(scored&&(oldGroup?.college!==v.college||oldGroup?.name!==v.group))throw new Error('此学生已有成绩，可更正姓名或学号；更换学院或小组需先处理历史成绩');
 await requireActiveCollege(u,v.college);
 const groupId=await groupFor(u,yearId,v.college,v.group);
 await guardedBatch(d,[d.prepare('UPDATE roster_students SET name=?,college=?,group_id=? WHERE owner=? AND year_id=? AND sid=? AND active=1').bind(v.name,v.college,groupId,u,yearId,oldSid),d.prepare('INSERT INTO student_numbers(owner,year_id,sid,number) VALUES(?,?,?,?) ON CONFLICT(owner,year_id,sid) DO UPDATE SET number=excluded.number').bind(u,yearId,oldSid,v.sid),d.prepare('DELETE FROM student_cohorts WHERE owner=? AND year_id=? AND sid=?').bind(u,yearId,oldSid),d.prepare('INSERT INTO student_cohorts(owner,year_id,sid,cohort) VALUES(?,?,?,?) ON CONFLICT(owner,year_id,sid) DO UPDATE SET cohort=excluded.cohort').bind(u,yearId,oldSid,v.cohort)],[writableYearGuard(u,yearId),writableGroupGuard(u,old.group_id,a),writableGroupGuard(u,groupId),accountWriteGuard(a),{sql:'EXISTS(SELECT 1 FROM roster_students s LEFT JOIN student_numbers sn ON sn.owner=s.owner AND sn.year_id=s.year_id AND sn.sid=s.sid WHERE s.owner=? AND s.year_id=? AND s.sid=? AND s.active=1 AND s.group_id=? AND s.name=? AND s.college=? AND COALESCE(sn.number,s.sid)=?)',values:[u,yearId,oldSid,old.group_id,old.name,old.college,old.number]},...(old.group_id!==groupId?[{sql:"NOT EXISTS(SELECT 1 FROM scores s JOIN events e ON e.id=s.event_id WHERE e.owner=? AND e.group_id=? AND s.sid=? AND s.state<>'unrecorded')",values:[u,old.group_id,oldSid]}]:[])],'学生或成绩已变化，请刷新核对后再修改');return json({ok:true});
}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{
 const a=await access(req),u=a.owner,input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),sid=cleanRosterText(input.sid,'学号',40);
 const student=await db().prepare(`SELECT s.group_id,s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=? AND s.active=1`).bind(u,yearId,sid).first<{group_id:string;college:string;cohort:string}>();if(!student)throw new Error('学生不在当前学年名单');assertRosterEditor(a,student.college,student.cohort);
 await requireActiveCollege(u,student.college);
 const result=await guardedBatch(db(),[db().prepare('UPDATE roster_students SET active=0 WHERE owner=? AND year_id=? AND sid=? AND active=1').bind(u,yearId,sid)],[writableYearGuard(u,yearId),writableGroupGuard(u,student.group_id,a),accountWriteGuard(a)]);if(!result[0].meta.changes)throw new Error('学生不在当前学年名单');return json({ok:true,historyPreserved:true});
}catch(e){return failure(e);}}
