import {FEATURES} from '@/lib/flags';
import {campaignForToken,publicBody,registerLeader,loginLeader,revokeLeaderSession,leaderFromRequest} from '@/lib/group-registration';
import {json,failure} from '@/lib/server';
type Context={params:Promise<{token:string}>};
export async function POST(req:Request,{params}:Context){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const campaign=await campaignForToken((await params).token,false);if(!campaign)throw new Error('报名链接不存在或学期已归档');
 const input=await publicBody(req);
 if(input.action==='logout')return json({ok:true},200,{'Set-Cookie':await revokeLeaderSession(req)});
 if(input.action==='register'&&!campaign.open)throw new Error('报名已关闭，不能注册新账号');
 const result=input.action==='register'?await registerLeader(req,campaign,input):input.action==='login'?await loginLeader(req,campaign,input):null;
 if(!result)throw new Error('操作不正确');
 return json({ok:true,leader:{sid:result.account.sid,name:result.account.name,college:result.account.college,cohort:result.account.cohort}},200,{'Set-Cookie':result.cookie});
}catch(e){return failure(e);}}
export async function GET(req:Request,{params}:Context){try{
 if(!FEATURES.groupRegistration)throw new Error('小组报名暂未开放');
 const campaign=await campaignForToken((await params).token,false);if(!campaign)throw new Error('报名链接不存在或学期已归档');
 const account=await leaderFromRequest(req,campaign);
 return json({leader:account?{sid:account.sid,name:account.name,college:account.college,cohort:account.cohort}:null});
}catch(e){return failure(e);}}
