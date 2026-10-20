import {initializeOnce} from './query-initialization';
import {db,now,type Access} from '@/lib/server';
import {cohortExpr,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';
import {ensureYearlyRoster,cleanRosterText} from '@/lib/yearly-rosters';

export type College={id:string;name:string;active:number;students:number;groups:number;events:number;drafts:number};

// Existing roster names become school-level college records without changing any grades.
export async function ensureColleges(owner:string){
 await initializeOnce('college-schema:'+owner,()=>ensureCollegesUncached(owner));
}
async function ensureCollegesUncached(owner:string){
 await ensureYearlyRoster(owner);
 const d=db();
 await d.prepare('CREATE TABLE IF NOT EXISTS colleges(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(owner,name))').run();
 const count=await d.prepare('SELECT COUNT(*) AS n FROM colleges WHERE owner=?').bind(owner).first<{n:number}>();
 if(count?.n)return;
 const source=await d.prepare("SELECT DISTINCT college AS name FROM roster_students WHERE owner=? AND college<>'' UNION SELECT DISTINCT college AS name FROM roster_groups WHERE owner=? AND college<>''").bind(owner,owner).all<{name:string}>();
 if(source.results.length){const t=now();await d.batch(source.results.map(row=>d.prepare('INSERT OR IGNORE INTO colleges(id,owner,name,active,created,updated) VALUES(?,?,?,1,?,?)').bind(crypto.randomUUID(),owner,row.name,t,t)));}
}

export async function listColleges(owner:string,yearId:string,college?:string):Promise<College[]>{
 await ensureColleges(owner);
 const rows=await db().prepare(`SELECT c.id,c.name,c.active,
  (SELECT COUNT(*) FROM roster_students s WHERE s.owner=c.owner AND s.year_id=? AND s.college=c.name AND s.active=1) AS students,
  (SELECT COUNT(*) FROM roster_groups g WHERE g.owner=c.owner AND g.year_id=? AND g.college=c.name) AS groups,
  (SELECT COUNT(*) FROM events e JOIN roster_groups g ON g.id=e.group_id WHERE e.owner=c.owner AND g.year_id=? AND g.college=c.name AND e.status='committed') AS events,
  (SELECT COUNT(*) FROM events e JOIN roster_groups g ON g.id=e.group_id WHERE e.owner=c.owner AND g.year_id=? AND g.college=c.name AND e.status='draft') AS drafts
  FROM colleges c WHERE c.owner=? ${college?'AND c.name=?':''} ORDER BY c.active DESC,c.name`).bind(yearId,yearId,yearId,yearId,owner,...(college?[college]:[])).all<College>();
 return rows.results;
}

export async function requireActiveCollege(owner:string,value:unknown){
 const name=cleanRosterText(value,'学院名称');
 await ensureColleges(owner);
 const row=await db().prepare('SELECT active FROM colleges WHERE owner=? AND name=?').bind(owner,name).first<{active:number}>();
 if(row&&!row.active)throw new Error(`${name}已归档，请在学院管理中恢复后再操作`);
 if(!row){const t=now();await db().prepare('INSERT INTO colleges(id,owner,name,active,created,updated) VALUES(?,?,?,1,?,?)').bind(crypto.randomUUID(),owner,name,t,t).run();}
 return name;
}

export async function requireExistingActiveCollege(owner:string,value:unknown){
 const name=cleanRosterText(value,'学院名称');
 await ensureColleges(owner);
 const row=await db().prepare('SELECT active FROM colleges WHERE owner=? AND name=?').bind(owner,name).first<{active:number}>();
 if(!row)throw new Error('学院不存在，请刷新学院列表后重新选择');
 if(!row.active)throw new Error(`${name}已归档，请先在学院管理中恢复`);
 return name;
}

// Directory counts follow the same cohort boundary as the state and export APIs.
export async function listCollegesForAccess(a:Access,yearId:string):Promise<College[]>{
 const all=await listColleges(a.owner,yearId);
 const visible=a.role==='admin'?all:all.filter(row=>row.name===a.college);
 if(a.role!=='recorder')return visible;
 const d=db(),scope=`s.owner=? AND s.year_id=? AND s.college=? AND s.active=1 AND ${scopeCohortExpr()}=?`;
 const [students,events]=await d.batch([
  d.prepare(`SELECT COUNT(*) AS students,COUNT(DISTINCT s.group_id) AS groups FROM roster_students s ${cohortJoin()} WHERE ${scope}`).bind(a.owner,yearId,a.college,a.cohort),
  d.prepare(`SELECT e.status,COUNT(*) AS n FROM events e WHERE e.owner=? AND e.group_id IN (SELECT s.group_id FROM roster_students s ${cohortJoin()} WHERE ${scope}) GROUP BY e.status`).bind(a.owner,a.owner,yearId,a.college,a.cohort)
 ]);
 const counts=students.results[0] as {students:number;groups:number};
 const byStatus=new Map((events.results as {status:string;n:number}[]).map(row=>[row.status,row.n]));
 return visible.map(row=>({...row,...counts,events:byStatus.get('committed')??0,drafts:byStatus.get('draft')??0}));
}
