import {access,failure,readBody,requireAdmin} from '@/lib/server';
import {findAccount,newSession,updatePassword,validatePassword,verifyPassword} from '@/lib/local-auth';
export async function POST(req:Request){try{
 const a=await access(req);requireAdmin(a);const body=await readBody(req),account=await findAccount(a.email);
 if(!account||!await verifyPassword(String(body.current??''),account))throw new Error('原密码不正确');
 const password=validatePassword(body.next,account.username);const updated=await updatePassword(account.id,password,account.password_hash);
 return Response.json({ok:true},{headers:{'Set-Cookie':await newSession(account.id,req,{username:account.username,password_hash:updated.password_hash}),'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
