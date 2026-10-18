import {requireIntakeSemester} from '@/lib/semester-access';
import {db,access,requireEditor,json,failure,readBody} from '@/lib/server';
import {attachIntake} from '@/lib/attach-intake';
import {assertPhotoScope,assertGroupScope} from '@/lib/role-scope';
export async function POST(req:Request){try{
 const a=await access(req);requireEditor(a);const u=a.owner,{id,groupId}=await readBody(req);await assertPhotoScope(req,'intake',String(id));await requireIntakeSemester(a,String(id),true);await assertGroupScope(a,String(groupId),true);const p=await db().prepare('SELECT id,status FROM intake WHERE id=? AND owner=?').bind(id,u).first<any>();
 if(!p)throw new Error('照片不存在');if(p.status==='assigned')throw new Error('照片已经分组');
 if(typeof groupId!=='string')throw new Error('请选择正确的小组');
 return json(await attachIntake(u,id,groupId,a));
}catch(e){return failure(e);}}
