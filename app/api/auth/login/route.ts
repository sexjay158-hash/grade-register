import {FEATURES} from '@/lib/flags';
import {assertSameOrigin,checkLoginLimit,clearLoginFailures,findAccount,hasLocalAdmin,newSession,normalizeUsername,recordLoginFailure,verifyPassword} from '@/lib/local-auth';
import {readBody} from '@/lib/server';
import {HttpError,failure} from '@/lib/http';
import {acquireLoginSlot,acquireInstanceLoginSlot} from '@/lib/login-admission';
import {handleNativeLogin} from '@/lib/native-login';

export async function POST(req:Request){
 if(FEATURES.nativeMobileLogin&&/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers.get('content-type')??''))return handleNativeLogin(req,authenticate);
 return authenticate(req);
}
async function authenticate(req:Request){
 let release:(()=>Promise<void>)|null=null;
 let releaseInstance:(()=>void)|null=null;
 const headers={'Cache-Control':'no-store'};
 const busy=()=>Response.json({error:'当前登录人数较多，正在等待重试',code:'LOGIN_BUSY'},{status:503,headers:{...headers,'Retry-After':'3'}});
 try{
  try{assertSameOrigin(req);}catch{return Response.json({error:'请求来源不正确'},{status:403,headers});}
  const body=await readBody(req);let username:string;
  try{username=normalizeUsername(body.username);}catch{return Response.json({error:'账号或密码不正确'},{status:401,headers});}
  const password=String(body.password??'');
  if(password.length>128)return Response.json({error:'账号或密码不正确'},{status:401});
  if(FEATURES.stabilityProtection){releaseInstance=acquireInstanceLoginSlot();if(!releaseInstance)return busy();}
  if(!FEATURES.localAccounts||!await hasLocalAdmin())return Response.json({error:'管理员尚未完成系统初始化'},{status:503,headers});
  const limit=await checkLoginLimit(req,username);
  if(!limit.allowed)return Response.json({error:'尝试次数过多，请 15 分钟后再试'},{status:429});
  if(FEATURES.stabilityProtection){
   release=await acquireLoginSlot();
   if(!release)return busy();
  }
  const account=await findAccount(username);
  if(!await verifyPassword(password,account)||!account?.active){await recordLoginFailure(limit.key);return Response.json({error:'账号或密码不正确'},{status:401,headers:{'Cache-Control':'no-store'}});}
  await clearLoginFailures(limit.key);
  return Response.json({ok:true,role:account.role},{headers:{'Set-Cookie':await newSession(account.id,req,account),'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof HttpError)return failure(error);return Response.json({error:'登录服务暂不可用，请稍后重试'},{status:503,headers});}
 finally{try{if(release)await release();}catch{console.error('Login verification lease cleanup failed');}finally{releaseInstance?.();}}
}
