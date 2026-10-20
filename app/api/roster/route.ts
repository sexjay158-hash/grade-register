import {guardedBatch,writableYearGuard,writableGroupGuard,accountWriteGuard} from '@/lib/guarded-batch';
import {FEATURES} from '@/lib/flags';
import {cohortForImportedGroup} from '@/lib/group-cohorts';
import {requireAccessibleYear} from '@/lib/semester-access';
import {db,access,json,failure} from '@/lib/server';
import {assertRosterEditor} from '@/lib/role-scope';
import {readBody} from '@/lib/server';
import {validateRoster} from '@/lib/domain';
import {requireYear} from '@/lib/yearly-rosters';
import {requireActiveCollege} from '@/lib/colleges';
export async function POST(req:Request){try{
 const a=await access(req),u=a.owner,d=db(),input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true);
 if(input.useProvided)throw new Error('已取消内置名单，请上传你自己的 Excel 文件');
 const data=validateRoster(input.rows).map(r=>({...r,college:r.college||String(input.college??'').trim()}));
 if(data.some(r=>!r.college))throw new Error('导入名单需要填写院系，或先选择学院');
 const selected=String(input.college??'').trim();
 if(a.role!=='admin'&&(selected!==a.college||data.some(row=>row.college!==a.college)))throw new Error('无权限：导入范围必须是你负责的学院');
 if(selected&&data.some(r=>r.college!==selected))throw new Error('文件中的院系与当前所选学院不一致');
 if(a.role==='recorder'&&FEATURES.groupCohortScope){const unique=new Map(data.map(row=>[JSON.stringify([row.college,row.group]),row]));for(const row of unique.values())assertRosterEditor(a,row.college,await cohortForImportedGroup(u,yearId,row.college,row.group,data));}else for(const row of data)assertRosterEditor(a,row.college,row.cohort);
 const revision=await d.prepare('SELECT revision FROM group_cohort_versions WHERE owner=? AND year_id=?').bind(u,yearId).first<{revision:number}>();
 const current=await d.prepare('SELECT s.sid,s.active,s.name,s.college,g.name AS group_name,COALESCE(sn.number,s.sid) AS number FROM roster_students s JOIN roster_groups g ON g.id=s.group_id LEFT JOIN student_numbers sn ON sn.owner=s.owner AND sn.year_id=s.year_id AND sn.sid=s.sid WHERE s.owner=? AND s.year_id=?').bind(u,yearId).all<{sid:string;active:number;name:string;college:string;group_name:string;number:string}>(),seen=new Set(current.results.map(r=>r.sid));
 const signature=(sid:string,name:string,college:string,group:string)=>JSON.stringify([sid,name,college,group]);
 const existing=new Map<string,number>();for(const r of current.results.filter(r=>r.active)){const key=signature(r.number,r.name,r.college,r.group_name);existing.set(key,(existing.get(key)??0)+1);}
 const added=data.filter(r=>FEATURES.duplicateStudentNumbers?(existing.get(signature(r.sid,r.name,r.college,r.group))??0)<(r.occurrence??1):!seen.has(r.sid));if(!added.length)return json({students:0,groups:0,skipped:data.length});
 for(const college of new Set(added.map(r=>r.college)))await requireActiveCollege(u,college);
 const existingGroups=await d.prepare('SELECT id,college,name FROM roster_groups WHERE owner=? AND year_id=?').bind(u,yearId).all<{id:string;college:string;name:string}>();
 const byKey=new Map(existingGroups.results.map(g=>[JSON.stringify([g.college,g.name]),g.id]));
 const missing:{id:string;college:string;name:string;internal:string}[]=[];
 for(const r of added){const key=JSON.stringify([r.college,r.group]);if(!byKey.has(key)){const id=crypto.randomUUID();byKey.set(key,id);missing.push({id,college:r.college,name:r.group,internal:`roster:${id}`});}}
 const max=await d.prepare('SELECT COALESCE(MAX(position),-1) AS n FROM roster_students WHERE owner=? AND year_id=?').bind(u,yearId).first<{n:number}>();
 const base=(max?.n??-1)+1;
 const rows=added.map((r,i)=>{const sid=seen.has(r.sid)?(r.cohort||'0000')+crypto.randomUUID():r.sid;seen.add(sid);return {sid,number:r.sid,name:r.name,college:r.college,cohort:r.cohort,groupId:byKey.get(JSON.stringify([r.college,r.group])),position:base+i};});
 await guardedBatch(d,[
 d.prepare("INSERT INTO groups(id,owner,name) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.internal') FROM json_each(?)").bind(u,JSON.stringify(missing)),
 d.prepare("INSERT INTO roster_groups(id,owner,year_id,college,name) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.college'),json_extract(value,'$.name') FROM json_each(?)").bind(u,yearId,JSON.stringify(missing)),
 d.prepare("INSERT INTO roster_students(owner,year_id,sid,name,college,group_id,position,active) SELECT ?,?,json_extract(value,'$.sid'),json_extract(value,'$.name'),json_extract(value,'$.college'),json_extract(value,'$.groupId'),json_extract(value,'$.position'),1 FROM json_each(?)").bind(u,yearId,JSON.stringify(rows)),
 d.prepare("INSERT INTO student_numbers(owner,year_id,sid,number) SELECT ?,?,json_extract(value,'$.sid'),json_extract(value,'$.number') FROM json_each(?)").bind(u,yearId,JSON.stringify(rows)),
 d.prepare("INSERT INTO student_cohorts(owner,year_id,sid,cohort) SELECT ?,?,json_extract(value,'$.sid'),json_extract(value,'$.cohort') FROM json_each(?)").bind(u,yearId,JSON.stringify(rows))
 ],[writableYearGuard(u,yearId),accountWriteGuard(a),...existingGroups.results.filter(g=>added.some(r=>r.college===g.college&&r.group===g.name)).map(g=>writableGroupGuard(u,g.id,a)),...[...new Set(added.map(r=>r.college))].map(college=>({sql:'EXISTS(SELECT 1 FROM colleges WHERE owner=? AND name=? AND active=1)',values:[u,college]})),{sql:'COALESCE((SELECT revision FROM group_cohort_versions WHERE owner=? AND year_id=?),0)=?',values:[u,yearId,revision?.revision??0]}],'名单已被其他人修改，请重新导入同一文件，已有名单会自动跳过');return json({students:added.length,groups:missing.length,skipped:data.length-added.length});
}catch(e){return failure(e);}}

export async function DELETE(req:Request){try{
 const a=await access(req),input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true);
 if(!FEATURES.collegeRosterClear)throw new Error('批量清空名单已关闭');
 const college=String(input.college??'').trim();if(!college||college==='all')throw new Error('请先选择具体学院');
 if(a.role==='recorder'||a.role!=='admin'&&a.college!==college)throw new Error('无权限：仅管理员和本院负责人可清空学院名单');
 if(input.confirmCollege!==college)throw new Error('请输入完整学院名称确认清空');
 await requireActiveCollege(a.owner,college);
 const result=await guardedBatch(db(),[db().prepare('UPDATE roster_students SET active=0 WHERE owner=? AND year_id=? AND college=? AND active=1 RETURNING sid').bind(a.owner,yearId,college)],[writableYearGuard(a.owner,yearId),accountWriteGuard(a),{sql:'EXISTS(SELECT 1 FROM colleges WHERE owner=? AND name=? AND active=1)',values:[a.owner,college]}]);
 return json({deleted:result[0].results.length,historyPreserved:true});
}catch(e){return failure(e);}}
