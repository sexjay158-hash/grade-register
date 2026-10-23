import {access,db,json,failure,readBody} from '@/lib/server';
import {ensureGroupAccounts,requireAccountIssuer,previewGroupAccounts,issueGroupAccounts,manageGroupAccount} from '@/lib/group-account-store';
import {requireAccessibleYear} from '@/lib/semester-access';

export async function GET(req:Request){try{
 const a=await access(req);requireAccountIssuer(a);await ensureGroupAccounts();const yearId=await requireAccessibleYear(a,new URL(req.url).searchParams.get('yearId'));
 const rows=await db().prepare(`SELECT a.username,a.active,a.college,a.cohort,g.name,g.sid,g.group_id,r.name AS group_name,v.expires,v.used_at FROM group_account_assignments g JOIN local_accounts a ON a.id=g.account_id JOIN roster_groups r ON r.id=g.group_id LEFT JOIN group_account_activations v ON v.account_id=a.id WHERE g.owner=? AND g.year_id=?${a.role==='admin'?'':' AND a.college=?'} ORDER BY a.college,r.name LIMIT 2001`).bind(a.owner,yearId,...(a.role==='admin'?[]:[a.college])).all();
 return json({accounts:rows.results});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const a=await access(req);requireAccountIssuer(a);const input=await readBody(req);
 if(input.action==='preview')return json(await previewGroupAccounts(a,input.yearId,input.rows));
 if(input.action==='issue')return json(await issueGroupAccounts(a,input.yearId,input.rows));
 if(['disable','reset','handover'].includes(input.action))return json(await manageGroupAccount(a,String(input.username??''),input.action));
 throw new Error('操作不正确');
}catch(e){return failure(e);}}
