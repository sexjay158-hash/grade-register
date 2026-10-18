import {refreshGroupCohorts} from './group-cohorts';
import {db,now} from '@/lib/server';

export const defaultSchoolYear=()=>{const d=new Date();const year=d.getFullYear()-(d.getMonth()<7?1:0);return `${year}—${year+1}学年`;};
export const legacyYearId=(owner:string)=>`legacy:${owner}`;

// Additive storage keeps the original roster intact for rollback. The first read copies it once.
export async function ensureYearlyRoster(owner:string){
 const d=db();
 await d.batch([
  d.prepare('CREATE TABLE IF NOT EXISTS roster_years(id TEXT PRIMARY KEY,owner TEXT NOT NULL,label TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL)'),
  d.prepare('CREATE TABLE IF NOT EXISTS roster_groups(id TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL,college TEXT NOT NULL,name TEXT NOT NULL,UNIQUE(owner,year_id,college,name))'),
  d.prepare('CREATE TABLE IF NOT EXISTS roster_students(owner TEXT NOT NULL,year_id TEXT NOT NULL,sid TEXT NOT NULL,name TEXT NOT NULL,college TEXT NOT NULL,group_id TEXT NOT NULL,position INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner,year_id,sid))'),
  d.prepare('CREATE TABLE IF NOT EXISTS group_cohorts(owner TEXT NOT NULL,year_id TEXT NOT NULL,group_id TEXT NOT NULL,cohort TEXT,manual INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,group_id))'),
  d.prepare('CREATE INDEX IF NOT EXISTS roster_student_group_scope ON roster_students(owner,year_id,group_id,active)'),
  d.prepare('CREATE TABLE IF NOT EXISTS semester_archives(owner TEXT NOT NULL,year_id TEXT NOT NULL,archived_at TEXT NOT NULL,archived_by TEXT NOT NULL,PRIMARY KEY(owner,year_id))'),
  d.prepare('CREATE TABLE IF NOT EXISTS roster_intakes(intake_id TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL)')
 ]);
 const id=legacyYearId(owner),existing=await d.prepare('SELECT id FROM roster_years WHERE id=? AND owner=?').bind(id,owner).first();
 if(!existing){const t=now();await d.batch([
  d.prepare('INSERT OR IGNORE INTO roster_years(id,owner,label,created,updated) VALUES(?,?,?,?,?)').bind(id,owner,defaultSchoolYear(),t,t),
  d.prepare("INSERT OR IGNORE INTO roster_groups(id,owner,year_id,college,name) SELECT g.id,g.owner,?,COALESCE((SELECT s.college FROM students s WHERE s.group_id=g.id AND s.owner=g.owner LIMIT 1),''),g.name FROM groups g WHERE g.owner=?").bind(id,owner),
  d.prepare('INSERT OR IGNORE INTO roster_students(owner,year_id,sid,name,college,group_id,position,active) SELECT owner,?,sid,name,college,group_id,position,1 FROM students WHERE owner=?').bind(id,owner),
  d.prepare('INSERT OR IGNORE INTO roster_intakes(intake_id,owner,year_id) SELECT id,owner,? FROM intake WHERE owner=?').bind(id,owner)
 ]);}
 return id;
}
export async function requireYear(owner:string,yearId:unknown){
 await ensureYearlyRoster(owner);
 const id=typeof yearId==='string'&&yearId?yearId:legacyYearId(owner);
 if(!await db().prepare('SELECT id FROM roster_years WHERE id=? AND owner=?').bind(id,owner).first())throw new Error('学年档案不存在，请刷新页面');
 await refreshGroupCohorts(owner,id);
 return id;
}
export async function yearForIntake(owner:string,intakeId:string){
 await ensureYearlyRoster(owner);
 const row=await db().prepare('SELECT year_id FROM roster_intakes WHERE intake_id=? AND owner=?').bind(intakeId,owner).first<{year_id:string}>();
 if(!row)throw new Error('找不到照片所属学年');
 return row.year_id;
}
export function cleanRosterText(value:unknown,label:string,max=150){const text=String(value??'').trim();if(!text||text.length>max)throw new Error(`${label}不能为空且不能超过 ${max} 字`);return text;}
