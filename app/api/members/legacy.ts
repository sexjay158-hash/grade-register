import {access,db,json,failure,readBody,requireAdmin,now} from '@/lib/server';
import {normalizeCohort} from '@/lib/role-scope';
import {requireActiveCollege} from '@/lib/colleges';

export async function GET(req:Request){try{const a=await access(req);requireAdmin(a);const rows=await db().prepare('SELECT email,role,college,cohort,account_id IS NOT NULL AS joined,created,updated FROM site_members ORDER BY college,role,email').all();return json(rows.results);}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const a=await access(req);requireAdmin(a);const input=await readBody(req),email=String(input.email??'').trim().toLowerCase(),role=String(input.role??''),college=String(input.college??'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('请填写正确的邮箱');
 if(email===a.email)throw new Error('管理员账号不能在这里修改');
 if(!['college_lead','recorder'].includes(role))throw new Error('请选择院负责人或年级录入员');
 if(!college)throw new Error('请选择负责的学院');await requireActiveCollege(a.owner,college);
 const cohort=role==='recorder'?normalizeCohort(input.cohort):null,t=now();
 await db().prepare('INSERT INTO site_members(email,account_id,role,college,cohort,created,updated) VALUES(?,NULL,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,college=excluded.college,cohort=excluded.cohort,updated=excluded.updated').bind(email,role,college,cohort,t,t).run();
 return json({email,role,college,cohort});
}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{const a=await access(req);requireAdmin(a);const input=await readBody(req),email=String(input.email??'').trim().toLowerCase();if(!email||email===a.email)throw new Error('无法移除管理员账号');await db().prepare('DELETE FROM site_members WHERE email=?').bind(email).run();return json({ok:true});}catch(e){return failure(e);}}
