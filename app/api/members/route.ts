import {access,db,json,failure,readBody,requireAdmin,now} from '@/lib/server';
import {FEATURES} from '@/lib/flags';
import {findAccount,normalizeUsername,passwordRecord,revokeAccountSessions,validatePassword} from '@/lib/local-auth';
import {normalizeCohort} from '@/lib/role-scope';
import {requireExistingActiveCollege} from '@/lib/colleges';
import * as legacy from './legacy';

export async function GET(req:Request){
 if(!FEATURES.localAccounts)return legacy.GET(req);
 try{const a=await access(req);requireAdmin(a);const rows=await db().prepare("SELECT username,role,college,cohort,active,created,updated FROM local_accounts WHERE role<>'admin' ORDER BY college,role,username").all();return json(rows.results);}catch(e){return failure(e);}
}
export async function POST(req:Request){
 if(!FEATURES.localAccounts)return legacy.POST(req);
 try{
  const a=await access(req);requireAdmin(a);const input=await readBody(req),username=normalizeUsername(input.username),role=String(input.role??''),college=String(input.college??'').trim();
  if(!['college_lead','recorder'].includes(role))throw new Error('请选择院负责人或年级录入员');
  if(!college)throw new Error('请选择负责的学院');await requireExistingActiveCollege(a.owner,college);
  const cohort=role==='recorder'?normalizeCohort(input.cohort):null,existing=await findAccount(username),t=now();
  if(existing?.role==='admin')throw new Error('不能在这里修改管理员账号');
  const password=String(input.password??'');
  if(!existing||!existing.active){
   const p=await passwordRecord(validatePassword(password,username));
   if(existing){await db().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,role=?,college=?,cohort=?,active=1,updated=? WHERE id=?').bind(p.password_hash,p.salt,p.iterations,role,college,cohort,t,existing.id).run();await revokeAccountSessions(existing.id);}
   else await db().prepare('INSERT INTO local_accounts(id,username,password_hash,salt,iterations,role,college,cohort,active,created,updated) VALUES(?,?,?,?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(),username,p.password_hash,p.salt,p.iterations,role,college,cohort,t,t).run();
  }else{
   if(password){const p=await passwordRecord(validatePassword(password,username));await db().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,role=?,college=?,cohort=?,updated=? WHERE id=?').bind(p.password_hash,p.salt,p.iterations,role,college,cohort,t,existing.id).run();}
   else await db().prepare('UPDATE local_accounts SET role=?,college=?,cohort=?,updated=? WHERE id=?').bind(role,college,cohort,t,existing.id).run();
   await revokeAccountSessions(existing.id);
  }
  return json({username,role,college,cohort,active:1});
 }catch(e){return failure(e);}
}
export async function DELETE(req:Request){
 if(!FEATURES.localAccounts)return legacy.DELETE(req);
 try{const a=await access(req);requireAdmin(a);const input=await readBody(req),username=normalizeUsername(input.username),account=await findAccount(username);if(!account||account.role==='admin')throw new Error('不能停用该账号');await db().prepare('UPDATE local_accounts SET active=0,updated=? WHERE id=?').bind(now(),account.id).run();await revokeAccountSessions(account.id);return json({ok:true});}catch(e){return failure(e);}
}
