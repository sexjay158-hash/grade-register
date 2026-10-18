import {cohortForGroup} from '@/lib/group-cohorts';
import {requireAccessibleYear} from '@/lib/semester-access';
import {db,access,json,failure,readBody} from '@/lib/server';
import {assertRosterEditor,cohortExpr,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';
import {requireYear,cleanRosterText} from '@/lib/yearly-rosters';
import {requireActiveCollege} from '@/lib/colleges';
import {normalizeCohort} from '@/lib/cohort';

async function groupFor(owner:string,yearId:string,college:string,name:string){
 const d=db(),existing=await d.prepare('SELECT id FROM roster_groups WHERE owner=? AND year_id=? AND college=? AND name=?').bind(owner,yearId,college,name).first<{id:string}>();
 if(existing)return existing.id;
 const id=crypto.randomUUID();await d.batch([
  d.prepare('INSERT INTO groups(id,owner,name) VALUES(?,?,?)').bind(id,owner,`roster:${id}`),
  d.prepare('INSERT INTO roster_groups(id,owner,year_id,college,name) VALUES(?,?,?,?,?)').bind(id,owner,yearId,college,name)
 ]);return id;
}
async function values(input:Record<string,unknown>){const sid=cleanRosterText(input.sid,'学号',40);return {sid,name:cleanRosterText(input.name,'姓名',80),college:cleanRosterText(input.college,'院系'),group:cleanRosterText(input.group,'小组名称'),cohort:normalizeCohort(input.cohort,sid)};}

export async function POST(req:Request){try{
 const a=await access(req),u=a.owner,input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),v=await values(input),d=db();assertRosterEditor(a,v.college,await cohortForGroup(u,yearId,v.college,v.group,v.cohort));
 const old=await d.prepare(`SELECT s.active,s.name,s.college,s.group_id,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=?`).bind(u,yearId,v.sid).first<{active:number;name:string;college:string;group_id:string;cohort:string}>();if(old)assertRosterEditor(a,old.college,old.cohort);if(old?.active)throw new Error('该学年已有此学号，请使用编辑');
 await requireActiveCollege(u,v.college);
 const groupId=await groupFor(u,yearId,v.college,v.group),max=await d.prepare('SELECT COALESCE(MAX(position),-1) AS n FROM roster_students WHERE owner=? AND year_id=?').bind(u,yearId).first<{n:number}>();
 if(old){const scored=await d.prepare("SELECT 1 FROM scores s JOIN events e ON e.id=s.event_id WHERE e.owner=? AND e.group_id=? AND s.sid=? AND s.state<>'unrecorded' LIMIT 1").bind(u,old.group_id,v.sid).first();if(scored&&(old.name!==v.name||old.college!==v.college||old.group_id!==groupId))throw new Error('该学号有历史成绩，只能按原姓名和小组恢复名单');}
 await d.batch([d.prepare('INSERT INTO roster_students(owner,year_id,sid,name,college,group_id,position,active) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(owner,year_id,sid) DO UPDATE SET name=excluded.name,college=excluded.college,group_id=excluded.group_id,active=1').bind(u,yearId,v.sid,v.name,v.college,groupId,(max?.n??-1)+1),d.prepare('INSERT INTO student_cohorts(owner,year_id,sid,cohort) VALUES(?,?,?,?) ON CONFLICT(owner,year_id,sid) DO UPDATE SET cohort=excluded.cohort').bind(u,yearId,v.sid,v.cohort)]);return json({ok:true});
}catch(e){return failure(e);}}
export async function PUT(req:Request){try{
 const a=await access(req),u=a.owner,input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),v=await values(input),oldSid=cleanRosterText(input.oldSid,'原学号',40),d=db();
 const old=await d.prepare(`SELECT s.group_id,s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=? AND s.active=1`).bind(u,yearId,oldSid).first<{group_id:string;college:string;cohort:string}>();if(!old)throw new Error('找不到该学生');assertRosterEditor(a,old.college,old.cohort);assertRosterEditor(a,v.college,await cohortForGroup(u,yearId,v.college,v.group,v.cohort));
 if(v.sid!==oldSid&&await d.prepare('SELECT sid FROM roster_students WHERE owner=? AND year_id=? AND sid=?').bind(u,yearId,v.sid).first())throw new Error('新学号已存在');
 const scored=await d.prepare("SELECT 1 FROM scores s JOIN events e ON e.id=s.event_id WHERE e.owner=? AND e.group_id=? AND s.sid=? AND s.state<>'unrecorded' LIMIT 1").bind(u,old.group_id,oldSid).first();
 const oldGroup=await d.prepare('SELECT college,name FROM roster_groups WHERE id=? AND owner=? AND year_id=?').bind(old.group_id,u,yearId).first<{college:string;name:string}>();
 if(scored&&(v.sid!==oldSid||oldGroup?.college!==v.college||oldGroup?.name!==v.group))throw new Error('此学生已有成绩，可改姓名；更换学号或小组会使历史成绩失去关联');
 await requireActiveCollege(u,v.college);
 const groupId=await groupFor(u,yearId,v.college,v.group);
 await d.batch([d.prepare('UPDATE roster_students SET sid=?,name=?,college=?,group_id=? WHERE owner=? AND year_id=? AND sid=? AND active=1').bind(v.sid,v.name,v.college,groupId,u,yearId,oldSid),d.prepare('DELETE FROM student_cohorts WHERE owner=? AND year_id=? AND sid=?').bind(u,yearId,oldSid),d.prepare('INSERT INTO student_cohorts(owner,year_id,sid,cohort) VALUES(?,?,?,?) ON CONFLICT(owner,year_id,sid) DO UPDATE SET cohort=excluded.cohort').bind(u,yearId,v.sid,v.cohort)]);return json({ok:true});
}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{
 const a=await access(req),u=a.owner,input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),sid=cleanRosterText(input.sid,'学号',40);
 const student=await db().prepare(`SELECT s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.sid=? AND s.active=1`).bind(u,yearId,sid).first<{college:string;cohort:string}>();if(!student)throw new Error('学生不在当前学年名单');assertRosterEditor(a,student.college,student.cohort);
 await requireActiveCollege(u,student.college);
 const result=await db().prepare('UPDATE roster_students SET active=0 WHERE owner=? AND year_id=? AND sid=? AND active=1').bind(u,yearId,sid).run();if(!result.meta.changes)throw new Error('学生不在当前学年名单');return json({ok:true,historyPreserved:true});
}catch(e){return failure(e);}}
