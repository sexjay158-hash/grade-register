import {db,now,type Access} from '@/lib/server';
import {guardedBatch,writableGroupGuard,accountWriteGuard,writableYearGuard} from './guarded-batch';
import {ensureActivityRatings} from '@/lib/activity-rating-store';
import {ratingFromPhotoText,type ActivityRating} from '@/lib/activity-rating';
import {FEATURES} from '@/lib/flags';

// Each linked group activity gets the photo's grade. A different existing grade
// is left untouched so later photos cannot silently change earlier results.
export async function applyPhotoRating(a:Access,intakeId:string,eventIds:string[],ratingText:unknown){
 const owner=a.owner;
 if(!FEATURES.photoRatingRecognition)return {rating:null,applied:0,conflicts:0};
 const rating=ratingFromPhotoText(ratingText),d=db();
 if(!rating){await warn(a,intakeId,'右上角等次未能明确识别，请在活动详情中核对选择');return {rating:null,applied:0,conflicts:0};}
 await ensureActivityRatings();
 let applied=0,conflicts=0;
 for(const eventId of new Set(eventIds)){
  const event=await d.prepare('SELECT group_id FROM events WHERE id=? AND owner=?').bind(eventId,owner).first<{group_id:string}>();
  if(!event)continue;
  const existing=await d.prepare('SELECT rating FROM event_ratings WHERE event_id=? AND owner=?').bind(eventId,owner).first<{rating:ActivityRating}>();
  if(existing){if(existing.rating!==rating)conflicts++;continue;}
  const token=crypto.randomUUID(),time=now(),guard='EXISTS(SELECT 1 FROM events WHERE id=? AND owner=? AND status=\'draft\' AND token=?)';
  const result=await guardedBatch(d,[
   d.prepare('UPDATE events SET version=version+1,token=?,updated=? WHERE id=? AND owner=? AND status=\'draft\' AND NOT EXISTS(SELECT 1 FROM event_ratings WHERE event_id=? AND owner=?)').bind(token,time,eventId,owner,eventId,owner),
   d.prepare(`INSERT INTO event_ratings(event_id,owner,rating,updated) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(event_id) DO NOTHING`).bind(eventId,owner,rating,time,eventId,owner,token)
  ],[writableGroupGuard(owner,event.group_id,a),accountWriteGuard(a),{sql:'EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=?) AND (EXISTS(SELECT 1 FROM intake_event_links WHERE owner=? AND intake_id=? AND event_id=?) OR EXISTS(SELECT 1 FROM intake WHERE owner=? AND id=? AND event_id=?))',values:[intakeId,owner,owner,intakeId,eventId,owner,intakeId,eventId]}]);
  if(result[0].meta.changes&&result[1].meta.changes)applied++;
  else {const current=await d.prepare('SELECT rating FROM event_ratings WHERE event_id=? AND owner=?').bind(eventId,owner).first<{rating:ActivityRating}>();if(current?.rating&&current.rating!==rating)conflicts++;}
 }
 if(conflicts)await warn(a,intakeId,`${conflicts} 个小组的照片等次与现有活动不一致，请人工核对`);
 return {rating,applied,conflicts};
}

async function warn(a:Access,intakeId:string,message:string){
 const d=db(),row=await d.prepare('SELECT year_id FROM roster_intakes WHERE owner=? AND intake_id=?').bind(a.owner,intakeId).first<{year_id:string}>();
 if(!row)return;
 await guardedBatch(d,[d.prepare("UPDATE intake SET error=substr(CASE WHEN error='' THEN ? ELSE error||'；'||? END,1,300) WHERE id=? AND owner=?").bind(message,message,intakeId,a.owner)],[writableYearGuard(a.owner,row.year_id),accountWriteGuard(a)]);
}
