import {env} from 'cloudflare:workers';
import {FEATURES} from './flags';
import {HttpError,readJsonBody} from './http';
export {json,failure} from './http';
export async function readBody(req:Request):Promise<Record<string,any>>{
 if(FEATURES.operationalSafety)return readJsonBody(req);
 const raw=await req.text();if(raw.length>2000000)throw new Error('请求内容过大');const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请求格式不正确');return value;
}
export function db(){if(!env.DB)throw new HttpError(503,'SERVICE_UNAVAILABLE','数据服务暂不可用，请稍后重试');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new HttpError(503,'SERVICE_UNAVAILABLE','照片存储暂不可用，请稍后重试');return env.BUCKET;}
export {SCHOOL_OWNER} from './school-identity';
import {SCHOOL_OWNER} from './school-identity';
import {accountFromRequest} from './local-auth';
export type Access={owner:string;userId:string;email:string;role:'admin'|'college_lead'|'recorder';college:string|null;cohort:string|null};
const requests=new WeakMap<Request,Promise<Access>>();
export async function access(req:Request):Promise<Access>{
 const pending=requests.get(req);if(pending)return pending;
 const result=resolveAccess(req);requests.set(req,result);return result;
}
async function resolveAccess(req:Request):Promise<Access>{
 if(req.method!=='GET'){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('请求来源不正确');}
 if(FEATURES.localAccounts){
  const account=await accountFromRequest(req);if(!account)throw new Error('请先登录后再操作');
  return {owner:SCHOOL_OWNER,userId:account.id,email:account.username,role:account.role,college:account.college,cohort:account.cohort};
 }
 const id=req.headers.get('oai-authenticated-user-id');if(!id)throw new Error('请先登录后再操作');
 const email=(req.headers.get('oai-authenticated-user-email')??'').trim().toLowerCase();
 if(!FEATURES.sharedRoles&&id!==SCHOOL_OWNER)throw new Error('无权限：共享访问已关闭');
 if(!FEATURES.sharedRoles)return {owner:id,userId:id,email,role:'admin',college:null,cohort:null};
 if(id===SCHOOL_OWNER)return {owner:SCHOOL_OWNER,userId:id,email,role:'admin',college:null,cohort:null};
 if(!email)throw new Error('请先使用已分配权限的账号登录');
 const member=await db().prepare('SELECT email,account_id,role,college,cohort FROM site_members WHERE email=?').bind(email).first<{email:string;account_id:string|null;role:string;college:string|null;cohort:string|null}>();
 if(!member||!['college_lead','recorder'].includes(member.role))throw new Error('账号尚未获得使用权限，请联系管理员');
 if(member.account_id&&member.account_id!==id)throw new Error('此邮箱已绑定其他账号，请联系管理员');
 if(!member.account_id){await db().prepare('UPDATE site_members SET account_id=? WHERE email=? AND account_id IS NULL').bind(id,email).run();const bound=await db().prepare('SELECT account_id FROM site_members WHERE email=?').bind(email).first<{account_id:string}>();if(bound?.account_id!==id)throw new Error('账号绑定发生冲突，请联系管理员');}
 return {owner:SCHOOL_OWNER,userId:id,email,role:member.role as Access['role'],college:member.college,cohort:member.cohort};
}
export async function owner(req:Request){return (await access(req)).owner;}
export function requireAdmin(a:Access){if(a.role!=='admin')throw new Error('无权限：仅管理员可以操作');}
export function requireEditor(a:Access){if(!['admin','college_lead','recorder'].includes(a.role))throw new Error('无权限：不能编辑成绩');}
export const now=()=>new Date().toISOString();
export async function getEvent(id:string,user:string){const e=await db().prepare('SELECT * FROM events WHERE id=? AND owner=?').bind(id,user).first<any>();if(!e)throw new Error('找不到该活动');return e;}
