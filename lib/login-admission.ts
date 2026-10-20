import {env} from 'cloudflare:workers';
import {createLoginAdmission} from './login-capacity';

let ready:Promise<unknown>|null=null;
// Reject before any database awaits: local crypto can delay D1 responses while requests pile up.
export const acquireInstanceLoginSlot=createLoginAdmission();
// A database lease keeps the limit shared across Worker isolates. It also expires after a crash.
export async function acquireLoginSlot(){
 const d=env.DB;
 if(!d)throw new Error('数据服务暂不可用');
 if(!ready)ready=d.prepare('CREATE TABLE IF NOT EXISTS login_verification_leases(id TEXT PRIMARY KEY,expires INTEGER NOT NULL)').run().catch(error=>{ready=null;throw error;});
 await ready;
 const id=crypto.randomUUID(),now=Date.now();
 const result=await d.prepare('INSERT INTO login_verification_leases(id,expires) SELECT ?,? WHERE (SELECT COUNT(*) FROM login_verification_leases WHERE expires>?)<6').bind(id,now+120000,now).run();
 if(!result.meta.changes)return null;
 return async()=>{await d.batch([d.prepare('DELETE FROM login_verification_leases WHERE id=?').bind(id),d.prepare('DELETE FROM login_verification_leases WHERE expires<=?').bind(Date.now())]);};
}
