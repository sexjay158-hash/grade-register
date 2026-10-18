import {db,now} from '@/lib/server';
import {ensureActivityRatings} from '@/lib/activity-rating-store';
import {ratingFromPhotoText,type ActivityRating} from '@/lib/activity-rating';
import {FEATURES} from '@/lib/flags';

// Each linked group activity gets the photo's grade. A different existing grade
// is left untouched so later photos cannot silently change earlier results.
export async function applyPhotoRating(owner:string,intakeId:string,eventIds:string[],ratingText:unknown){
 if(!FEATURES.photoRatingRecognition)return {rating:null,applied:0,conflicts:0};
 const rating=ratingFromPhotoText(ratingText),d=db();
 if(!rating){await warn(owner,intakeId,'右上角等次未能明确识别，请在活动详情中核对选择');return {rating:null,applied:0,conflicts:0};}
 await ensureActivityRatings();
 let applied=0,conflicts=0;
 for(const eventId of new Set(eventIds)){
  const existing=await d.prepare('SELECT rating FROM event_ratings WHERE event_id=? AND owner=?').bind(eventId,owner).first<{rating:ActivityRating}>();
  if(existing){if(existing.rating!==rating)conflicts++;continue;}
  const token=crypto.randomUUID(),time=now(),guard='EXISTS(SELECT 1 FROM events WHERE id=? AND owner=? AND status=\'draft\' AND token=?)';
  const result=await d.batch([
   d.prepare('UPDATE events SET version=version+1,token=?,updated=? WHERE id=? AND owner=? AND status=\'draft\' AND NOT EXISTS(SELECT 1 FROM event_ratings WHERE event_id=? AND owner=?)').bind(token,time,eventId,owner,eventId,owner),
   d.prepare(`INSERT INTO event_ratings(event_id,owner,rating,updated) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(event_id) DO NOTHING`).bind(eventId,owner,rating,time,eventId,owner,token)
  ]);
  if(result[0].meta.changes&&result[1].meta.changes)applied++;
  else {const current=await d.prepare('SELECT rating FROM event_ratings WHERE event_id=? AND owner=?').bind(eventId,owner).first<{rating:ActivityRating}>();if(current?.rating&&current.rating!==rating)conflicts++;}
 }
 if(conflicts)await warn(owner,intakeId,`${conflicts} 个小组的照片等次与现有活动不一致，请人工核对`);
 return {rating,applied,conflicts};
}

async function warn(owner:string,intakeId:string,message:string){
 await db().prepare("UPDATE intake SET error=substr(CASE WHEN error='' THEN ? ELSE error||'；'||? END,1,300) WHERE id=? AND owner=?").bind(message,message,intakeId,owner).run();
}
