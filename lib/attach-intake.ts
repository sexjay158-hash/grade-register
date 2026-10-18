import {db,now,type Access} from '@/lib/server';
import {matchLines} from '@/lib/domain';
import {yearForIntake} from '@/lib/yearly-rosters';
import {ensureColleges} from '@/lib/colleges';
import {FEATURES} from '@/lib/flags';
import {cohortJoin,cohortExpr,scopeCohortExpr} from '@/lib/role-scope';
export async function attachIntake(user:string,id:string,groupId:string,a?:Access){
 const d=db(),photo=await d.prepare('SELECT * FROM intake WHERE id=? AND owner=?').bind(id,user).first<any>();
 if(!photo)throw new Error('照片不存在');
 if(photo.status==='assigned')return {eventId:photo.event_id,matched:photo.matched,unresolved:photo.unresolved};
 const yearId=await yearForIntake(user,id);
 await ensureColleges(user);
 if(!await d.prepare('SELECT g.id FROM roster_groups g JOIN colleges c ON c.owner=g.owner AND c.name=g.college AND c.active=1 WHERE g.id=? AND g.owner=? AND g.year_id=?').bind(groupId,user,yearId).first())throw new Error('小组不属于该照片的学年或学院已归档');
 const members=await d.prepare(`SELECT s.sid,s.name,s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.group_id=? AND s.active=1`).bind(user,groupId).all<{sid:string;name:string;college:string;cohort:string}>();
 const allowed=a&&a.role!=='admin'?members.results.filter(s=>s.college===a.college&&(a.role!=='recorder'||s.cohort===a.cohort)):members.results;
 const lines=JSON.parse(photo.lines||'[]') as string[],parsed=matchLines(lines,allowed);
 const event=await d.prepare("SELECT * FROM events WHERE owner=? AND group_id=? AND status='draft'").bind(user,groupId).first<any>();
 if(event&&FEATURES.photoActivityDateGuard&&event.date!==photo.date){const reason='活动日期与该组未确认草稿不同，请核对日期；同次活动的多张表请使用相同日期';await d.prepare("UPDATE intake SET status='needs_review',error=? WHERE id=? AND owner=?").bind(reason,id,user).run();return {blocked:true,error:reason};}
 if(event&&!FEATURES.continuousPhotoUpload&&event.batch_id!==photo.batch_id){await d.prepare("UPDATE intake SET status='needs_review',error=? WHERE id=? AND owner=?").bind('该组还有上次未确认的活动草稿；完成后再处理这张照片',id,user).run();return {blocked:true,error:'该组还有上次未确认的活动草稿'};}
 let eventId=event?.id;
 if(!eventId){eventId=crypto.randomUUID();const t=now();await d.prepare("INSERT INTO events(id,owner,group_id,number,date,status,batch_id,created,updated) SELECT ?,?,?,COALESCE(MAX(number),0)+1,?,'draft',?,?,? FROM events WHERE owner=? AND group_id=?").bind(eventId,user,groupId,photo.date,photo.batch_id,t,t,user,groupId).run();}
 const previous=await d.prepare('SELECT sid,score,state FROM scores WHERE event_id=?').bind(eventId).all<any>(),prev=new Map(previous.results.map(s=>[s.sid,s]));
 const conflicts=parsed.matched.filter(s=>prev.has(s.sid)&&prev.get(s.sid).state!=='unrecorded'&&(prev.get(s.sid).score!==s.score||prev.get(s.sid).state!==s.state));
 const writeable=parsed.matched.filter(s=>!prev.has(s.sid)||prev.get(s.sid).state==='unrecorded'),issues=parsed.unresolved.length+conflicts.length;
 const queries=[
  d.prepare("INSERT INTO photos(id,owner,event_id,hash,name,mime,size,created) SELECT id,owner,?,hash,name,mime,size,created FROM intake WHERE id=? AND owner=? AND status<>'assigned'").bind(eventId,id,user),
  d.prepare("INSERT INTO scores(event_id,sid,score,state,note) SELECT ?,json_extract(value,'$.sid'),json_extract(value,'$.score'),json_extract(value,'$.state'),'自动识别，待对照照片核对' FROM json_each(?) WHERE EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=? AND status<>'assigned') ON CONFLICT(event_id,sid) DO UPDATE SET score=excluded.score,state=excluded.state,note=excluded.note WHERE scores.state='unrecorded'").bind(eventId,JSON.stringify(writeable),id,user),
  d.prepare("UPDATE intake SET status='assigned',group_id=?,event_id=?,matched=?,unresolved=?,error='' WHERE id=? AND owner=? AND status<>'assigned'").bind(groupId,eventId,writeable.length,issues,id,user),
  d.prepare('UPDATE events SET version=version+1,updated=? WHERE id=? AND owner=?').bind(now(),eventId,user)
 ];
 queries.push(d.prepare('INSERT INTO audit(id,owner,event_id,action,payload,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),user,eventId,'recognize',JSON.stringify({actorEmail:a?.email,photoId:id,rows:writeable}),now()));
 const result=await d.batch(queries);if(!result[2].meta.changes)throw new Error('照片已被处理，请刷新页面');
 return {eventId,matched:writeable.length,unresolved:issues,groupId};
}
