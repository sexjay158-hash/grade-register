import {db,bucket,owner,failure} from '@/lib/server';
import {assertPhotoScope} from '@/lib/role-scope';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const u=await owner(req),{id}=await params,d=db(),p=await d.prepare('SELECT mime FROM photos WHERE id=? AND owner=? UNION SELECT mime FROM intake WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM intake_event_links WHERE intake_id=? AND owner=?)').bind(id,u,id,u,id,u).first<{mime:string}>();if(!p)throw new Error('照片不存在');await assertPhotoScope(req,(await d.prepare('SELECT id FROM photos WHERE id=? AND owner=?').bind(id,u).first())?'photo':'intake',id);const file=await bucket().get(`${u}/${id}`);if(!file)throw new Error('照片暂不可用');
 return new Response(file.body,{headers:{'Content-Type':p.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
