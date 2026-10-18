import {access,db,json,failure} from '@/lib/server';
import {requireAccessibleYear} from '@/lib/semester-access';
import {assertStudentScope} from '@/lib/role-scope';
import {FEATURES} from '@/lib/flags';

export async function GET(req:Request){try{
 if(!FEATURES.studentGradeManagement)throw new Error('个人成绩管理已关闭');
 const a=await access(req),params=new URL(req.url).searchParams,yearId=await requireAccessibleYear(a,params.get('yearId')),sid=params.get('sid');
 await assertStudentScope(a,yearId,String(sid));
 const student=await db().prepare('SELECT sid,name,college,group_id FROM roster_students WHERE owner=? AND year_id=? AND sid=? AND active=1').bind(a.owner,yearId,sid).first<{sid:string;name:string;college:string;group_id:string}>();
 if(!student)throw new Error('学生不在当前学期名单');
 const archived=!!await db().prepare('SELECT year_id FROM semester_archives WHERE owner=? AND year_id=?').bind(a.owner,yearId).first();
 const college=await db().prepare('SELECT active FROM colleges WHERE owner=? AND name=?').bind(a.owner,student.college).first<{active:number}>();
 const writable=!archived&&!!college?.active;
 const rows=await db().prepare("SELECT e.id,e.number,e.date,e.status,e.version,s.score,COALESCE(s.state,'unrecorded') AS state FROM events e JOIN roster_groups g ON g.id=e.group_id LEFT JOIN scores s ON s.event_id=e.id AND s.sid=? WHERE e.owner=? AND e.group_id=? AND g.year_id=? ORDER BY e.number").bind(sid,a.owner,student.group_id,yearId).all<{status:string}>();
 return json({student,canCreate:writable,events:rows.results.map(row=>({...row,editable:writable&&!(a.role==='recorder'&&FEATURES.confirmedGradeLock&&row.status==='committed')}))});
}catch(e){return failure(e);}}
