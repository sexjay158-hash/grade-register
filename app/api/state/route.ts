import {requireAccessibleYear} from '@/lib/semester-access';
import {teamLast} from '@/lib/roster-order';
import {access,db,json,failure} from '@/lib/server';
import {requireYear} from '@/lib/yearly-rosters';
import {listColleges} from '@/lib/colleges';
import {FEATURES} from '@/lib/flags';
import {ensureActivityRatings} from '@/lib/activity-rating-store';
import {cohortExpr,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';

export async function GET(req:Request){try{
 const a=await access(req),u=a.owner,d=db(),yearId=await requireAccessibleYear(a,new URL(req.url).searchParams.get('yearId'));
 if(FEATURES.activityRating)await ensureActivityRatings();
 const ratingColumn=FEATURES.activityRating?'ar.rating AS rating':'NULL AS rating';
 const ratingJoin=FEATURES.activityRating?' LEFT JOIN event_ratings ar ON ar.event_id=e.id AND ar.owner=e.owner':'';
 const [allColleges,g,s,e,i,grades,links,actors]=await Promise.all([
  listColleges(u,yearId),
  d.prepare('SELECT g.id,g.name,g.college,gc.cohort AS responsible_cohort FROM roster_groups g LEFT JOIN group_cohorts gc ON gc.owner=g.owner AND gc.group_id=g.id WHERE g.owner=? AND g.year_id=? ORDER BY g.college,g.name').bind(u,yearId).all<{id:string;name:string;college:string}>(),
  d.prepare(`SELECT s.sid,COALESCE(sn.number,s.sid) AS student_number,s.name,s.college,s.group_id,s.position,${cohortExpr()} AS cohort,${scopeCohortExpr()} AS management_cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.active=1 ORDER BY s.position`).bind(u,yearId).all<{sid:string;name:string;college:string;group_id:string;position:number;cohort:string;management_cohort:string}>(),
  d.prepare(`SELECT e.*,${ratingColumn}, ((SELECT COUNT(*) FROM photos p WHERE p.event_id=e.id)+(SELECT COUNT(*) FROM intake_event_links l WHERE l.event_id=e.id)) AS photos, (SELECT COUNT(*) FROM scores x WHERE x.event_id=e.id AND x.state<>'unrecorded') AS recorded FROM events e JOIN roster_groups g ON g.id=e.group_id${ratingJoin} WHERE e.owner=? AND g.year_id=? ORDER BY e.updated DESC`).bind(u,yearId).all<{id:string;group_id:string;recorded:number}>(),
  d.prepare('SELECT i.id,i.batch_id,i.name,i.date,i.status,i.group_id,i.event_id,i.matched,i.unresolved,i.error,i.created FROM intake i JOIN roster_intakes y ON y.intake_id=i.id WHERE i.owner=? AND y.year_id=? ORDER BY i.created DESC').bind(u,yearId).all<{id:string;group_id:string|null;event_id:string|null;matched:number;status:string}>(),
  d.prepare("SELECT x.sid,x.score,x.state,e.id AS event_id,e.number,e.group_id,e.status AS event_status FROM scores x JOIN events e ON e.id=x.event_id JOIN roster_groups g ON g.id=e.group_id WHERE e.owner=? AND g.year_id=? AND x.state<>'unrecorded'").bind(u,yearId).all<{sid:string;event_id:string;group_id:string}>(),
  d.prepare('SELECT l.intake_id,l.event_id,e.group_id,g.name AS group_name,l.matched,e.status AS event_status FROM intake_event_links l JOIN events e ON e.id=l.event_id JOIN roster_groups g ON g.id=e.group_id WHERE l.owner=? AND g.year_id=?').bind(u,yearId).all<{intake_id:string;event_id:string;group_id:string;matched:number}>(),
  d.prepare("SELECT pa.kind,pa.id,pa.account_id,p.event_id FROM photo_actors pa LEFT JOIN photos p ON p.id=pa.id AND p.owner=pa.owner WHERE pa.owner=?").bind(u).all<{kind:string;id:string;account_id:string;event_id:string|null}>()
 ]);
 const groupNames=new Map(g.results.map(row=>[row.id,row.name]));
 const students=teamLast(a.role==='admin'?s.results:s.results.filter(row=>row.college===a.college&&(a.role!=='recorder'||row.management_cohort===a.cohort)),row=>groupNames.get(row.group_id)??'');
 const sidSet=new Set(students.map(row=>row.sid));
 const groupIds=new Set(students.map(row=>row.group_id));
 const groups=g.results.filter(row=>a.role==='admin'||a.role==='college_lead'&&row.college===a.college||a.role==='recorder'&&groupIds.has(row.id)).map(row=>({...row,members:students.filter(student=>student.group_id===row.id).length}));
 const visibleGroupIds=new Set(groups.map(row=>row.id));
 let visibleEvents=e.results.filter(row=>visibleGroupIds.has(row.group_id));
 const eventIds=new Set(visibleEvents.map(row=>row.id));
 const visibleGrades=grades.results.filter(row=>a.role==='admin'||eventIds.has(row.event_id)&&(a.role==='college_lead'||sidSet.has(row.sid)));
 const visibleLinks=links.results.filter(row=>a.role==='admin'||eventIds.has(row.event_id));
 const actorById=new Map(actors.results.map(row=>[row.id,row.account_id]));
 const linksByIntake=new Map<string,typeof links.results>();for(const link of links.results){const arr=linksByIntake.get(link.intake_id)??[];arr.push(link);linksByIntake.set(link.intake_id,arr);}
 const groupCollege=new Map(g.results.map(row=>[row.id,row.college]));
 const intakes=i.results.filter(row=>{
  if(a.role==='admin')return true;
  if(a.role==='recorder'){const related=linksByIntake.get(row.id)??[];if(FEATURES.groupCohortScope&&(related.length||row.group_id))return related.length?related.every(link=>visibleGroupIds.has(link.group_id)):visibleGroupIds.has(row.group_id!);return actorById.get(row.id)===a.userId;}
  const related=linksByIntake.get(row.id)??[];
  return related.length?related.every(link=>groupCollege.get(link.group_id)===a.college):row.group_id?groupCollege.get(row.group_id)===a.college:actorById.get(row.id)===a.userId;
 }).map(row=>a.role==='recorder'?{...row,matched:visibleLinks.filter(link=>link.intake_id===row.id).reduce((n,link)=>n+visibleGrades.filter(grade=>grade.event_id===link.event_id).length,0)}:row);
 const intakeIds=new Set(intakes.map(row=>row.id));
 if(a.role==='recorder')visibleEvents=visibleEvents.map(row=>({...row,recorded:visibleGrades.filter(grade=>grade.event_id===row.id).length,photos:actors.results.filter(photo=>photo.kind==='photo'&&(FEATURES.groupCohortScope||photo.account_id===a.userId)&&photo.event_id===row.id).length+intakes.filter(photo=>photo.event_id===row.id||visibleLinks.some(link=>link.event_id===row.id&&link.intake_id===photo.id)).length}));
 const collegeRows=(a.role==='admin'?allColleges:allColleges.filter(row=>row.name===a.college)).map(row=>a.role==='recorder'?{...row,students:students.length,groups:groups.length,events:visibleEvents.filter(event=>(event as any).status==='committed').length,drafts:visibleEvents.filter(event=>(event as any).status==='draft').length}:row);
 const semester=await d.prepare('SELECT y.id,y.label,y.created,ar.archived_at FROM roster_years y LEFT JOIN semester_archives ar ON ar.owner=y.owner AND ar.year_id=y.id WHERE y.owner=? AND y.id=?').bind(u,yearId).first();
 return json({yearId,semester,colleges:collegeRows,groups,students,events:visibleEvents,grades:visibleGrades,intake:intakes,intakeLinks:visibleLinks.filter(link=>intakeIds.has(link.intake_id)).map(link=>a.role==='recorder'?{...link,matched:visibleGrades.filter(grade=>grade.event_id===link.event_id).length}:link)});
}catch(e){return failure(e);}}
