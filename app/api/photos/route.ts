import {cleanupRejectedPhoto} from '@/lib/photo-write-cleanup';
import {guardedBatch,writableGroupGuard,accountWriteGuard} from '@/lib/guarded-batch';
import {db,bucket,access,requireEditor,json,failure,getEvent,now} from '@/lib/server';
import {assertEventScope} from '@/lib/role-scope';
export async function POST(req:Request){try{
 const a=await access(req);requireEditor(a);const u=a.owner,form=await req.formData(),eventId=String(form.get('eventId')??''),f=form.get('file');await assertEventScope(a,eventId,true);const e=await getEvent(eventId,u);
 if(e.status!=='draft')throw new Error('请先撤回登记，再补传照片');
 if(!(f instanceof File)||!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8*1024*1024||!f.size)throw new Error('支持 JPG、PNG、WebP，每张不超过 8 MB');
 const count=await db().prepare('SELECT COUNT(*) AS n FROM photos WHERE event_id=?').bind(eventId).first<{n:number}>();if((count?.n??0)>=30)throw new Error('每次活动最多保存 30 张照片');
 const bytes=await f.arrayBuffer(),sig=new Uint8Array(bytes);
 const valid=f.type==='image/jpeg'?sig[0]===255&&sig[1]===216:f.type==='image/png'?sig[0]===137&&sig[1]===80&&sig[2]===78:new TextDecoder().decode(sig.slice(0,4))==='RIFF'&&new TextDecoder().decode(sig.slice(8,12))==='WEBP';
 if(!valid)throw new Error('照片内容与文件类型不符');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const duplicate=await db().prepare('SELECT p.id,e.number,g.name FROM photos p JOIN events e ON e.id=p.event_id JOIN roster_groups g ON g.id=e.group_id WHERE p.owner=? AND p.hash=?').bind(u,hash).first<any>();
 if(duplicate)throw new Error(a.role==='admin'?`这张照片已存在于 ${duplicate.name} 第 ${duplicate.number} 次活动，请勿重复上传`:'这张照片已上传过，请勿重复上传');
 const id=crypto.randomUUID(),key=`${u}/${id}`;await bucket().put(key,bytes,{httpMetadata:{contentType:f.type}});
 let rejected=false;
 try{const d=db(),result=await guardedBatch(d,[db().prepare("INSERT INTO photos(id,owner,event_id,hash,name,mime,size,created) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND owner=? AND status='draft') AND (SELECT COUNT(*) FROM photos WHERE event_id=?)<30").bind(id,u,eventId,hash,f.name.slice(0,200),f.type,f.size,now(),eventId,u,eventId),db().prepare('INSERT INTO photo_actors(kind,id,owner,account_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM photos WHERE id=? AND owner=?)').bind('photo',id,u,a.userId,id,u)],[writableGroupGuard(u,e.group_id,a),accountWriteGuard(a),{sql:"EXISTS(SELECT 1 FROM events WHERE id=? AND owner=? AND status='draft') AND (SELECT COUNT(*) FROM photos WHERE event_id=?)<30",values:[eventId,u,eventId]}],'活动已变化或照片已达 30 张，请刷新核对');if(!result[0].meta.changes){rejected=true;throw new Error('活动已登记，请重新打开后操作');}}catch(err){if(!await cleanupRejectedPhoto(err,()=>bucket().delete(key),rejected))console.error('Photo retained after uncertain write or cleanup failure',id);throw err;}
 return json({id});
}catch(e){return failure(e);}}
