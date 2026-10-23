import {db,now,type Access} from './server';
import {guardedBatch,writableYearGuard,writableGroupGuard,accountWriteGuard} from './guarded-batch';

// Removing evidence never removes scores or ratings. Every linked activity must
// still be a writable draft, including links not visible in the current filter.
export async function deleteRecognizedPhoto(a:Access,id:string,yearId:string){
 const d=db();
 const eventSql=`SELECT event_id FROM intake_event_links WHERE owner=? AND intake_id=? UNION SELECT event_id FROM intake WHERE owner=? AND id=? AND event_id IS NOT NULL UNION SELECT event_id FROM photos WHERE owner=? AND id=?`;
 const args=[a.owner,id,a.owner,id,a.owner,id];
 const linked=await d.prepare(`SELECT id,group_id,status,version FROM events WHERE owner=? AND id IN (${eventSql})`).bind(a.owner,...args).all<{id:string;group_id:string;status:string;version:number}>();
 if(!linked.results.length||linked.results.some(e=>e.status!=='draft'))throw new Error('照片关联的活动已确认或不存在，不能删除；请先核对活动状态');
 const ids=linked.results.map(e=>e.id),t=now();
 const result=await guardedBatch(d,[
  ...linked.results.flatMap(event=>[
   d.prepare('INSERT INTO audit(id,owner,event_id,action,payload,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),a.owner,event.id,'delete_photo',JSON.stringify({actorEmail:a.email,photoId:id,scoresPreserved:true}),t),
   d.prepare('UPDATE events SET version=version+1,updated=? WHERE id=? AND owner=?').bind(t,event.id,a.owner)
  ]),
  d.prepare('DELETE FROM photos WHERE id=? AND owner=?').bind(id,a.owner),
  d.prepare('DELETE FROM intake_event_links WHERE intake_id=? AND owner=?').bind(id,a.owner),
  d.prepare('DELETE FROM intake WHERE id=? AND owner=?').bind(id,a.owner),
  d.prepare('DELETE FROM roster_intakes WHERE intake_id=? AND owner=?').bind(id,a.owner),
  d.prepare("DELETE FROM photo_actors WHERE id=? AND owner=? AND kind IN ('intake','photo')").bind(id,a.owner),
  d.prepare('DELETE FROM intake_upload_scopes WHERE intake_id=? AND owner=?').bind(id,a.owner)
 ],[
  writableYearGuard(a.owner,yearId),accountWriteGuard(a),
  {sql:"EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=? AND status='assigned')",values:[id,a.owner]},
  // Detect concurrent recognition/relinking as well as confirmation and edits.
  {sql:`NOT EXISTS(SELECT 1 FROM (${eventSql}) WHERE event_id NOT IN (SELECT value FROM json_each(?)))`,values:[...args,JSON.stringify(ids)]},
  ...linked.results.flatMap(event=>[writableGroupGuard(a.owner,event.group_id,a),{sql:"EXISTS(SELECT 1 FROM events WHERE id=? AND owner=? AND status='draft' AND version=?)",values:[event.id,a.owner,event.version]}])
 ],'照片、活动或权限已变化，本次未删除，请刷新后重试');
 return result;
}
