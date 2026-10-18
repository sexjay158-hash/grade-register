import {requireIntakeSemester} from '@/lib/semester-access';
import {db,access,requireEditor,json,failure,readBody} from '@/lib/server';
import {detectGroup} from '@/lib/group-detection';
import {recognizeStoredPhoto} from '@/lib/ocr-service';
import {attachIntake} from '@/lib/attach-intake';
import {attachMixedIntake} from '@/lib/attach-mixed-intake';
import {FEATURES} from '@/lib/flags';
import {validatedOcrLines} from '@/lib/ocr-lines';
import {yearForIntake} from '@/lib/yearly-rosters';
import {ensureColleges} from '@/lib/colleges';
import {applyPhotoRating} from '@/lib/photo-rating';
import {assertPhotoScope,cohortExpr,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';
async function rateSafely(user:string,id:string,eventIds:string[],text:unknown){try{return await applyPhotoRating(user,id,eventIds,text);}catch(e){console.error('photo rating failed',e);return {rating:null,applied:0,conflicts:0,ratingError:true};}}
export async function POST(req:Request){try{
 const a=await access(req);requireEditor(a);const u=a.owner;if(!FEATURES.autoGroupRecognition||!FEATURES.photoRecognition)throw new Error('自动识别已关闭');
 const {id,apiKey,secretKey,retryStored,recognizedLines,recognizedRatingText}=await readBody(req);await assertPhotoScope(req,'intake',String(id));await requireIntakeSemester(a,String(id),true);const d=db(),p=await d.prepare('SELECT * FROM intake WHERE id=? AND owner=?').bind(id,u).first<any>();
 if(!p)throw new Error('照片不存在');if(p.status==='assigned'){const links=await d.prepare('SELECT event_id FROM intake_event_links WHERE intake_id=? AND owner=?').bind(id,u).all<{event_id:string}>(),eventIds=links.results.map(link=>link.event_id);if(!eventIds.length&&p.event_id)eventIds.push(p.event_id);const rating=(a.role!=='recorder'||FEATURES.recorderActivityRating)&&recognizedRatingText?await rateSafely(u,id,eventIds,recognizedRatingText):null;return json({status:'assigned',eventId:p.event_id,matched:p.matched,unresolved:p.unresolved,...rating});}
 let lines:string[],ratingText:unknown=recognizedRatingText;
 const saved=retryStored?JSON.parse(p.lines||'[]'):[];
 if(Array.isArray(saved)&&saved.length&&saved.every(line=>typeof line==='string'))lines=validatedOcrLines(saved);
 else if(FEATURES.localRapidOcr&&recognizedLines!==undefined)lines=validatedOcrLines(recognizedLines);
 else{
  if(FEATURES.adminRecognitionSettings&&a.role!=='admin')throw new Error('无权限：识别服务设置仅管理员可操作');
  if(typeof apiKey!=='string'||typeof secretKey!=='string'||!apiKey||!secretKey)throw new Error('请先在识别设置中连接服务；照片已保存，可稍后识别');
  try{const recognized=await recognizeStoredPhoto(u,id,apiKey,secretKey);lines=recognized.lines;ratingText=recognized.ratingText;}
  catch(e){await d.prepare("UPDATE intake SET status='needs_review',error=? WHERE id=? AND owner=?").bind((e as Error).message.slice(0,300),id,u).run();throw e;}
 }
 await d.prepare("UPDATE intake SET lines=?,status='needs_review',error='' WHERE id=? AND owner=? AND status<>'assigned'").bind(JSON.stringify(lines),id,u).run();
 if(FEATURES.mixedGroupPhoto){
  const attached=await attachMixedIntake(u,id,a);
  const rating=attached.blocked||(a.role==='recorder'&&!FEATURES.recorderActivityRating)?null:await rateSafely(u,id,attached.eventIds??[],ratingText);
  return json({status:attached.blocked?'needs_review':'assigned',...attached,...rating,lines});
 }
 const yearId=await yearForIntake(u,id);
 await ensureColleges(u);
 const [g,s]=await d.batch([d.prepare('SELECT g.id,g.name,g.college FROM roster_groups g JOIN colleges c ON c.owner=g.owner AND c.name=g.college AND c.active=1 WHERE g.owner=? AND g.year_id=?').bind(u,yearId),d.prepare(`SELECT s.sid,s.name,s.group_id,s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} JOIN colleges c ON c.owner=s.owner AND c.name=s.college AND c.active=1 WHERE s.owner=? AND s.year_id=? AND s.active=1`).bind(u,yearId)]);
 const allowedStudents=a.role==='admin'?s.results:s.results.filter((student:any)=>student.college===a.college&&(a.role!=='recorder'||student.cohort===a.cohort));
 const allowedGroups=a.role==='admin'?g.results:g.results.filter((group:any)=>group.college===a.college&&allowedStudents.some((student:any)=>student.group_id===group.id));
 const result=detectGroup(lines,allowedGroups as any,allowedStudents as any,FEATURES.directScoreEntry);
 await d.prepare("UPDATE intake SET error=? WHERE id=? AND owner=? AND status<>'assigned'").bind(result.reason,id,u).run();
 if(!result.groupId)return json({status:'needs_review',reason:result.reason,candidates:result.candidates,lines});
 const attached=await attachIntake(u,id,result.groupId,a);
 const rating=attached.blocked||(a.role==='recorder'&&!FEATURES.recorderActivityRating)?null:await rateSafely(u,id,attached.eventId?[attached.eventId]:[],ratingText);
 return json({status:attached.blocked?'needs_review':'assigned',...attached,...rating,lines,candidates:result.candidates});
}catch(e){return failure(e);}}
