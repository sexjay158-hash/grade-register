import {env} from 'cloudflare:workers';
import {PASSWORD_MIN_LENGTH} from './password-policy';

export type LocalAccount={id:string;username:string;role:'admin'|'college_lead'|'recorder';college:string|null;cohort:string|null;active:number};
type StoredAccount=LocalAccount&{password_hash:string;salt:string;iterations:number};

const ADMIN_ID='school-admin';
const COOKIE='gr_session';
const ITERATIONS=600_000;
const SESSION_SECONDS=7*24*60*60;
let initialized:Promise<void>|null=null;
const database=()=>{if(!env.DB)throw new Error('数据服务暂不可用');return env.DB;};
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>new Uint8Array((value.match(/../g)??[]).map(item=>parseInt(item,16)));
const randomHex=(length:number)=>hex(crypto.getRandomValues(new Uint8Array(length)));
async function sha256(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}

export async function ensureLocalAuth(){
 if(!initialized)initialized=(async()=>{
  await database().prepare(`CREATE TABLE IF NOT EXISTS local_accounts (
   id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
   salt TEXT NOT NULL, iterations INTEGER NOT NULL, role TEXT NOT NULL,
   college TEXT, cohort TEXT, active INTEGER NOT NULL DEFAULT 1,
   created TEXT NOT NULL, updated TEXT NOT NULL
  )`).run();
  await database().prepare(`CREATE TABLE IF NOT EXISTS local_sessions (
   token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL,
   created TEXT NOT NULL, expires TEXT NOT NULL
  )`).run();
  await database().prepare('CREATE INDEX IF NOT EXISTS local_sessions_account ON local_sessions(account_id)').run();
  await database().prepare(`CREATE TABLE IF NOT EXISTS local_login_attempts (
   attempt_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires TEXT NOT NULL
  )`).run();
  // Older local previews may have the school roster tables but not the role migration.
  // Keep local account setup usable without silently losing colleges from the UI.
  await database().prepare(`CREATE TABLE IF NOT EXISTS site_members (
   email TEXT PRIMARY KEY, account_id TEXT, role TEXT NOT NULL, college TEXT,
   cohort TEXT, created TEXT NOT NULL, updated TEXT NOT NULL
  )`).run();
  await database().prepare(`CREATE TABLE IF NOT EXISTS student_cohorts (
   owner TEXT NOT NULL, year_id TEXT NOT NULL, sid TEXT NOT NULL,
   cohort TEXT NOT NULL, PRIMARY KEY(owner,year_id,sid)
  )`).run();
  await database().prepare(`CREATE TABLE IF NOT EXISTS photo_actors (
   kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL,
   account_id TEXT NOT NULL, PRIMARY KEY(kind,id)
  )`).run();
 })().catch(error=>{initialized=null;throw error;});
 return initialized;
}

export async function hasLocalAdmin(){await ensureLocalAuth();return !!await database().prepare('SELECT id FROM local_accounts WHERE id=?').bind(ADMIN_ID).first();}
export function normalizeUsername(value:unknown){
 const username=String(value??'').trim().normalize('NFKC').toLowerCase();
 if(!/^[\p{L}\p{N}._-]{3,32}$/u.test(username))throw new Error('账号须为 3–32 位文字、数字、点、下划线或短横线');
 return username;
}
export function validatePassword(value:unknown,username?:string){
 const password=String(value??'');
 if(password.length<PASSWORD_MIN_LENGTH||password.length>128||new TextEncoder().encode(password).length>256)throw new Error(`密码须为 ${PASSWORD_MIN_LENGTH}–128 个字符`);
 if(username&&password.toLowerCase().includes(username.toLowerCase()))throw new Error('密码不能包含登录账号');
 return password;
}
async function derive(password:string,salt:string,iterations=ITERATIONS){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations},key,256)));
}
export async function passwordRecord(password:string){const salt=randomHex(16);return {salt,iterations:ITERATIONS,password_hash:await derive(password,salt)};}
export async function verifyPassword(password:string,account:StoredAccount|null){
 const salt=account?.salt??'00000000000000000000000000000000';
 const actual=await derive(password,salt,account?.iterations??ITERATIONS),expected=account?.password_hash??'0'.repeat(64);
 let mismatch=actual.length^expected.length;for(let i=0;i<64;i++)mismatch|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return !!account&&mismatch===0;
}
export async function findAccount(username:string){await ensureLocalAuth();return database().prepare('SELECT * FROM local_accounts WHERE username=?').bind(username).first<StoredAccount>();}
export function assertSameOrigin(req:Request){const origin=req.headers.get('origin');if(origin!==new URL(req.url).origin)throw new Error('请求来源不正确');}
function readCookie(header:string){const part=header.split(';').map(item=>item.trim()).find(item=>item.startsWith(COOKIE+'='));const token=part?.slice(COOKIE.length+1)??'';return /^[a-f0-9]{64}$/.test(token)?token:null;}
export async function accountFromCookie(cookieHeader:string){
 const token=readCookie(cookieHeader);if(!token)return null;
 await ensureLocalAuth();
 const session=await database().prepare('SELECT account_id,expires FROM local_sessions WHERE token_hash=?')
  .bind(await sha256(token)).first<{account_id:string;expires:string}>();
 if(!session||session.expires<=new Date().toISOString())return null;
 return database().prepare('SELECT id,username,role,college,cohort,active FROM local_accounts WHERE id=? AND active=1')
  .bind(session.account_id).first<LocalAccount>();
}
export async function accountFromRequest(req:Request){return accountFromCookie(req.headers.get('cookie')??'');}
export async function newSession(accountId:string,req:Request){
 await ensureLocalAuth();const token=randomHex(32),t=new Date(),expires=new Date(t.getTime()+SESSION_SECONDS*1000).toISOString();
 await database().prepare('INSERT INTO local_sessions(token_hash,account_id,created,expires) VALUES(?,?,?,?)').bind(await sha256(token),accountId,t.toISOString(),expires).run();
 const secure=new URL(req.url).protocol==='https:'?'; Secure':'';
 return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}
export const clearSessionCookie=()=>`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
export async function revokeSession(req:Request){const token=readCookie(req.headers.get('cookie')??'');if(token){await ensureLocalAuth();await database().prepare('DELETE FROM local_sessions WHERE token_hash=?').bind(await sha256(token)).run();}}
export async function revokeAccountSessions(id:string){await ensureLocalAuth();await database().prepare('DELETE FROM local_sessions WHERE account_id=?').bind(id).run();}
export async function createAdmin(username:string,password:string){
 await ensureLocalAuth();const p=await passwordRecord(password),t=new Date().toISOString();
 const result=await database().prepare(`INSERT INTO local_accounts(id,username,password_hash,salt,iterations,role,college,cohort,active,created,updated)
  SELECT ?,?,?,?,?, 'admin',NULL,NULL,1,?,? WHERE NOT EXISTS(SELECT 1 FROM local_accounts WHERE id=?)`)
  .bind(ADMIN_ID,username,p.password_hash,p.salt,p.iterations,t,t,ADMIN_ID).run();
 if(!result.meta.changes)throw new Error('管理员账号已经创建');return ADMIN_ID;
}
export async function checkLoginLimit(req:Request,username:string){
 await ensureLocalAuth();const ip=req.headers.get('cf-connecting-ip')??'local';const key=await sha256(`${ip}|${username}`),now=new Date().toISOString();
 const row=await database().prepare('SELECT attempts,expires FROM local_login_attempts WHERE attempt_key=?').bind(key).first<{attempts:number;expires:string}>();
 if(row&&row.expires>now&&row.attempts>=5)return {allowed:false,key};return {allowed:true,key};
}
export async function recordLoginFailure(key:string){const expiry=new Date(Date.now()+15*60*1000).toISOString(),now=new Date().toISOString();
 await database().prepare(`INSERT INTO local_login_attempts(attempt_key,attempts,expires) VALUES(?,1,?)
 ON CONFLICT(attempt_key) DO UPDATE SET attempts=CASE WHEN expires>? THEN attempts+1 ELSE 1 END,expires=CASE WHEN expires>? THEN expires ELSE ? END`)
 .bind(key,expiry,now,now,expiry).run();
}
export async function clearLoginFailures(key:string){await database().prepare('DELETE FROM local_login_attempts WHERE attempt_key=?').bind(key).run();}
export async function updatePassword(accountId:string,password:string){const p=await passwordRecord(password),t=new Date().toISOString();
 await database().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,updated=? WHERE id=?').bind(p.password_hash,p.salt,p.iterations,t,accountId).run();
 await revokeAccountSessions(accountId);
}
export {ADMIN_ID};
