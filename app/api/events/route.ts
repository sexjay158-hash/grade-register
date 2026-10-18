import {db,owner,access,requireEditor,json,failure,now} from '@/lib/server';
import {readBody} from '@/lib/server';
import {ensureColleges} from '@/lib/colleges';
import {assertGroupScope} from '@/lib/role-scope';
import {FEATURES} from '@/lib/flags';
export async function POST(req:Request){try{
 const a=await access(req);requireEditor(a);const u=a.owner,d=db(),{groupId,date}=await readBody(req);await assertGroupScope(a,String(groupId),true);
 await ensureColleges(u);
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))throw new Error('请选择活动日期');
 if(!await d.prepare('SELECT g.id FROM roster_groups g JOIN colleges c ON c.owner=g.owner AND c.name=g.college AND c.active=1 WHERE g.id=? AND g.owner=?').bind(groupId,u).first())throw new Error('请选择在用学院的小组');
 const draft=await d.prepare("SELECT id,date FROM events WHERE owner=? AND group_id=? AND status='draft'").bind(u,groupId).first<{id:string;date:string}>();if(draft){if(FEATURES.photoActivityDateGuard&&draft.date!==date)throw new Error('该组还有其他日期的未确认草稿，请先完成现有活动');return json({id:draft.id});}
 const id=crypto.randomUUID(),t=now();
 await d.prepare("INSERT INTO events(id,owner,group_id,number,date,status,created,updated) SELECT ?,?,?,COALESCE(MAX(number),0)+1,?,'draft',?,? FROM events WHERE owner=? AND group_id=?").bind(id,u,groupId,date,t,t,u,groupId).run();
 return json({id});
}catch(e){return failure(e);}}
