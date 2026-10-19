import {db,now,type Access} from '@/lib/server';
import {groupMatchedLines,type Score} from '@/lib/domain';
import {yearForIntake} from '@/lib/yearly-rosters';
import {ensureColleges} from '@/lib/colleges';
import {FEATURES} from '@/lib/flags';
import {cohortJoin,cohortExpr,scopeCohortExpr} from '@/lib/role-scope';

export async function attachMixedIntake(user:string,id:string,a?:Access){
 const d=db(),photo=await d.prepare('SELECT * FROM intake WHERE id=? AND owner=?').bind(id,user).first<any>();
 if(!photo)throw new Error('照片不存在');
 if(photo.status==='assigned')return {matched:photo.matched,unresolved:photo.unresolved,groupCount:(await d.prepare('SELECT COUNT(*) AS n FROM intake_event_links WHERE intake_id=? AND owner=?').bind(id,user).first<{n:number}>())?.n??0};
 const lines=JSON.parse(photo.lines||'[]') as string[];
 const yearId=await yearForIntake(user,id);
 await ensureColleges(user);
 const students=await d.prepare(`SELECT s.sid,COALESCE(sn.number,s.sid) AS student_number,s.name,s.group_id,s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} JOIN colleges c ON c.owner=s.owner AND c.name=s.college AND c.active=1 WHERE s.owner=? AND s.year_id=? AND s.active=1`).bind(user,yearId).all<{sid:string;name:string;group_id:string;college:string;cohort:string}>();
 const allowed=a&&a.role!=='admin'?students.results.filter(s=>s.college===a.college&&(a.role!=='recorder'||s.cohort===a.cohort)):students.results;
 const parsed=groupMatchedLines(lines,allowed);
 if(!parsed.groups.size){
  const reason='未能从同一行确认学生和成绩，请核对原图或拍清楚后重试';
  await d.prepare("UPDATE intake SET status='needs_review',unresolved=?,error=? WHERE id=? AND owner=? AND status<>'assigned'").bind(parsed.unresolved.length,reason,id,user).run();
  return {blocked:true,reason,matched:0,unresolved:parsed.unresolved.length,groupCount:0};
 }
 const drafts=await d.prepare("SELECT id,group_id,batch_id,date FROM events WHERE owner=? AND status='draft'").bind(user).all<{id:string;group_id:string;batch_id:string|null;date:string}>();
 const draftByGroup=new Map(drafts.results.map(e=>[e.group_id,e]));
 if(FEATURES.photoActivityDateGuard&&[...parsed.groups.keys()].some(groupId=>{const draft=draftByGroup.get(groupId);return draft&&draft.date!==photo.date;})){
  const reason='活动日期与该组未确认草稿不同，请核对日期；同次活动的多张表请使用相同日期，不同次活动请先完成现有草稿';
  await d.prepare("UPDATE intake SET status='needs_review',error=? WHERE id=? AND owner=? AND status<>'assigned'").bind(reason,id,user).run();
  return {blocked:true,reason,matched:0,unresolved:parsed.unresolved.length,groupCount:0};
 }
 if(!FEATURES.continuousPhotoUpload){
  const blocked=[...parsed.groups.keys()].filter(groupId=>{const draft=draftByGroup.get(groupId);return draft&&draft.batch_id!==photo.batch_id;});
  if(blocked.length){
   const reason='该组还有上次未确认的活动草稿；确认后重试这张照片';
   await d.prepare("UPDATE intake SET status='needs_review',error=? WHERE id=? AND owner=? AND status<>'assigned'").bind(reason,id,user).run();
   return {blocked:true,reason,matched:0,unresolved:parsed.unresolved.length,groupCount:0};
  }
 }
 const plans:{groupId:string;eventId:string;create:boolean;writeable:Score[];conflicts:number}[]=[];
 for(const [groupId,rows] of parsed.groups){
  const draft=draftByGroup.get(groupId),eventId=draft?.id??crypto.randomUUID();
  const previous=await d.prepare('SELECT sid,score,state FROM scores WHERE event_id=?').bind(eventId).all<{sid:string;score:number|null;state:string}>(),bySid=new Map(previous.results.map(row=>[row.sid,row]));
  const writeable=rows.filter(row=>!bySid.has(row.sid)||bySid.get(row.sid)!.state==='unrecorded');
  const conflicts=rows.filter(row=>{const old=bySid.get(row.sid);return old&&old.state!=='unrecorded'&&(old.score!==row.score||old.state!==row.state);}).length;
  plans.push({groupId,eventId,create:!draft,writeable,conflicts});
 }
 const t=now(),queries:any[]=[],matched=plans.reduce((n,p)=>n+p.writeable.length,0),unresolved=parsed.unresolved.length+plans.reduce((n,p)=>n+p.conflicts,0);
 for(const plan of plans){
  if(plan.create)queries.push(d.prepare("INSERT INTO events(id,owner,group_id,number,date,status,batch_id,created,updated) SELECT ?,?,?,COALESCE(MAX(number),0)+1,?,'draft',?,?,? FROM events WHERE owner=? AND group_id=?").bind(plan.eventId,user,plan.groupId,photo.date,photo.batch_id,t,t,user,plan.groupId));
  queries.push(d.prepare("INSERT INTO intake_event_links(intake_id,event_id,owner,matched) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND owner=? AND status='draft')").bind(id,plan.eventId,user,plan.writeable.length,plan.eventId,user));
  queries.push(d.prepare("INSERT INTO scores(event_id,sid,score,state,note) SELECT ?,json_extract(value,'$.sid'),json_extract(value,'$.score'),json_extract(value,'$.state'),'自动识别，待对照照片核对' FROM json_each(?) WHERE EXISTS(SELECT 1 FROM intake_event_links WHERE intake_id=? AND event_id=? AND owner=?) ON CONFLICT(event_id,sid) DO UPDATE SET score=excluded.score,state=excluded.state,note=excluded.note WHERE scores.state='unrecorded'").bind(plan.eventId,JSON.stringify(plan.writeable),id,plan.eventId,user));
  queries.push(d.prepare('UPDATE events SET version=version+1,updated=? WHERE id=? AND owner=?').bind(t,plan.eventId,user));
  queries.push(d.prepare('INSERT INTO audit(id,owner,event_id,action,payload,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),user,plan.eventId,'recognize',JSON.stringify({actorEmail:a?.email,photoId:id,rows:plan.writeable}),t));
 }
 const primary=plans.length===1?plans[0]:null;
 queries.push(d.prepare("UPDATE intake SET status='assigned',group_id=?,event_id=?,matched=?,unresolved=?,error=? WHERE id=? AND owner=? AND status<>'assigned'").bind(primary?.groupId??null,primary?.eventId??null,matched,unresolved,unresolved?`${unresolved} 行未能安全录入，请对照原图核对`:'',id,user));
 const result=await d.batch(queries);
 if(!result.at(-1)?.meta.changes)throw new Error('照片已被处理，请刷新页面');
 return {matched,unresolved,groupCount:plans.length,eventIds:plans.map(p=>p.eventId)};
}
