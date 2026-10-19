import {db} from './server';
import {FEATURES} from './flags';
import {normalizeCohort} from './cohort';
import {majorityCohort} from './group-cohort-domain';

export async function refreshGroupCohorts(owner:string,yearId:string){
 if(!FEATURES.groupCohortScope)return;
 await db().prepare(`WITH counts AS (
 SELECT group_id,substr(COALESCE((SELECT number FROM student_numbers sn WHERE sn.owner=roster_students.owner AND sn.year_id=roster_students.year_id AND sn.sid=roster_students.sid),sid),1,4) AS cohort,COUNT(*) AS n FROM roster_students
 WHERE owner=? AND year_id=? AND active=1 AND substr(COALESCE((SELECT number FROM student_numbers sn WHERE sn.owner=roster_students.owner AND sn.year_id=roster_students.year_id AND sn.sid=roster_students.sid),sid),1,4) GLOB '[12][0-9][0-9][0-9]' GROUP BY group_id,substr(COALESCE((SELECT number FROM student_numbers sn WHERE sn.owner=roster_students.owner AND sn.year_id=roster_students.year_id AND sn.sid=roster_students.sid),sid),1,4)
 ),ranked AS (SELECT *,DENSE_RANK() OVER(PARTITION BY group_id ORDER BY n DESC) AS rank FROM counts),
 winners AS (SELECT group_id,CASE WHEN COUNT(*)=1 THEN MAX(cohort) ELSE NULL END AS cohort FROM ranked WHERE rank=1 GROUP BY group_id)
 INSERT INTO group_cohorts(owner,year_id,group_id,cohort,manual)
 SELECT ?,?,group_id,cohort,0 FROM winners WHERE 1
 ON CONFLICT(owner,group_id) DO UPDATE SET cohort=excluded.cohort
 WHERE group_cohorts.manual=0 AND group_cohorts.cohort IS NOT excluded.cohort
 AND NOT EXISTS(SELECT 1 FROM semester_archives ar WHERE ar.owner=group_cohorts.owner AND ar.year_id=group_cohorts.year_id)`).bind(owner,yearId,owner,yearId).run();
}
export async function cohortForGroup(owner:string,yearId:string,college:string,name:string,fallback:string){
 if(!FEATURES.groupCohortScope)return fallback;
 const row=await db().prepare('SELECT gc.cohort FROM roster_groups g LEFT JOIN group_cohorts gc ON gc.owner=g.owner AND gc.group_id=g.id WHERE g.owner=? AND g.year_id=? AND g.college=? AND g.name=?').bind(owner,yearId,college,name).first<{cohort:string|null}>();
 return row?row.cohort??'':fallback;
}
export async function cohortForImportedGroup(owner:string,yearId:string,college:string,name:string,rows:{college:string;group:string;cohort:string}[]){
 const fallback=majorityCohort(rows.filter(row=>row.college===college&&row.group===name).map(row=>row.cohort).filter(Boolean));
 return cohortForGroup(owner,yearId,college,name,fallback??'');
}
