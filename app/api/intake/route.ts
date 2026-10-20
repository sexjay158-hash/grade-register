import {cleanupRejectedPhoto} from '@/lib/photo-write-cleanup';
import {guardedBatch,writableYearGuard,accountWriteGuard} from '@/lib/guarded-batch';
import {isActivityDate} from '@/lib/activity-date';
import {requireAccessibleYear,requireIntakeSemester} from '@/lib/semester-access';
import {db,bucket,access,requireEditor,json,failure,now,readBody} from '@/lib/server';
import {assertPhotoScope} from '@/lib/role-scope';
import {FEATURES} from '@/lib/flags';
import {requireYear} from '@/lib/yearly-rosters';
export async function POST(req:Request){try{
 const a=await access(req);requireEditor(a);const u=a.owner,form=await req.formData(),yearId=await requireAccessibleYear(a,form.get('yearId'),true),f=form.get('file'),batchId=String(form.get('batchId')??''),date=String(form.get('date')??'');
 if(!/^[0-9a-f-]{36}$/i.test(batchId)||!isActivityDate(date))throw new Error('上传批次或活动日期无效');
 if(!(f instanceof File)||!['image/jpeg','image/png','image/webp'].includes(f.type)||!f.size||f.size>8*1024*1024)throw new Error('照片须为 JPG、PNG 或 WebP，每张不超过 8 MB');
 const d=db(),count=await d.prepare('SELECT COUNT(*) AS n FROM intake WHERE owner=? AND batch_id=?').bind(u,batchId).first<{n:number}>();if((count?.n??0)>=30)throw new Error('同一批次最多上传 30 张照片');
 const bytes=await f.arrayBuffer(),sig=new Uint8Array(bytes);
 const valid=f.type==='image/jpeg'?sig[0]===255&&sig[1]===216:f.type==='image/png'?sig[0]===137&&sig[1]===80&&sig[2]===78:new TextDecoder().decode(sig.slice(0,4))==='RIFF'&&new TextDecoder().decode(sig.slice(8,12))==='WEBP';
 if(!valid)throw new Error('照片内容与文件类型不符');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const existing=await d.prepare('SELECT id FROM intake WHERE owner=? AND hash=?').bind(u,hash).first();
 const legacy=await d.prepare('SELECT id FROM photos WHERE owner=? AND hash=?').bind(u,hash).first();
 if(existing||legacy)throw new Error('这张照片已经上传过，请在预览中查看');
 const id=crypto.randomUUID();await bucket().put(`${u}/${id}`,bytes,{httpMetadata:{contentType:f.type}});
 let rejected=false;
 try{
  const result=await guardedBatch(d,[
   // Recheck capacity inside the insert: simultaneous uploads cannot all pass a prior COUNT.
   d.prepare("INSERT INTO intake(id,owner,batch_id,hash,name,mime,size,date,status,created) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM intake WHERE owner=? AND batch_id=?)<30").bind(id,u,batchId,hash,f.name.slice(0,200),f.type,f.size,date,'pending',now(),u,batchId),
   d.prepare('INSERT INTO roster_intakes(intake_id,owner,year_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=?)').bind(id,u,yearId,id,u),
   d.prepare('INSERT INTO photo_actors(kind,id,owner,account_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=?)').bind('intake',id,u,a.userId,id,u)
  ],[writableYearGuard(u,yearId),accountWriteGuard(a)],'学期或账号权限已变化，请刷新后重新上传');
  if(!result[0].meta.changes){rejected=true;throw new Error('同一批次最多上传 30 张照片');}
 }catch(e){if(!await cleanupRejectedPhoto(e,()=>bucket().delete(`${u}/${id}`),rejected))console.error('Photo retained after uncertain write or cleanup failure',id);throw e;}
 return json({id,status:'pending'});
}catch(e){return failure(e);}}

export async function DELETE(req:Request){try{
 const a=await access(req);requireEditor(a);const {id}=await readBody(req);
 if(!FEATURES.unrecognizedPhotoDeletion)throw new Error('未识别照片删除已关闭');
 if(typeof id!=='string'||!id||id.length>100)throw new Error('照片编号无效');
 await assertPhotoScope(req,'intake',id);const yearId=await requireIntakeSemester(a,id,true);
 const d=db(),result=await guardedBatch(d,[
  // Check again in the delete itself: recognition may finish after the user opens the confirmation.
  d.prepare("DELETE FROM intake WHERE id=? AND owner=? AND status IN ('pending','needs_review') AND matched=0 AND group_id IS NULL AND event_id IS NULL AND NOT EXISTS(SELECT 1 FROM intake_event_links l WHERE l.intake_id=intake.id AND l.owner=intake.owner) AND NOT EXISTS(SELECT 1 FROM photos p WHERE p.id=intake.id AND p.owner=intake.owner)").bind(id,a.owner),
  d.prepare('DELETE FROM roster_intakes WHERE intake_id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=?)').bind(id,a.owner,id,a.owner),
  d.prepare("DELETE FROM photo_actors WHERE id=? AND owner=? AND kind='intake' AND NOT EXISTS(SELECT 1 FROM intake WHERE id=? AND owner=?)").bind(id,a.owner,id,a.owner)
 ],[writableYearGuard(a.owner,yearId),accountWriteGuard(a)]);
 if(!result[0].meta.changes)throw new Error('照片已关联活动或已录入成绩，不能按未识别照片删除，请刷新列表');
 let photoCleanupFailed=false;try{await bucket().delete(`${a.owner}/${id}`);}catch{photoCleanupFailed=true;console.error('unrecognized photo storage cleanup failed',id);}
 return json({deleted:true,id,photoCleanupFailed});
}catch(e){return failure(e);}}
