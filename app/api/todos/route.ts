import {access,db,requireEditor,readBody,json,failure,now} from '@/lib/server';
import {requireAccessibleYear} from '@/lib/semester-access';
import {readWorkspaceState} from '@/lib/workspace/read-state';
import {ensureTodoDismissals} from '@/lib/workspace/todo-dismissals';
import {guardedBatch,accountWriteGuard,writableYearGuard} from '@/lib/guarded-batch';
import {FEATURES} from '@/lib/flags';

async function change(req:Request,restore:boolean){try{
 const a=await access(req);requireEditor(a);
 if(!FEATURES.todoDismissal)throw new Error('待办提醒删除已关闭');
 const body=await readBody(req),yearId=await requireAccessibleYear(a,body.yearId,true),d=db();
 await ensureTodoDismissals(d);
 if(restore){
  await guardedBatch(d,[d.prepare('DELETE FROM todo_dismissals WHERE owner=? AND account_id=? AND year_id=?').bind(a.owner,a.userId,yearId)],[accountWriteGuard(a),writableYearGuard(a.owner,yearId)]);
  return json({restored:true});
 }
 if(typeof body.id!=='string'||body.id.length>150||typeof body.revision!=='string'||body.revision.length>20000)throw new Error('待办编号或版本无效');
 const state=await readWorkspaceState(a,yearId,true),todo=state.todos.find(row=>row.id===body.id);
 if(!todo)throw new Error('无权限：待办不存在或不属于当前负责范围');
 if(todo.revision!==body.revision)throw new Error('待办内容已更新，请刷新后重试');
 await guardedBatch(d,[d.prepare('INSERT INTO todo_dismissals(owner,account_id,year_id,todo_id,revision,created) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,account_id,year_id,todo_id) DO UPDATE SET revision=excluded.revision,created=excluded.created').bind(a.owner,a.userId,yearId,todo.id,todo.revision,now())],[accountWriteGuard(a),writableYearGuard(a.owner,yearId)]);
 return json({deleted:true,reminderOnly:true});
}catch(error){return failure(error);}}
export async function DELETE(req:Request){return change(req,false);}
export async function POST(req:Request){return change(req,true);}
