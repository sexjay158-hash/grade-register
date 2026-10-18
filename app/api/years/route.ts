import {db,access,requireAdmin,json,failure,readBody,now} from '@/lib/server';
import {ensureYearlyRoster,cleanRosterText} from '@/lib/yearly-rosters';
import {requireAccessibleYear} from '@/lib/semester-access';
import {FEATURES} from '@/lib/flags';

export async function GET(req:Request){try{
 const a=await access(req);await ensureYearlyRoster(a.owner);
 const archived=new URL(req.url).searchParams.get('archived')==='1';if(archived)requireAdmin(a);
 const rows=await db().prepare(`SELECT y.id,y.label,y.created,y.updated,ar.archived_at,ar.archived_by,
 (SELECT COUNT(*) FROM roster_students s WHERE s.owner=y.owner AND s.year_id=y.id AND s.active=1) AS students,
 (SELECT COUNT(*) FROM events e JOIN roster_groups g ON g.id=e.group_id WHERE e.owner=y.owner AND g.year_id=y.id) AS events
 FROM roster_years y LEFT JOIN semester_archives ar ON ar.owner=y.owner AND ar.year_id=y.id WHERE y.owner=? ${FEATURES.semesterArchives?(archived?'AND ar.year_id IS NOT NULL':'AND ar.year_id IS NULL'):''} ORDER BY y.created DESC`).bind(a.owner).all();
 return json(rows.results.map(row=>a.role==='admin'?row:{id:row.id,label:row.label,created:row.created,updated:row.updated}));
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const a=await access(req);requireAdmin(a);await ensureYearlyRoster(a.owner);const d=db(),input=await readBody(req),label=cleanRosterText(input.label,'学期名称',80),id=crypto.randomUUID(),t=now();
 if(await d.prepare('SELECT id FROM roster_years WHERE owner=? AND label=?').bind(a.owner,label).first())throw new Error('该学期名称已存在');
 const previous=FEATURES.semesterArchives&&input.archivePreviousYearId?await requireAccessibleYear(a,input.archivePreviousYearId,true):null;
 await d.batch([d.prepare('INSERT INTO roster_years(id,owner,label,created,updated) VALUES(?,?,?,?,?)').bind(id,a.owner,label,t,t),...(previous?[d.prepare('INSERT INTO semester_archives(owner,year_id,archived_at,archived_by) VALUES(?,?,?,?)').bind(a.owner,previous,t,a.email)]:[])]);
 return json({id,label});
}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{
 const a=await access(req);requireAdmin(a);await ensureYearlyRoster(a.owner);const d=db(),input=await readBody(req),id=await requireAccessibleYear(a,input.id);
 if(['archive','restore'].includes(input.action)){
  if(!FEATURES.semesterArchives)throw new Error('学期归档功能已关闭');
  if(input.action==='restore')await d.prepare('DELETE FROM semester_archives WHERE owner=? AND year_id=?').bind(a.owner,id).run();
  else{
   if(!await d.prepare('SELECT y.id FROM roster_years y WHERE y.owner=? AND y.id<>? AND NOT EXISTS(SELECT 1 FROM semester_archives ar WHERE ar.owner=y.owner AND ar.year_id=y.id) LIMIT 1').bind(a.owner,id).first())throw new Error('请先创建新学期，再归档当前学期');
   await d.prepare('INSERT OR IGNORE INTO semester_archives(owner,year_id,archived_at,archived_by) VALUES(?,?,?,?)').bind(a.owner,id,now(),a.email).run();
  }
  return json({id,archived:input.action==='archive'});
 }
 await requireAccessibleYear(a,id,true);const label=cleanRosterText(input.label,'学期名称',80);
 if(await d.prepare('SELECT id FROM roster_years WHERE owner=? AND label=? AND id<>?').bind(a.owner,label,id).first())throw new Error('该学期名称已存在');
 await d.prepare('UPDATE roster_years SET label=?,updated=? WHERE id=? AND owner=?').bind(label,now(),id,a.owner).run();return json({id,label});
}catch(e){return failure(e);}}
