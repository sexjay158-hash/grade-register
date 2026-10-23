import {db,json,failure} from '@/lib/server';
import {readJsonBody,HttpError} from '@/lib/http';
import {FEATURES} from '@/lib/flags';
import {ensureGroupAccounts,hashActivation} from '@/lib/group-account-store';
import {assertSameOrigin,validatePassword,passwordRecord,newSession,checkLoginLimit,recordLoginFailure,clearLoginFailures} from '@/lib/local-auth';
import {guardedBatch} from '@/lib/guarded-batch';
import {acquireInstanceLoginSlot,acquireLoginSlot} from '@/lib/login-admission';

export async function POST(req:Request){let release:(()=>Promise<void>)|null=null,releaseInstance:(()=>void)|null=null;try{
 if(!FEATURES.bulkGroupAccounts)throw new Error('小组账号激活暂未开放');
 try{assertSameOrigin(req);}catch{throw new HttpError(403,'INVALID_ORIGIN','请求来源不正确');}const input=await readJsonBody(req,10000),username=String(input.username??'').trim(),code=String(input.code??'').trim();
 if(!/^\d{6,24}$/.test(username)||!/^[a-f0-9]{48}$/.test(code))throw new HttpError(400,'BAD_ACTIVATION','账号或激活码不正确');
 releaseInstance=acquireInstanceLoginSlot();if(!releaseInstance)throw new HttpError(503,'LOGIN_BUSY','当前激活人数较多，请稍后重试');
 await ensureGroupAccounts();const limit=await checkLoginLimit(req,'activate:'+username);if(!limit.allowed)throw new HttpError(429,'TOO_MANY_ATTEMPTS','尝试次数过多，请 15 分钟后再试');
 const tokenHash=await hashActivation(code),t=new Date().toISOString();
 const row=await db().prepare("SELECT a.id,a.active,v.expires,v.used_at,g.group_id FROM local_accounts a JOIN group_account_assignments g ON g.account_id=a.id JOIN group_account_activations v ON v.account_id=a.id JOIN roster_groups r ON r.id=g.group_id AND r.owner=g.owner JOIN colleges c ON c.owner=g.owner AND c.name=r.college AND c.active=1 WHERE a.username=? AND a.role='group_recorder' AND v.token_hash=? AND NOT EXISTS(SELECT 1 FROM semester_archives s WHERE s.owner=g.owner AND s.year_id=g.year_id)").bind(username,tokenHash).first<{id:string;active:number;expires:string;used_at:string|null;group_id:string}>();
 if(!row||row.active||row.used_at||row.expires<=t){await recordLoginFailure(limit.key);throw new HttpError(400,'BAD_ACTIVATION','账号或激活码不正确、已过期或已使用，请联系院负责人');}
 const password=validatePassword(input.password,username);release=await acquireLoginSlot();if(!release)throw new HttpError(503,'LOGIN_BUSY','当前激活人数较多，请稍后重试');
 const record=await passwordRecord(password);
 await guardedBatch(db(),[
  db().prepare('UPDATE group_account_activations SET used_at=? WHERE account_id=?').bind(t,row.id),
  db().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,active=1,updated=? WHERE id=?').bind(record.password_hash,record.salt,record.iterations,t,row.id),
  db().prepare('DELETE FROM local_sessions WHERE account_id=?').bind(row.id),
  db().prepare('INSERT INTO account_audit(id,owner,actor,action,account_id,created,detail) SELECT ?,g.owner,?, ?,?, ?,? FROM group_account_assignments g WHERE g.account_id=?').bind(crypto.randomUUID(),username,'activate-group-account',row.id,t,'{}',row.id)
 ],[{sql:"EXISTS(SELECT 1 FROM group_account_activations v JOIN local_accounts a ON a.id=v.account_id JOIN group_account_assignments g ON g.account_id=a.id JOIN roster_groups r ON r.id=g.group_id AND r.year_id=g.year_id AND r.owner=g.owner JOIN colleges c ON c.owner=r.owner AND c.name=r.college AND c.active=1 WHERE v.account_id=? AND v.token_hash=? AND v.expires>? AND v.used_at IS NULL AND a.active=0 AND NOT EXISTS(SELECT 1 FROM semester_archives s WHERE s.owner=g.owner AND s.year_id=g.year_id))",values:[row.id,tokenHash,t]}],'激活码已被使用或账号状态变化，请重新登录');
 await clearLoginFailures(limit.key);
 return json({ok:true},200,{'Set-Cookie':await newSession(row.id,req,{username,password_hash:record.password_hash})});
}catch(e){return failure(e);}finally{try{await release?.();}finally{releaseInstance?.();}}}
