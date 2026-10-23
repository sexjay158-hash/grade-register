import {db,now,type Access} from './server';
import {ensureLocalAuth,passwordRecord,normalizeUsername} from './local-auth';
import {initializeOnce} from './query-initialization';
import {guardedBatch,accountWriteGuard,writableYearGuard} from './guarded-batch';
import {validateGroupAccounts,type AccountCatalogRow,type ExistingGroupAccount} from './group-account-domain';
import {requireAccessibleYear} from './semester-access';
import {FEATURES} from './flags';

export const hashActivation=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
export async function ensureGroupAccounts(){await ensureLocalAuth();await initializeOnce('group-accounts',async()=>{await db().batch([
 db().prepare('CREATE TABLE IF NOT EXISTS group_account_assignments(account_id TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL,group_id TEXT NOT NULL,sid TEXT NOT NULL,name TEXT NOT NULL,assigned_by TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(owner,group_id))'),
 db().prepare('CREATE TABLE IF NOT EXISTS group_account_activations(account_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires TEXT NOT NULL,used_at TEXT)'),
 db().prepare('CREATE TABLE IF NOT EXISTS account_audit(id TEXT PRIMARY KEY,owner TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,account_id TEXT NOT NULL,created TEXT NOT NULL,detail TEXT NOT NULL)'),
 db().prepare('CREATE INDEX IF NOT EXISTS group_accounts_year ON group_account_assignments(owner,year_id)')
 ]);});}
export function requireAccountIssuer(a:Access){if(!FEATURES.bulkGroupAccounts)throw new Error('小组批量开户暂未启用');if(!['admin','college_lead'].includes(a.role))throw new Error('无权限：仅管理员与院负责人可管理小组账号');}
export async function groupAssignment(id:string){await ensureGroupAccounts();return db().prepare('SELECT group_id AS groupId,year_id AS groupYearId,name AS displayName FROM group_account_assignments WHERE account_id=?').bind(id).first<{groupId:string;groupYearId:string;displayName:string}>();}
export async function previewGroupAccounts(a:Access,year:unknown,rows:unknown){
 requireAccountIssuer(a);const yearId=await requireAccessibleYear(a,year,true);await ensureGroupAccounts();
 const scope=a.role==='admin'?'':' AND g.college=?';
 const catalog=await db().prepare(`SELECT COALESCE(sn.number,s.sid) AS sid,s.name,s.college,g.id AS group_id,g.name AS group_name,COALESCE(gc.cohort,substr(COALESCE(sn.number,s.sid),1,4)) AS cohort FROM roster_students s JOIN roster_groups g ON g.id=s.group_id AND g.owner=s.owner AND g.year_id=s.year_id JOIN colleges c ON c.owner=g.owner AND c.name=g.college AND c.active=1 LEFT JOIN student_numbers sn ON sn.owner=s.owner AND sn.year_id=s.year_id AND sn.sid=s.sid LEFT JOIN group_cohorts gc ON gc.owner=g.owner AND gc.group_id=g.id WHERE s.owner=? AND s.year_id=? AND s.active=1${scope}`).bind(a.owner,yearId,...(a.role==='admin'?[]:[a.college])).all<AccountCatalogRow>();
 const accounts=await db().prepare('SELECT a.id,a.username,a.role,a.active,g.group_id,g.year_id FROM local_accounts a LEFT JOIN group_account_assignments g ON g.account_id=a.id').all<ExistingGroupAccount>();
 const preview=validateGroupAccounts(rows,catalog.results,accounts.results,a.role==='admin'?null:a.college);
 return {yearId,rows:preview,total:preview.length,errors:preview.filter(r=>r.status==='error').length,newCount:preview.filter(r=>r.status==='new').length,existingCount:preview.filter(r=>r.status==='existing').length};
}
export async function issueGroupAccounts(a:Access,year:unknown,rows:unknown){
 if(!Array.isArray(rows)||rows.length>50)throw new Error('每批最多开通 50 个账号，系统会自动分批');
 const preview=await previewGroupAccounts(a,year,rows);if(preview.errors)throw new Error('本批名单有错误，请重新预览；本批未创建账号');
 const created=now(),expires=new Date(Date.now()+7*86400000).toISOString();
 // A pending account cannot log in. Compute one unguessable disabled placeholder per batch.
 const placeholder=await passwordRecord(crypto.randomUUID()+crypto.randomUUID());
 const queries:D1PreparedStatement[]=[],issued:{username:string;name:string;college:string;group:string;activationCode:string;expires:string}[]=[],checks=[accountWriteGuard(a),writableYearGuard(a.owner,preview.yearId)];
 for(const row of preview.rows.filter(r=>r.status==='new')){
  const id=row.reuseId??crypto.randomUUID(),code=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');normalizeUsername(row.sid);
  checks.push({sql:'EXISTS(SELECT 1 FROM roster_groups g JOIN colleges c ON c.owner=g.owner AND c.name=g.college AND c.active=1 JOIN roster_students s ON s.group_id=g.id AND s.owner=g.owner AND s.year_id=g.year_id LEFT JOIN student_numbers sn ON sn.owner=s.owner AND sn.year_id=s.year_id AND sn.sid=s.sid WHERE g.owner=? AND g.id=? AND g.year_id=? AND g.college=? AND s.active=1 AND COALESCE(sn.number,s.sid)=? AND s.name=?)',values:[a.owner,row.groupId,preview.yearId,row.college,row.sid,row.name]});
  if(row.reuseId)checks.push({sql:"EXISTS(SELECT 1 FROM local_accounts a WHERE a.id=? AND a.username=? AND a.role='group_recorder' AND a.active=0 AND NOT EXISTS(SELECT 1 FROM group_account_assignments g WHERE g.account_id=a.id))",values:[id,row.sid]});
  queries.push(row.reuseId?db().prepare('UPDATE local_accounts SET password_hash=?,salt=?,iterations=?,college=?,cohort=?,updated=? WHERE id=?').bind(placeholder.password_hash,placeholder.salt,placeholder.iterations,row.college,row.cohort,created,id):db().prepare("INSERT INTO local_accounts(id,username,password_hash,salt,iterations,role,college,cohort,active,created,updated) VALUES(?,?,?,?,?,'group_recorder',?,?,0,?,?)").bind(id,row.sid,placeholder.password_hash,placeholder.salt,placeholder.iterations,row.college,row.cohort,created,created),
   db().prepare('INSERT INTO group_account_assignments(account_id,owner,year_id,group_id,sid,name,assigned_by,created) VALUES(?,?,?,?,?,?,?,?)').bind(id,a.owner,preview.yearId,row.groupId,row.sid,row.name,a.email,created),
   db().prepare('INSERT INTO group_account_activations(account_id,token_hash,expires) VALUES(?,?,?)').bind(id,await hashActivation(code),expires),
   db().prepare('INSERT INTO account_audit(id,owner,actor,action,account_id,created,detail) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),a.owner,a.email,'issue-group-account',id,created,JSON.stringify({username:row.sid,group:row.group,yearId:preview.yearId})));
  issued.push({username:row.sid,name:row.name,college:row.college,group:row.group,activationCode:code,expires});
 }
 if(queries.length)await guardedBatch(db(),queries,checks,'名单、账号或负责范围已变化，本批未创建，请重新预览');
 return {issued,created:issued.length,skipped:preview.existingCount};
}
export async function manageGroupAccount(a:Access,username:string,action:string){
 requireAccountIssuer(a);await ensureGroupAccounts();
 const row=await db().prepare('SELECT a.id,a.college,a.active,g.group_id,g.year_id FROM local_accounts a JOIN group_account_assignments g ON g.account_id=a.id WHERE a.username=? AND g.owner=?').bind(username,a.owner).first<{id:string;college:string;active:number;group_id:string;year_id:string}>();
 if(!row||a.role!=='admin'&&row.college!==a.college)throw new Error('无权限：只能管理本院小组账号');
 await requireAccessibleYear(a,row.year_id,true);
 const created=now(),queries=[db().prepare('DELETE FROM local_sessions WHERE account_id=?').bind(row.id)];
 let activationCode:string|undefined,expires:string|undefined;
 if(action==='reset'){
  activationCode=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');expires=new Date(Date.now()+7*86400000).toISOString();
  queries.push(db().prepare('UPDATE local_accounts SET active=0,updated=? WHERE id=?').bind(created,row.id),db().prepare('INSERT INTO group_account_activations(account_id,token_hash,expires,used_at) VALUES(?,?,?,NULL) ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,used_at=NULL').bind(row.id,await hashActivation(activationCode),expires));
 }else if(action==='disable'||action==='handover'){
  queries.push(db().prepare('UPDATE local_accounts SET active=0,updated=? WHERE id=?').bind(created,row.id),db().prepare('DELETE FROM group_account_activations WHERE account_id=?').bind(row.id));
  if(action==='handover')queries.push(db().prepare('DELETE FROM group_account_assignments WHERE account_id=?').bind(row.id));
 }else throw new Error('操作不正确');
 queries.push(db().prepare('INSERT INTO account_audit(id,owner,actor,action,account_id,created,detail) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),a.owner,a.email,action+'-group-account',row.id,created,JSON.stringify({username,groupId:row.group_id})));
 await guardedBatch(db(),queries,[accountWriteGuard(a),writableYearGuard(a.owner,row.year_id),{sql:'EXISTS(SELECT 1 FROM group_account_assignments g JOIN local_accounts a ON a.id=g.account_id WHERE g.account_id=? AND g.group_id=? AND a.college=?)',values:[row.id,row.group_id,row.college]}]);
 return {username,activationCode,expires,action};
}
