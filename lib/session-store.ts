type PasswordRecord={password_hash:string;salt:string;iterations:number};
export async function storeSession(d:D1Database,session:{tokenHash:string;accountId:string;created:string;expires:string},expected?:{username:string;password_hash:string}){
 const result=await d.batch([
  d.prepare(`INSERT INTO local_sessions(token_hash,account_id,created,expires) SELECT ?,?,?,? FROM local_accounts WHERE id=? AND active=1${expected?' AND username=? AND password_hash=?':''}`)
   .bind(session.tokenHash,session.accountId,session.created,session.expires,session.accountId,...(expected?[expected.username,expected.password_hash]:[])),
  d.prepare('DELETE FROM local_sessions WHERE expires<=?').bind(session.created)
 ]);
 if(!result[0].meta.changes)throw new Error('账号状态已变化，请重新登录');
}
export async function replacePassword(d:D1Database,id:string,p:PasswordRecord,updated:string,expectedHash?:string){
 const result=await d.batch([
  d.prepare(`UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,updated=? WHERE id=? AND active=1${expectedHash?' AND password_hash=?':''}`).bind(p.password_hash,p.salt,p.iterations,updated,id,...(expectedHash?[expectedHash]:[])),
  d.prepare('DELETE FROM local_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM local_accounts WHERE id=? AND password_hash=?)').bind(id,id,p.password_hash)
 ]);
 if(!result[0].meta.changes)throw new Error('账号或密码已变化，请重新登录后操作');
}
export async function updateAccountAndRevoke(d:D1Database,id:string,update:D1PreparedStatement){
 const result=await d.batch([update,d.prepare('DELETE FROM local_sessions WHERE account_id=?').bind(id)]);
 if(!result[0].meta.changes)throw new Error('账号已变化，请刷新后再修改');
}
