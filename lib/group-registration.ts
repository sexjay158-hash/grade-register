import {db} from './server';
import {initializeOnce} from './query-initialization';
import {HttpError,readJsonBody} from './http';
import {SCHOOL_OWNER} from './school-identity';
import {passwordRecord,verifyPassword,validatePassword,checkLoginLimit,recordLoginFailure,clearLoginFailures} from './local-auth';

export type RegistrationMember={sid:string;name:string};
export type RegistrationSubmission={id:string;owner:string;year_id:string;college:string;cohort:string;group_name:string;leader_sid:string;members_json:string;status:string;created:string};
export type LeaderAccount={id:string;owner:string;year_id:string;sid:string;name:string;college:string;cohort:string;active:number};
type StoredLeader=LeaderAccount&{password_hash:string;salt:string;iterations:number};
const LEADER_COOKIE='gr_leader_session',SESSION_SECONDS=7*24*60*60;
const hex=(value:Uint8Array)=>Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async(value:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));

export async function ensureGroupRegistration(){await initializeOnce('group-registration-schema',async()=>{
 const d=db();await d.batch([
  d.prepare('CREATE TABLE IF NOT EXISTS group_registration_campaigns(token TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL,open INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,UNIQUE(owner,year_id))'),
  d.prepare("CREATE TABLE IF NOT EXISTS group_registration_submissions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL,college TEXT NOT NULL,cohort TEXT NOT NULL,group_name TEXT NOT NULL,leader_sid TEXT NOT NULL,members_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created TEXT NOT NULL,reviewed TEXT,reviewer TEXT,note TEXT)"),
  d.prepare("CREATE UNIQUE INDEX IF NOT EXISTS group_registration_pending_group ON group_registration_submissions(owner,year_id,college,group_name) WHERE status='pending'"),
  d.prepare("CREATE UNIQUE INDEX IF NOT EXISTS group_registration_active_group ON group_registration_submissions(owner,year_id,college,group_name) WHERE status IN ('pending','reviewing','approved')"),
  d.prepare("CREATE UNIQUE INDEX IF NOT EXISTS group_registration_pending_leader ON group_registration_submissions(owner,year_id,leader_sid) WHERE status='pending'"),
  d.prepare('CREATE INDEX IF NOT EXISTS group_registration_scope ON group_registration_submissions(owner,year_id,college,status,created)'),
  d.prepare('CREATE TABLE IF NOT EXISTS group_registration_leaders(id TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL,sid TEXT NOT NULL,name TEXT NOT NULL,college TEXT NOT NULL,cohort TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,iterations INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,UNIQUE(owner,year_id,sid))'),
  d.prepare('CREATE TABLE IF NOT EXISTS group_registration_sessions(token_hash TEXT PRIMARY KEY,leader_id TEXT NOT NULL,expires TEXT NOT NULL)'),
  d.prepare('CREATE INDEX IF NOT EXISTS group_registration_sessions_leader ON group_registration_sessions(leader_id)')
 ]);
});}
export function requireSameOrigin(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)throw new HttpError(403,'INVALID_ORIGIN','请求来源不正确');}
export async function publicBody(req:Request){requireSameOrigin(req);if(!req.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'CONTENT_TYPE','请求格式不正确');return readJsonBody(req,32_000);}
export function registrationMembers(value:unknown):RegistrationMember[]{
 if(!Array.isArray(value)||value.length<1||value.length>60)throw new Error('每组须填写 1～60 名成员');
 const seen=new Set<string>();return value.map((item,i)=>{const sid=String(item?.sid??'').trim(),name=String(item?.name??'').trim();if(!/^\d{6,24}$/.test(sid)||!name||name.length>40)throw new Error(`第 ${i+1} 位成员的学号或姓名不正确`);if(seen.has(sid))throw new Error(`学号 ${sid} 在本组重复`);seen.add(sid);return {sid,name};});
}
export async function campaignForToken(token:string,requireOpen=true){await ensureGroupRegistration();return db().prepare("SELECT c.owner,c.year_id,c.open,y.label FROM group_registration_campaigns c JOIN roster_years y ON y.id=c.year_id AND y.owner=c.owner LEFT JOIN semester_archives ar ON ar.owner=c.owner AND ar.year_id=c.year_id WHERE c.token=? AND c.owner=? AND (?=0 OR c.open=1) AND ar.year_id IS NULL").bind(token,SCHOOL_OWNER,requireOpen?1:0).first<{owner:string;year_id:string;open:number;label:string}>();}
function readLeaderCookie(req:Request){const part=req.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(LEADER_COOKIE+'='));const token=part?.slice(LEADER_COOKIE.length+1)??'';return /^[a-f0-9]{64}$/.test(token)?token:null;}
export async function leaderFromRequest(req:Request,scope:{owner:string;year_id:string}){
 const token=readLeaderCookie(req);if(!token)return null;await ensureGroupRegistration();
 return db().prepare('SELECT a.id,a.owner,a.year_id,a.sid,a.name,a.college,a.cohort,a.active FROM group_registration_sessions s JOIN group_registration_leaders a ON a.id=s.leader_id WHERE s.token_hash=? AND s.expires>? AND a.owner=? AND a.year_id=? AND a.active=1').bind(await digest(token),new Date().toISOString(),scope.owner,scope.year_id).first<LeaderAccount>();
}
export async function createLeaderSession(req:Request,id:string){const token=hex(crypto.getRandomValues(new Uint8Array(32))),expires=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();await db().prepare('INSERT INTO group_registration_sessions(token_hash,leader_id,expires) VALUES(?,?,?)').bind(await digest(token),id,expires).run();return `${LEADER_COOKIE}=${token}; Path=/api/group-registration; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export async function revokeLeaderSession(req:Request){const token=readLeaderCookie(req);if(token)await db().prepare('DELETE FROM group_registration_sessions WHERE token_hash=?').bind(await digest(token)).run();return `${LEADER_COOKIE}=; Path=/api/group-registration; HttpOnly; SameSite=Strict; Max-Age=0`;}
export async function registerLeader(req:Request,scope:{owner:string;year_id:string},input:Record<string,unknown>){
 const sid=String(input.sid??'').trim(),name=String(input.name??'').trim(),college=String(input.college??'').trim(),cohort=sid.slice(0,4);
 if(!/^20\d{2}\d{2,20}$/.test(sid)||!name||name.length>40||!college||college.length>150)throw new Error('请填写有效的组长学号、姓名和学院');
 const password=validatePassword(input.password,sid);
 const valid=await db().prepare('SELECT 1 FROM colleges WHERE owner=? AND name=? AND active=1').bind(scope.owner,college).first();if(!valid)throw new Error('学院不存在或已停用');
 const id=crypto.randomUUID(),record=await passwordRecord(password),created=new Date().toISOString();
 try{await db().prepare('INSERT INTO group_registration_leaders(id,owner,year_id,sid,name,college,cohort,password_hash,salt,iterations,active,created) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)').bind(id,scope.owner,scope.year_id,sid,name,college,cohort,record.password_hash,record.salt,record.iterations,created).run();}
 catch(error){if(/UNIQUE|SQLITE_CONSTRAINT/i.test(String(error)))throw new HttpError(409,'LEADER_EXISTS','该学号已注册，请直接登录或联系管理员');throw error;}
 return {account:{id,owner:scope.owner,year_id:scope.year_id,sid,name,college,cohort,active:1} as LeaderAccount,cookie:await createLeaderSession(req,id)};
}
export async function loginLeader(req:Request,scope:{owner:string;year_id:string},input:Record<string,unknown>){
 const sid=String(input.sid??'').trim(),password=String(input.password??'');if(!/^\d{6,24}$/.test(sid)||password.length>128)throw new HttpError(401,'BAD_CREDENTIALS','学号或密码不正确');
 const limit=await checkLoginLimit(req,`group-leader:${scope.year_id}:${sid}`);if(!limit.allowed)throw new HttpError(429,'TOO_MANY_ATTEMPTS','尝试次数过多，请 15 分钟后再试');
 const account=await db().prepare('SELECT * FROM group_registration_leaders WHERE owner=? AND year_id=? AND sid=?').bind(scope.owner,scope.year_id,sid).first<StoredLeader>();
 if(!await verifyPassword(password,account)||!account?.active){await recordLoginFailure(limit.key);throw new HttpError(401,'BAD_CREDENTIALS','学号或密码不正确');}
 await clearLoginFailures(limit.key);return {account,cookie:await createLeaderSession(req,account.id)};
}
