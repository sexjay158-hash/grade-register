import {FEATURES} from '@/lib/flags';
import {ensureGroupRegistration} from '@/lib/group-registration';
import {access,db,json,failure} from '@/lib/server';
import {requireAccessibleYear} from '@/lib/semester-access';

export async function GET(req:Request){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const a=await access(req);if(a.role!=='admin'&&a.role!=='college_lead')throw new Error('无权限：仅管理员和学院负责人可导出报名');
 const yearId=await requireAccessibleYear(a,new URL(req.url).searchParams.get('yearId'));await ensureGroupRegistration();
 const year=await db().prepare('SELECT label FROM roster_years WHERE owner=? AND id=?').bind(a.owner,yearId).first<{label:string}>();
 const scope=a.role==='admin'?'':'AND college=?',args=[a.owner,yearId,...(a.role==='admin'?[]:[a.college])];
 const ranked=`WITH ranked AS (SELECT college,cohort,group_name,leader_sid,members_json,status,created,reviewed,reviewer,note,ROW_NUMBER() OVER(PARTITION BY leader_sid ORDER BY rowid DESC) AS rank FROM group_registration_submissions WHERE owner=? AND year_id=? ${scope})`;
 const count=await db().prepare(`${ranked} SELECT COALESCE(SUM(json_array_length(members_json)),0) AS members FROM ranked WHERE rank=1`).bind(...args).first<{members:number}>();
 if((count?.members??0)>30000)throw new Error('报名成员超过 30000 人，请联系管理员分批导出');
 const rows=await db().prepare(`${ranked} SELECT college,cohort,group_name,leader_sid,members_json,status,created,reviewed,reviewer,note FROM ranked WHERE rank=1 ORDER BY college,cohort,group_name LIMIT 5001`).bind(...args).all();
 if(rows.results.length>5000)throw new Error('报名记录超过 5000 组，请按学院分批导出或联系管理员');
 return json({year:year?.label??'',submissions:rows.results.map(row=>({...row,members:JSON.parse(String(row.members_json)),members_json:undefined}))});
}catch(e){return failure(e);}}
