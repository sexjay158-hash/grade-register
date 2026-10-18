import {FEATURES} from '@/lib/flags';
import {assertSameOrigin,createAdmin,hasLocalAdmin,newSession,normalizeUsername,validatePassword} from '@/lib/local-auth';
import {verifyBootstrapToken} from '@/lib/bootstrap-token';
import {failure,readBody} from '@/lib/server';

export async function POST(req:Request){try{
 if(!FEATURES.localAccounts)throw new Error('账号密码登录尚未启用');
 assertSameOrigin(req);
 if(await hasLocalAdmin())return Response.json({error:'管理员账号已经创建'},{status:409});
 const body=await readBody(req);
 if(!await verifyBootstrapToken(body.setupToken))throw new Error('管理员初始化口令不正确');
 const username=normalizeUsername(body.username),password=validatePassword(body.password,username);
 const id=await createAdmin(username,password),cookie=await newSession(id,req);
 return Response.json({ok:true},{headers:{'Set-Cookie':cookie,'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
