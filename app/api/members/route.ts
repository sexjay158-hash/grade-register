import {updateAccountAndRevoke} from '@/lib/session-store';
import {access,db,json,failure,readBody,requireAdmin,now} from '@/lib/server';
import {FEATURES} from '@/lib/flags';
import {findAccount,normalizeUsername,passwordRecord,revokeAccountSessions,validatePassword} from '@/lib/local-auth';
import {normalizeCohort} from '@/lib/role-scope';
import {requireExistingActiveCollege} from '@/lib/colleges';
import * as legacy from './legacy';

export async function GET(req:Request){
 if(!FEATURES.localAccounts)return legacy.GET(req);
 try{
  const a=await access(req);
  if(FEATURES.collegeStaffDirectory&&a.role==='college_lead'&&a.college){
   const rows=await db().prepare("SELECT username,role,college,cohort,active FROM local_accounts WHERE role='recorder' AND college=? ORDER BY cohort,username").bind(a.college).all();return json(rows.results);
  }
  requireAdmin(a);const rows=await db().prepare("SELECT username,role,college,cohort,active,created,updated FROM local_accounts WHERE role<>'admin' ORDER BY college,role,username").all();return json(rows.results);
 }catch(e){return failure(e);}
}
export async function POST(req:Request){
 if(!FEATURES.localAccounts)return legacy.POST(req);
 try{
  const a=await access(req),input=await readBody(req);requireAdmin(a);const username=normalizeUsername(input.username),role=String(input.role??''),college=String(input.college??'').trim();
  if(!['college_lead','recorder'].includes(role))throw new Error('请选择院负责人或年级录入员');
  if(!college)throw new Error('请选择负责的学院');await requireExistingActiveCollege(a.owner,college);
  const cohort=role==='recorder'?normalizeCohort(input.cohort):null,existing=await findAccount(username),t=now();
  if(existing?.role==='admin')throw new Error('不能在这里修改管理员账号');
  if(input.createOnly&&existing)throw new Error('账号已存在，请选择修改或使用其他账号名称');
  const password=String(input.password??'');
  if(!existing||!existing.active){
   const p=await passwordRecord(validatePassword(password,username));
   if(existing){await updateAccountAndRevoke(db(),existing.id,db().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,role=?,college=?,cohort=?,active=1,updated=? WHERE id=?').bind(p.password_hash,p.salt,p.iterations,role,college,cohort,t,existing.id));}
   else await db().prepare('INSERT INTO local_accounts(id,username,password_hash,salt,iterations,role,college,cohort,active,created,updated) VALUES(?,?,?,?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(),username,p.password_hash,p.salt,p.iterations,role,college,cohort,t,t).run();
  }else{
   if(password){const p=await passwordRecord(validatePassword(password,username));await updateAccountAndRevoke(db(),existing.id,db().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,role=?,college=?,cohort=?,updated=? WHERE id=?').bind(p.password_hash,p.salt,p.iterations,role,college,cohort,t,existing.id));}
   else await updateAccountAndRevoke(db(),existing.id,db().prepare('UPDATE local_accounts SET role=?,college=?,cohort=?,updated=? WHERE id=?').bind(role,college,cohort,t,existing.id));
  }
  return json({username,role,college,cohort,active:1});
 }catch(e){return failure(e);}
}
export async function PUT(req:Request){
 try{
  const a=await access(req),input=await readBody(req);requireAdmin(a);
  if(!FEATURES.localAccounts||!FEATURES.memberAccountManagement)throw new Error('账号修改功能未开启');
  const oldUsername=normalizeUsername(input.oldUsername),username=normalizeUsername(input.username),account=await findAccount(oldUsername);
  if(!account||account.role==='admin')throw new Error('不能修改该账号');
  const duplicate=await findAccount(username);if(duplicate&&duplicate.id!==account.id)throw new Error('账号名称已被使用');
  const role=String(input.role??''),college=String(input.college??'').trim();
  if(!['college_lead','recorder'].includes(role))throw new Error('请选择院负责人或年级负责人');
  await requireExistingActiveCollege(a.owner,college);
  const cohort=role==='recorder'?normalizeCohort(input.cohort):null,password=String(input.password??'');
  if(!account.active&&!password)throw new Error('重新启用账号需要设置新密码');
  const p=password?await passwordRecord(validatePassword(password,username)):null,t=now();
  const update=p?db().prepare('UPDATE local_accounts SET username=?,password_hash=?,salt=?,iterations=?,role=?,college=?,cohort=?,active=1,updated=? WHERE id=?').bind(username,p.password_hash,p.salt,p.iterations,role,college,cohort,t,account.id):db().prepare('UPDATE local_accounts SET username=?,role=?,college=?,cohort=?,updated=? WHERE id=?').bind(username,role,college,cohort,t,account.id);
  await db().batch([update,db().prepare('DELETE FROM local_sessions WHERE account_id=?').bind(account.id)]);
  return json({username,role,college,cohort,active:1});
 }catch(e){return failure(e);}
}
export async function DELETE(req:Request){
 if(!FEATURES.localAccounts)return legacy.DELETE(req);
 try{
  const a=await access(req),input=await readBody(req);requireAdmin(a);const username=normalizeUsername(input.username),account=await findAccount(username);
  if(!account||account.role==='admin')throw new Error('不能停用或删除该账号');
  if(input.action==='delete'){
   if(!FEATURES.memberAccountManagement)throw new Error('账号删除功能未开启');
   if(String(input.confirmUsername??'')!==account.username)throw new Error('请输入完整账号名称确认删除');
   // Keep photo actor IDs and historical data: a future account with the same name is a different person.
   await db().batch([db().prepare('DELETE FROM local_sessions WHERE account_id=?').bind(account.id),db().prepare('DELETE FROM local_accounts WHERE id=?').bind(account.id)]);
  }else{
   if(input.action&&input.action!=='disable')throw new Error('账号操作不正确');
   await db().batch([db().prepare('UPDATE local_accounts SET active=0,updated=? WHERE id=?').bind(now(),account.id),db().prepare('DELETE FROM local_sessions WHERE account_id=?').bind(account.id)]);
  }
  return json({ok:true});
 }catch(e){return failure(e);}
}
