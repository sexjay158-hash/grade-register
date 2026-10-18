import {requireAccessibleYear} from '@/lib/semester-access';
import {deleteArchivedCollege} from '@/lib/delete-college';
import {db,owner,access,requireAdmin,json,failure,readBody,now} from '@/lib/server';
import {requireYear,cleanRosterText} from '@/lib/yearly-rosters';
import {ensureColleges,listCollegesForAccess} from '@/lib/colleges';
import {FEATURES} from '@/lib/flags';

export async function GET(req:Request){try{const a=await access(req),yearId=await requireAccessibleYear(a,new URL(req.url).searchParams.get('yearId'));return json(await listCollegesForAccess(a,yearId));}catch(e){return failure(e);}}

export async function POST(req:Request){try{requireAdmin(await access(req));
 const u=await owner(req),input=await readBody(req),name=cleanRosterText(input.name,'学院名称');await ensureColleges(u);
 if(await db().prepare('SELECT id FROM colleges WHERE owner=? AND name=?').bind(u,name).first())throw new Error('该学院已存在；如已归档，请使用恢复');
 const id=crypto.randomUUID(),t=now();await db().prepare('INSERT INTO colleges(id,owner,name,active,created,updated) VALUES(?,?,?,1,?,?)').bind(id,u,name,t,t).run();return json({id,name,active:1});
}catch(e){return failure(e);}}

export async function PATCH(req:Request){try{requireAdmin(await access(req));
 const u=await owner(req),input=await readBody(req);await ensureColleges(u);const d=db(),old=await d.prepare('SELECT id,name,active FROM colleges WHERE id=? AND owner=?').bind(input.id,u).first<{id:string;name:string;active:number}>();if(!old)throw new Error('学院不存在');
 if(input.action==='restore'){await d.prepare('UPDATE colleges SET active=1,updated=? WHERE id=? AND owner=?').bind(now(),old.id,u).run();return json({id:old.id,name:old.name,active:1});}
 const name=cleanRosterText(input.name,'学院名称');if(name===old.name)return json({id:old.id,name,active:old.active});
 if(await d.prepare('SELECT id FROM colleges WHERE owner=? AND name=?').bind(u,name).first())throw new Error('该学院名称已存在');
 const t=now();await d.batch([
  d.prepare('UPDATE colleges SET name=?,updated=? WHERE id=? AND owner=?').bind(name,t,old.id,u),
  d.prepare('UPDATE roster_groups SET college=? WHERE owner=? AND college=?').bind(name,u,old.name),
  d.prepare('UPDATE roster_students SET college=? WHERE owner=? AND college=?').bind(name,u,old.name),
  d.prepare('UPDATE site_members SET college=?,updated=? WHERE college=?').bind(name,t,old.name),
  ...(FEATURES.localAccounts?[d.prepare("UPDATE local_accounts SET college=?,updated=? WHERE role<>'admin' AND college=?").bind(name,t,old.name)]:[])
 ]);return json({id:old.id,name,active:old.active,oldName:old.name});
}catch(e){return failure(e);}}

export async function DELETE(req:Request){try{requireAdmin(await access(req));
 const u=await owner(req),input=await readBody(req);await ensureColleges(u);
 if(input.action==='delete')return json(await deleteArchivedCollege(u,String(input.id??''),input.confirmName));
 const r=await db().prepare('UPDATE colleges SET active=0,updated=? WHERE id=? AND owner=? AND active=1').bind(now(),input.id,u).run();if(!r.meta.changes)throw new Error('学院不存在或已归档');return json({ok:true,historyPreserved:true});
}catch(e){return failure(e);}}
