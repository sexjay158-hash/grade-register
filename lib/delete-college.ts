import {db,bucket,now} from './server';
import {FEATURES} from './flags';
import {ensureActivityRatings} from './activity-rating-store';

export async function deleteArchivedCollege(owner:string,id:string,confirmedName:unknown){
 if(!FEATURES.archivedCollegeDeletion)throw new Error('学院删除功能已关闭');
 const d=db(),college=await d.prepare('SELECT name,active FROM colleges WHERE owner=? AND id=?').bind(owner,id).first<{name:string;active:number}>();
 if(!college)throw new Error('学院不存在');
 if(college.active)throw new Error('请先归档学院后再删除');
 if(confirmedName!==college.name)throw new Error('请输入完整学院名称确认删除');
 if(FEATURES.semesterArchives&&await d.prepare('SELECT 1 FROM roster_groups g JOIN semester_archives ar ON ar.owner=g.owner AND ar.year_id=g.year_id WHERE g.owner=? AND g.college=? LIMIT 1').bind(owner,college.name).first())throw new Error('学院包含归档学期数据，不能永久删除；请保留历史档案');
 await ensureActivityRatings();
 if(FEATURES.bulkGroupAccounts){const {ensureGroupAccounts}=await import('./group-account-store');await ensureGroupAccounts();}
 const groupSql='SELECT id FROM roster_groups WHERE owner=? AND college=?';
 const eventSql=`SELECT id FROM events WHERE owner=? AND group_id IN (${groupSql})`;
 const eventArgs=[owner,owner,college.name];
 const intakeRows=await d.prepare(`SELECT id FROM intake WHERE owner=? AND (group_id IN (${groupSql}) OR event_id IN (${eventSql})) UNION SELECT intake_id AS id FROM intake_event_links WHERE owner=? AND event_id IN (${eventSql})`).bind(owner,owner,college.name,...eventArgs,owner,...eventArgs).all<{id:string}>();
 const photoRows=await d.prepare(`SELECT id FROM photos WHERE owner=? AND event_id IN (${eventSql})`).bind(owner,...eventArgs).all<{id:string}>();
 const intakeIds=JSON.stringify(intakeRows.results.map(row=>row.id));
 const guard='EXISTS(SELECT 1 FROM colleges WHERE owner=? AND id=? AND active=0 AND name=?)';
 const guardArgs=[owner,id,college.name];
 const statement=(sql:string,args:unknown[])=>d.prepare(`${sql} AND ${guard}`).bind(...args,...guardArgs);
 // One transaction removes every school year. Shared intake photos retain their other colleges' links.
 const result=await d.batch([
  ...(FEATURES.bulkGroupAccounts?[
   statement('DELETE FROM group_account_activations WHERE account_id IN (SELECT account_id FROM group_account_assignments WHERE owner=? AND group_id IN (SELECT id FROM roster_groups WHERE owner=? AND college=?))',[owner,owner,college.name]),
   statement('DELETE FROM group_account_assignments WHERE owner=? AND group_id IN (SELECT id FROM roster_groups WHERE owner=? AND college=?)',[owner,owner,college.name])
  ]:[]),
  statement(`DELETE FROM scores WHERE event_id IN (${eventSql})`,eventArgs),
  statement(`DELETE FROM photos WHERE owner=? AND event_id IN (${eventSql})`,[owner,...eventArgs]),
  statement(`DELETE FROM intake_event_links WHERE owner=? AND event_id IN (${eventSql})`,[owner,...eventArgs]),
  statement("UPDATE intake SET event_id=(SELECT l.event_id FROM intake_event_links l WHERE l.owner=intake.owner AND l.intake_id=intake.id LIMIT 1),group_id=(SELECT e.group_id FROM intake_event_links l JOIN events e ON e.id=l.event_id WHERE l.owner=intake.owner AND l.intake_id=intake.id LIMIT 1),matched=COALESCE((SELECT SUM(l.matched) FROM intake_event_links l WHERE l.owner=intake.owner AND l.intake_id=intake.id),0),error='部分学院已删除，请核对剩余成绩' WHERE owner=? AND id IN (SELECT value FROM json_each(?))",[owner,intakeIds]),
  statement('DELETE FROM roster_intakes WHERE owner=? AND intake_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM intake_event_links l WHERE l.owner=roster_intakes.owner AND l.intake_id=roster_intakes.intake_id)',[owner,intakeIds]),
  statement('DELETE FROM intake WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM intake_event_links l WHERE l.owner=intake.owner AND l.intake_id=intake.id)',[owner,intakeIds]),
  statement(`DELETE FROM audit WHERE owner=? AND event_id IN (${eventSql})`,[owner,...eventArgs]),
  statement(`DELETE FROM event_ratings WHERE owner=? AND event_id IN (${eventSql})`,[owner,...eventArgs]),
  statement(`DELETE FROM events WHERE owner=? AND group_id IN (${groupSql})`,[owner,owner,college.name]),
  statement('DELETE FROM student_cohorts WHERE owner=? AND EXISTS(SELECT 1 FROM roster_students s WHERE s.owner=student_cohorts.owner AND s.year_id=student_cohorts.year_id AND s.sid=student_cohorts.sid AND s.college=?)',[owner,college.name]),
  statement('DELETE FROM student_numbers WHERE owner=? AND EXISTS(SELECT 1 FROM roster_students s WHERE s.owner=student_numbers.owner AND s.year_id=student_numbers.year_id AND s.sid=student_numbers.sid AND s.college=?)',[owner,college.name]),
  statement(`DELETE FROM group_cohorts WHERE owner=? AND group_id IN (${groupSql})`,[owner,owner,college.name]),
  statement('DELETE FROM roster_students WHERE owner=? AND college=?',[owner,college.name]),
  statement(`DELETE FROM students WHERE owner=? AND (college=? OR group_id IN (${groupSql}))`,[owner,college.name,owner,college.name]),
  statement(`DELETE FROM groups WHERE owner=? AND id IN (${groupSql})`,[owner,owner,college.name]),
  statement('DELETE FROM roster_groups WHERE owner=? AND college=?',[owner,college.name]),
  statement('DELETE FROM site_members WHERE college=?',[college.name]),
  ...(FEATURES.localAccounts?[
   statement("DELETE FROM local_sessions WHERE account_id IN (SELECT id FROM local_accounts WHERE role<>'admin' AND college=?)",[college.name]),
   statement("UPDATE local_accounts SET active=0,updated=? WHERE role<>'admin' AND college=?",[now(),college.name])
  ]:[]),
  d.prepare('DELETE FROM colleges WHERE owner=? AND id=? AND active=0 AND name=?').bind(...guardArgs)
 ]);
 if(!result[result.length-1].meta.changes)throw new Error('学院状态已变化，请刷新后重试');
 const candidates=[...new Set([...photoRows.results,...intakeRows.results].map(row=>row.id))];
 const stored=await d.prepare('SELECT id FROM intake WHERE owner=? AND id IN (SELECT value FROM json_each(?)) UNION SELECT id FROM photos WHERE owner=? AND id IN (SELECT value FROM json_each(?))').bind(owner,JSON.stringify(candidates),owner,JSON.stringify(candidates)).all<{id:string}>();
 const retained=new Set(stored.results.map(row=>row.id));
 const removed=candidates.filter(photoId=>!retained.has(photoId));
 await d.prepare('DELETE FROM photo_actors WHERE owner=? AND id IN (SELECT value FROM json_each(?))').bind(owner,JSON.stringify(removed)).run();
 const cleanup=await Promise.allSettled(removed.map(async photoId=>bucket().delete(`${owner}/${photoId}`)));
 return {id,name:college.name,active:0,deleted:true,photoCleanupFailed:cleanup.filter(item=>item.status==='rejected').length};
}
