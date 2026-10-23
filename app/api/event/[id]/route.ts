import {guardedBatch,writableGroupGuard,accountWriteGuard} from '@/lib/guarded-batch';
import {canDeleteActivity} from '@/lib/activity-deletion';
import {db,bucket,access,requireEditor,json,failure,getEvent,now} from '@/lib/server';
import {readBody} from '@/lib/server';
import {validateScores} from '@/lib/domain';
import {FEATURES} from '@/lib/flags';
import {requireActivityRating} from '@/lib/activity-rating';
import {ensureActivityRatings} from '@/lib/activity-rating-store';
import {assertEventScope,assertStudentScope,assertPhotoScope,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,a=await access(req),u=a.owner;const group=await assertEventScope(a,id);const event=await getEvent(id,u),d=db();
 if(FEATURES.activityRating){await ensureActivityRatings();const rating=await d.prepare('SELECT rating FROM event_ratings WHERE event_id=? AND owner=?').bind(id,u).first<{rating:string}>();event.rating=rating?.rating??null;}
 const [s,p,linked,auditRows]=await d.batch([d.prepare('SELECT * FROM scores WHERE event_id=?').bind(id),d.prepare('SELECT id,name,mime,size,created FROM photos WHERE event_id=?').bind(id),d.prepare('SELECT i.id,i.name,i.mime,i.size,i.created FROM intake_event_links l JOIN intake i ON i.id=l.intake_id WHERE l.event_id=? AND l.owner=?').bind(id,u),d.prepare("SELECT action,created,json_extract(payload,'$.actorEmail') AS actorEmail FROM audit WHERE event_id=? AND owner=? ORDER BY created DESC LIMIT 20").bind(id,u)]);
 const allowed=a.role==='recorder'&&!a.groupId?(await d.prepare(`SELECT s.sid FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.group_id=? AND s.active=1 AND ${scopeCohortExpr()}=?`).bind(u,group.year_id,event.group_id,a.cohort).all<{sid:string}>()).results.map(row=>row.sid):null;
 const actorPhotos=a.role==='recorder'&&!FEATURES.groupCohortScope?(await d.prepare('SELECT id FROM photo_actors WHERE owner=? AND account_id=?').bind(u,a.userId).all<{id:string}>()).results.map(row=>row.id):null;
 const photoRows=[];for(const photo of [...p.results,...linked.results]){try{await assertPhotoScope(req,p.results.some(row=>(row as {id:string}).id===(photo as {id:string}).id)?'photo':'intake',String((photo as {id:string}).id));photoRows.push(photo);}catch(err){if(a.role==='admin')throw err;}}
 return json({event,scores:allowed?s.results.filter(row=>allowed.includes(String((row as {sid:string}).sid))):s.results,photos:actorPhotos?photoRows.filter(row=>actorPhotos.includes(String((row as {id:string}).id))):photoRows,audit:a.role==='recorder'?[]:auditRows.results});
}catch(e){return failure(e);}}
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,a=await access(req);requireEditor(a);const u=a.owner,event=await getEvent(id,u),d=db(),body=await readBody(req);const group=await assertEventScope(a,id,true);
 if(a.role==='recorder'&&!(body.action==='save'||FEATURES.recorderActivityRating&&body.action==='rate'))throw new Error('无权限：年级负责人只能保存成绩和草稿等次，活动确认由院负责人或管理员完成');
 if(a.role==='recorder'&&body.rating!==undefined&&!FEATURES.recorderActivityRating)throw new Error('无权限：活动等次由院负责人或管理员设置');
 if(a.role==='recorder'&&event.status!=='draft')throw new Error('无权限：已确认成绩和等次只能由院负责人或管理员修改');
 if(!['save','commit','reopen','rate'].includes(body.action))throw new Error('不支持的操作');
 if(!Number.isInteger(body.version)||body.version!==event.version)throw new Error('活动已被更新，请重新打开后操作');
 if(FEATURES.activityRating)await ensureActivityRatings();
 if(body.action==='rate'){
  if(!FEATURES.activityRating)throw new Error('活动等次功能已关闭');
  const rating=requireActivityRating(body.rating),previous=await d.prepare('SELECT rating FROM event_ratings WHERE event_id=? AND owner=?').bind(id,u).first<{rating:string}>();
  const token=crypto.randomUUID(),t=now(),guard='EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND token=?)';
  const result=await guardedBatch(d,[
   d.prepare('UPDATE events SET version=version+1,token=?,updated=? WHERE id=? AND owner=? AND version=?').bind(token,t,id,u,body.version),
   d.prepare(`INSERT INTO event_ratings(event_id,owner,rating,updated) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(event_id) DO UPDATE SET rating=excluded.rating,updated=excluded.updated`).bind(id,u,rating,t,id,u,token),
   d.prepare(`INSERT INTO audit(id,owner,event_id,action,payload,created) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,id,'rate',JSON.stringify({actorEmail:a.email,previousRating:previous?.rating??null,rating}),t,id,u,token)
  ],[writableGroupGuard(u,event.group_id,a),accountWriteGuard(a)]);
  if(!result[0].meta.changes)throw new Error('活动已被更新，请重新打开后操作');
  return json({version:event.version+1,status:event.status,rating});
 }
 if(body.action==='reopen'&&event.status!=='committed')throw new Error('活动还未登记');
 if(body.action!=='reopen'&&event.status!=='draft')throw new Error('请先撤回登记，再补传或修改');
 const members=await d.prepare('SELECT sid FROM roster_students WHERE owner=? AND group_id=? AND active=1').bind(u,event.group_id).all<{sid:string}>();
 const rows=body.action==='reopen'?[]:validateScores(body.rows,members.results.map(s=>s.sid));
 if(a.role==='recorder')for(const row of rows)await assertStudentScope(a,group.year_id,row.sid,true);
 if(body.action==='commit'&&!rows.some(r=>r.state!=='unrecorded'))throw new Error('请至少登记一名学生的成绩或出勤状态');
 const previous=await d.prepare('SELECT * FROM scores WHERE event_id=?').bind(id).all();
 const token=crypto.randomUUID(),v=event.version+1,t=now(),status=body.action==='commit'?'committed':'draft';
 const guard='EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND token=?)';
 const queries=[d.prepare('UPDATE events SET status=?,version=version+1,token=?,updated=? WHERE id=? AND owner=? AND version=?').bind(status,token,t,id,u,body.version)];
 if(body.action!=='reopen')queries.push(d.prepare(`INSERT INTO scores(event_id,sid,score,state,note) SELECT ?,json_extract(value,'$.sid'),json_extract(value,'$.score'),json_extract(value,'$.state'),json_extract(value,'$.note') FROM json_each(?) WHERE ${guard} ON CONFLICT(event_id,sid) DO UPDATE SET score=excluded.score,state=excluded.state,note=excluded.note`).bind(id,JSON.stringify(rows),id,u,token));
 if(FEATURES.activityRating&&body.action!=='reopen'&&body.rating!==undefined){const rating=requireActivityRating(body.rating);queries.push(d.prepare(`INSERT INTO event_ratings(event_id,owner,rating,updated) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(event_id) DO UPDATE SET rating=excluded.rating,updated=excluded.updated`).bind(id,u,rating,t,id,u,token));}
 queries.push(d.prepare(`INSERT INTO audit(id,owner,event_id,action,payload,created) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,id,body.action,JSON.stringify({actorEmail:a.email,previous:previous.results,previousStatus:event.status,rows}),t,id,u,token));
 const result=await guardedBatch(d,queries,[writableGroupGuard(u,event.group_id,a),accountWriteGuard(a)]);if(!result[0].meta.changes)throw new Error('活动已被更新，请重新打开后操作');return json({version:v,status});
}catch(e){return failure(e);}}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{
 if(!FEATURES.editableExportPreview&&!FEATURES.studentGradeManagement)throw new Error('成绩修改功能已关闭');
 const {id}=await params,a=await access(req);requireEditor(a);const body=await readBody(req),group=await assertEventScope(a,id,true),u=a.owner,event=await getEvent(id,u),d=db();
 if(a.role==='recorder'&&FEATURES.confirmedGradeLock&&event.status==='committed')throw new Error('无权限：已确认成绩只能由院负责人或管理员修改');
 if(a.role==='recorder')await assertStudentScope(a,group.year_id,String(body.sid),true);
 if(!Number.isInteger(body.version)||body.version!==event.version)throw new Error('活动已被更新，请刷新总表后再修改');
 if((body.action==='clear'||body.state!==undefined)&&!FEATURES.studentGradeManagement)throw new Error('个人成绩管理已关闭');
 const clearing=body.action==='clear',state=clearing?'unrecorded':body.state??'scored';
 const row=validateScores([{sid:body.sid,state,score:state==='scored'?body.score:null,note:clearing?'个人成绩清除':'个人成绩或导出预览中修改'}],
  (await d.prepare('SELECT sid FROM roster_students WHERE owner=? AND group_id=? AND active=1').bind(u,event.group_id).all<{sid:string}>()).results.map(s=>s.sid))[0];
 const previous=await d.prepare('SELECT sid,score,state,note FROM scores WHERE event_id=? AND sid=?').bind(id,row.sid).first();
 const token=crypto.randomUUID(),t=now(),guard='EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND token=?)';
 const result=await guardedBatch(d,[
  d.prepare('UPDATE events SET version=version+1,token=?,updated=? WHERE id=? AND owner=? AND version=?').bind(token,t,id,u,body.version),
  clearing?d.prepare(`DELETE FROM scores WHERE event_id=? AND sid=? AND ${guard}`).bind(id,row.sid,id,u,token):d.prepare(`INSERT INTO scores(event_id,sid,score,state,note) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(event_id,sid) DO UPDATE SET score=excluded.score,state=excluded.state,note=excluded.note`).bind(id,row.sid,row.score,row.state,row.note,id,u,token),
  d.prepare(`INSERT INTO audit(id,owner,event_id,action,payload,created) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,id,clearing?'clear_score':'adjust',JSON.stringify({actorEmail:a.email,previous,row,previousStatus:event.status}),t,id,u,token)
 ],[writableGroupGuard(u,event.group_id,a),accountWriteGuard(a)]);
 if(!result[0].meta.changes||(!clearing&&!result[1].meta.changes))throw new Error('活动已被更新，请刷新总表后再修改');
 return json({version:event.version+1,status:event.status,sid:row.sid,score:row.score,state:row.state,cleared:clearing});
}catch(e){return failure(e);}}

export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const a=await access(req);requireEditor(a);const body=await readBody(req);const {id}=await params,u=a.owner;await assertEventScope(a,id,true);const event=await getEvent(id,u),d=db();
 if(!canDeleteActivity(a.role,event.status,false,FEATURES.recorderDraftDeletion))throw new Error('无权限：年级负责人只能删除负责范围内的未确认草稿');
 if(event.status==='draft'&&!FEATURES.draftDeletion)throw new Error('删除草稿功能已关闭');
 if(event.status==='committed'&&!FEATURES.activityDeletion)throw new Error('删除已登记活动功能已关闭');
 if(!['draft','committed'].includes(event.status))throw new Error('该活动状态不能删除');
 if(FEATURES.activityRating)await ensureActivityRatings();
 if(!Number.isInteger(body.version)||body.version!==event.version)throw new Error('活动已被更新，请重新打开后再删除');
 const [photoRows,intakeRows,linkRows]=await d.batch([
  d.prepare('SELECT id FROM photos WHERE event_id=? AND owner=?').bind(id,u),
  d.prepare('SELECT id FROM intake WHERE event_id=? AND owner=?').bind(id,u),
  d.prepare('SELECT intake_id AS id FROM intake_event_links WHERE event_id=? AND owner=?').bind(id,u)
 ]),intakeIds=[...new Set([...intakeRows.results,...linkRows.results].map(r=>String((r as {id:string}).id)))],photoIds=[...new Set([...photoRows.results,...intakeRows.results,...linkRows.results].map(r=>String((r as {id:string}).id)))];
 const token=crypto.randomUUID(),guard='EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND token=?)';
 const result=await guardedBatch(d,[
  // Reserve number 0 while later activities move down without hitting the unique group/number index.
  d.prepare('UPDATE events SET token=?,version=version+1,number=0 WHERE id=? AND owner=? AND version=? AND status=?').bind(token,id,u,body.version,event.status),
  d.prepare(`DELETE FROM scores WHERE event_id=? AND ${guard}`).bind(id,id,u,token),
  d.prepare(`DELETE FROM photos WHERE event_id=? AND ${guard}`).bind(id,id,u,token),
  d.prepare(`DELETE FROM intake_event_links WHERE event_id=? AND owner=? AND ${guard}`).bind(id,u,id,u,token),
  d.prepare(`UPDATE intake SET matched=COALESCE((SELECT SUM(l.matched) FROM intake_event_links l WHERE l.intake_id=intake.id AND l.owner=?),0),event_id=(SELECT l.event_id FROM intake_event_links l WHERE l.intake_id=intake.id AND l.owner=? ORDER BY l.event_id LIMIT 1),group_id=(SELECT e.group_id FROM intake_event_links l JOIN events e ON e.id=l.event_id WHERE l.intake_id=intake.id AND l.owner=? ORDER BY l.event_id LIMIT 1),status='assigned',error='部分活动已删除，剩余小组成绩请核对' WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM intake_event_links l WHERE l.intake_id=intake.id AND l.owner=?) AND ${guard}`).bind(u,u,u,u,JSON.stringify(intakeIds),u,id,u,token),
  d.prepare(`DELETE FROM roster_intakes WHERE owner=? AND intake_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM intake_event_links l WHERE l.intake_id=roster_intakes.intake_id AND l.owner=?) AND ${guard}`).bind(u,JSON.stringify(intakeIds),u,id,u,token),
  d.prepare(`DELETE FROM intake WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM intake_event_links l WHERE l.intake_id=intake.id AND l.owner=?) AND ${guard}`).bind(u,JSON.stringify(intakeIds),u,id,u,token),
  d.prepare(`DELETE FROM audit WHERE event_id=? AND owner=? AND ${guard}`).bind(id,u,id,u,token),
  ...(FEATURES.activityRating?[d.prepare(`DELETE FROM event_ratings WHERE event_id=? AND owner=? AND ${guard}`).bind(id,u,id,u,token)]:[]),
  d.prepare(`UPDATE events SET number=-number,version=version+1 WHERE owner=? AND group_id=? AND number>? AND ${guard}`).bind(u,event.group_id,event.number,id,u,token),
  d.prepare(`UPDATE events SET number=-number-1 WHERE owner=? AND group_id=? AND number<0 AND ${guard}`).bind(u,event.group_id,id,u,token),
  d.prepare('DELETE FROM events WHERE id=? AND owner=? AND token=?').bind(id,u,token)
 ],[writableGroupGuard(u,event.group_id,a),accountWriteGuard(a)]);
 if(!result[0].meta.changes||!result[result.length-1].meta.changes)throw new Error('活动已被更新，请刷新后重试');
 const stillStored=photoIds.length?await d.prepare('SELECT id FROM intake WHERE owner=? AND id IN (SELECT value FROM json_each(?)) UNION SELECT id FROM photos WHERE owner=? AND id IN (SELECT value FROM json_each(?))').bind(u,JSON.stringify(photoIds),u,JSON.stringify(photoIds)).all<{id:string}>():{results:[]};
 const retained=new Set(stillStored.results.map(row=>row.id));
 if(photoIds.length)await d.prepare('DELETE FROM photo_actors WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM photos p WHERE p.id=photo_actors.id AND p.owner=photo_actors.owner) AND NOT EXISTS(SELECT 1 FROM intake i WHERE i.id=photo_actors.id AND i.owner=photo_actors.owner)').bind(u,JSON.stringify(photoIds)).run();
 const cleanup=await Promise.allSettled(photoIds.filter(photoId=>!retained.has(photoId)).map(photoId=>bucket().delete(`${u}/${photoId}`)));
 return json({deleted:true,id,renumbered:true,photoCleanupFailed:cleanup.filter(item=>item.status==='rejected').length});
}catch(e){return failure(e);}}
