import {FEATURES} from '@/lib/flags';
import {assertSameOrigin,checkLoginLimit,clearLoginFailures,findAccount,hasLocalAdmin,newSession,normalizeUsername,recordLoginFailure,verifyPassword} from '@/lib/local-auth';
import {readBody} from '@/lib/server';

export async function POST(req:Request){
 try{
  if(!FEATURES.localAccounts||!await hasLocalAdmin())return Response.json({error:'管理员尚未完成系统初始化'},{status:503});
  assertSameOrigin(req);
  const body=await readBody(req),username=normalizeUsername(body.username),password=String(body.password??'');
  if(password.length>128)return Response.json({error:'账号或密码不正确'},{status:401});
  const limit=await checkLoginLimit(req,username);
  if(!limit.allowed)return Response.json({error:'尝试次数过多，请 15 分钟后再试'},{status:429});
  const account=await findAccount(username);
  if(!await verifyPassword(password,account)||!account?.active){await recordLoginFailure(limit.key);return Response.json({error:'账号或密码不正确'},{status:401,headers:{'Cache-Control':'no-store'}});}
  await clearLoginFailures(limit.key);
  return Response.json({ok:true,role:account.role},{headers:{'Set-Cookie':await newSession(account.id,req),'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'账号或密码不正确'},{status:401,headers:{'Cache-Control':'no-store'}});}
}
