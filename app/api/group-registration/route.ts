import {FEATURES} from '@/lib/flags';
import {ensureGroupRegistration,type RegistrationSubmission,registrationMembers} from '@/lib/group-registration';
import {access,db,json,failure,readBody} from '@/lib/server';
import {requireAccessibleYear} from '@/lib/semester-access';
import {assertRosterEditor} from '@/lib/role-scope';
import {POST as importRoster} from '@/app/api/roster/route';

function reviewer(role:string){if(role!=='admin'&&role!=='college_lead')throw new Error('无权限：仅管理员和学院负责人可审核报名');}
export async function GET(req:Request){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const a=await access(req);reviewer(a.role);const yearId=await requireAccessibleYear(a,new URL(req.url).searchParams.get('yearId'));await ensureGroupRegistration();
 const d=db(),campaign=a.role==='admin'?await d.prepare('SELECT token,open,created FROM group_registration_campaigns WHERE owner=? AND year_id=?').bind(a.owner,yearId).first():null;
 const campaignState=await d.prepare('SELECT open FROM group_registration_campaigns WHERE owner=? AND year_id=?').bind(a.owner,yearId).first<{open:number}>();
 const scope=a.role==='admin'?'':'AND college=?',scopeArgs=a.role==='admin'?[]:[a.college];
 const stats=await d.prepare(`WITH ranked AS (SELECT college,cohort,status,members_json,ROW_NUMBER() OVER(PARTITION BY leader_sid ORDER BY rowid DESC) AS rank FROM group_registration_submissions WHERE owner=? AND year_id=? ${scope}) SELECT college,cohort,status,COUNT(*) AS groups,COALESCE(SUM(json_array_length(members_json)),0) AS members FROM ranked WHERE rank=1 GROUP BY college,cohort,status ORDER BY college,cohort,status`).bind(a.owner,yearId,...scopeArgs).all();
 const total=stats.results.reduce((sum,row)=>sum+Number(row.groups),0);
 const page=Math.min(10000,Math.max(0,Math.floor(Number(new URL(req.url).searchParams.get('page')??0)||0)));
 const where="WHERE owner=? AND year_id=? "+(a.role==='admin'?'':'AND college=? '),args=[a.owner,yearId,...(a.role==='admin'?[]:[a.college])];
 const recordCount=await d.prepare('SELECT COUNT(*) AS total FROM group_registration_submissions '+where).bind(...args).first<{total:number}>();
 const rows=await d.prepare("SELECT id,college,cohort,group_name,leader_sid,members_json,status,created,reviewed,reviewer,note FROM group_registration_submissions "+where+"ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created DESC LIMIT 100 OFFSET ?").bind(...args,page*100).all();
 return json({campaign,campaignOpen:campaignState?!!campaignState.open:null,canManageCampaign:a.role==='admin',stats:stats.results,total,recordsTotal:Number(recordCount?.total??0),page,submissions:rows.results.map(row=>({...row,members:JSON.parse(String(row.members_json)),members_json:undefined}))});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const a=await access(req);reviewer(a.role);const input=await readBody(req),yearId=await requireAccessibleYear(a,input.yearId,true),d=db();await ensureGroupRegistration();
 if(input.action==='open'){
  if(a.role!=='admin')throw new Error('仅管理员可创建报名链接');
  const token=crypto.randomUUID(),created=new Date().toISOString();
  await d.prepare('INSERT INTO group_registration_campaigns(token,owner,year_id,open,created) VALUES(?,?,?,1,?) ON CONFLICT(owner,year_id) DO UPDATE SET open=1').bind(token,a.owner,yearId,created).run();
  const row=await d.prepare('SELECT token FROM group_registration_campaigns WHERE owner=? AND year_id=?').bind(a.owner,yearId).first<{token:string}>();return json({token:row?.token,open:true});
 }
 if(input.action==='close'){
  if(a.role!=='admin')throw new Error('仅管理员可关闭报名链接');
  await d.prepare('UPDATE group_registration_campaigns SET open=0 WHERE owner=? AND year_id=?').bind(a.owner,yearId).run();return json({open:false});
 }
 const id=String(input.id??'');if(!id)throw new Error('报名记录不存在');
 const row=await d.prepare('SELECT * FROM group_registration_submissions WHERE id=? AND owner=? AND year_id=?').bind(id,a.owner,yearId).first<RegistrationSubmission>();
 if(!row||row.status!=='pending')throw new Error('这条报名已经处理，请刷新列表');
 assertRosterEditor(a,row.college,row.cohort);
 if(input.action==='reject'){
  const note=String(input.note??'').trim();if(!note||note.length>300)throw new Error('请填写不超过 300 字的退回原因');
  const changed=await d.prepare("UPDATE group_registration_submissions SET status='rejected',reviewed=?,reviewer=?,note=? WHERE id=? AND owner=? AND status='pending' RETURNING id").bind(new Date().toISOString(),a.email,note,id,a.owner).first();if(!changed)throw new Error('这条报名已由其他人处理');return json({status:'rejected'});
 }
 if(input.action!=='approve')throw new Error('操作不正确');
 const members=registrationMembers(JSON.parse(row.members_json));
 const claimed=await d.prepare("UPDATE group_registration_submissions SET status='reviewing' WHERE id=? AND owner=? AND status='pending' RETURNING id").bind(id,a.owner).first();if(!claimed)throw new Error('这条报名已由其他人处理');
 try{
  const payload={yearId,college:row.college,rows:members.map(member=>({...member,college:row.college,group:row.group_name,cohort:row.cohort}))};
  const forwardedHeaders=new Headers(req.headers);forwardedHeaders.delete('content-length');
  const response=await importRoster(new Request(new URL('/api/roster',req.url),{method:'POST',headers:forwardedHeaders,body:JSON.stringify(payload)}));
  const result=await response.json() as {students?:number;skipped?:number;error?:string};
  if(!response.ok)throw new Error(result.error??'导入名单失败');
  await d.prepare("UPDATE group_registration_submissions SET status='approved',reviewed=?,reviewer=?,note=? WHERE id=? AND owner=? AND status='reviewing'").bind(new Date().toISOString(),a.email,`新增 ${result.students??0} 人，跳过 ${result.skipped??0} 人`,id,a.owner).run();
  return json({status:'approved',...result});
 }catch(error){await d.prepare("UPDATE group_registration_submissions SET status='pending' WHERE id=? AND owner=? AND status='reviewing'").bind(id,a.owner).run();throw error;}
}catch(e){return failure(e);}}
