import {FEATURES} from '@/lib/flags';
import {db,json,failure} from '@/lib/server';
import {campaignForToken,publicBody,registrationMembers,leaderFromRequest} from '@/lib/group-registration';
import {HttpError} from '@/lib/http';

type Context={params:Promise<{token:string}>};
export async function GET(_req:Request,{params}:Context){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const campaign=await campaignForToken((await params).token,false);if(!campaign)throw new Error('报名链接不存在或学期已归档');
 const colleges=await db().prepare('SELECT name FROM colleges WHERE owner=? AND active=1 ORDER BY name').bind(campaign.owner).all<{name:string}>();
 const leader=await leaderFromRequest(_req,campaign);
 const submission=leader?await db().prepare('SELECT id,status,group_name,note,created,reviewed FROM group_registration_submissions WHERE owner=? AND year_id=? AND leader_sid=? ORDER BY rowid DESC LIMIT 1').bind(campaign.owner,campaign.year_id,leader.sid).first():null;
 return json({year:campaign.label,open:!!campaign.open,colleges:colleges.results.map(row=>row.name),leader:leader?{sid:leader.sid,name:leader.name,college:leader.college,cohort:leader.cohort}:null,submission},200,{'Referrer-Policy':'no-referrer'});
}catch(e){return failure(e);}}
export async function POST(req:Request,{params}:Context){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const token=(await params).token,campaign=await campaignForToken(token);if(!campaign)throw new Error('报名链接不存在或已关闭');
 const input=await publicBody(req);if(input.website)throw new Error('提交失败，请稍后重试');
 const leader=await leaderFromRequest(req,campaign);if(!leader)throw new HttpError(401,'LEADER_LOGIN_REQUIRED','请先登录组长账号');
 const college=leader.college,group=String(input.group??'').trim(),members=registrationMembers(input.members),leaderSid=leader.sid;
 if(!college||college.length>150||!group||group.length>150)throw new Error('请选择学院并填写小组名称');
 if(!members.some(member=>member.sid===leaderSid&&member.name===leader.name))throw new Error('组长学号和姓名须与登录账号一致');
 const cohort=leader.cohort;
 if(members.some(member=>member.sid.slice(0,4)!==cohort))throw new Error('同一报名小组的学号前四位须为相同入学年级');
 const d=db(),valid=await d.prepare('SELECT 1 FROM colleges WHERE owner=? AND name=? AND active=1').bind(campaign.owner,college).first();if(!valid)throw new Error('学院不存在或已停用');
 const exists=await d.prepare("SELECT 1 FROM group_registration_submissions WHERE owner=? AND year_id=? AND college=? AND group_name=? AND status IN ('pending','reviewing','approved')").bind(campaign.owner,campaign.year_id,college,group).first();if(exists)throw new Error('该学院已有同名小组的报名，请核对小组名称或联系负责人');
 const prior=await d.prepare("SELECT status FROM group_registration_submissions WHERE owner=? AND year_id=? AND leader_sid=? ORDER BY rowid DESC LIMIT 1").bind(campaign.owner,campaign.year_id,leaderSid).first<{status:string}>();
 if(prior&&prior.status!=='rejected')throw new Error(prior.status==='approved'?'本组名单已通过，请联系学院负责人修改正式名单':'你已提交报名，请等待审核或联系学院负责人退回');
 const id=crypto.randomUUID(),created=new Date().toISOString();
 try{await d.prepare("INSERT INTO group_registration_submissions(id,owner,year_id,college,cohort,group_name,leader_sid,members_json,status,created) SELECT ?,?,?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM group_registration_campaigns WHERE token=? AND owner=? AND year_id=? AND open=1) AND NOT EXISTS(SELECT 1 FROM semester_archives WHERE owner=? AND year_id=?)").bind(id,campaign.owner,campaign.year_id,college,cohort,group,leaderSid,JSON.stringify(members),created,token,campaign.owner,campaign.year_id,campaign.owner,campaign.year_id).run();}
 catch(error){if(/UNIQUE|SQLITE_CONSTRAINT/i.test(String(error)))throw new HttpError(409,'GROUP_ALREADY_EXISTS','该小组已有报名，请联系负责人核对');throw error;}
 const saved=await d.prepare('SELECT 1 FROM group_registration_submissions WHERE id=?').bind(id).first();if(!saved)throw new Error('报名已关闭，请刷新后重试');
 return json({id,status:'pending'},201);
}catch(e){return failure(e);}}
