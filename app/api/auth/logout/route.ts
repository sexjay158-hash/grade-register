import {assertSameOrigin,clearSessionCookie,revokeSession} from '@/lib/local-auth';
export async function POST(req:Request){try{assertSameOrigin(req);await revokeSession(req);return Response.json({ok:true},{headers:{'Set-Cookie':clearSessionCookie(),'Cache-Control':'no-store'}});}catch{return Response.json({error:'退出失败'},{status:400});}}
