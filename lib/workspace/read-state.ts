import {createReadBatch} from '../read-batch';
import {db,type Access} from '../server';
import {listColleges} from '../colleges';
import {FEATURES} from '../flags';
import {ensureActivityRatings} from '../activity-rating-store';
import {cohortExpr,scopeCohortExpr,cohortJoin} from '../role-scope';
import type {GroupRow,StudentRow,EventRow,IntakeRow,GradeRow,LinkRow,ActorRow} from './types';
import {projectWorkspace} from './projection';
import {buildWorkspaceTodos} from './todos';
import {ensureIntakeUploadScopes} from '../intake-upload-scope';

// Query orchestration stays server-only; projection is independently testable.
export async function readWorkspaceState(a:Access,yearId:string){
 const u=a.owner,d=db();
 if(FEATURES.activityRating)await ensureActivityRatings();
 await ensureIntakeUploadScopes();
 const scoped=FEATURES.concurrentQueries&&a.role!=='admin',studentWhere=scoped?` AND s.college=?${a.role==='recorder'?` AND ${scopeCohortExpr()}=?`:''}`:'';
 const studentParams=scoped?[u,yearId,a.college,...(a.role==='recorder'?[a.cohort]:[])]:[u,yearId];
 const eventWhere=scoped?' AND g.college=?':'',eventParams=scoped?[u,yearId,a.college]:[u,yearId];
 const ratingColumn=FEATURES.activityRating?'ar.rating AS rating':'NULL AS rating';
 const ratingJoin=FEATURES.activityRating?' LEFT JOIN event_ratings ar ON ar.event_id=e.id AND ar.owner=e.owner':'';
 const read=createReadBatch(d);
 const [allColleges,g,s,e,i,grades,links,actors]=await Promise.all([
  listColleges(u,yearId,scoped?a.college??undefined:undefined),
  read<GroupRow>(d.prepare('SELECT g.id,g.name,g.college,gc.cohort AS responsible_cohort FROM roster_groups g LEFT JOIN group_cohorts gc ON gc.owner=g.owner AND gc.group_id=g.id WHERE g.owner=? AND g.year_id=? ORDER BY g.college,g.name').bind(u,yearId)),
  read<StudentRow>(d.prepare(`SELECT s.sid,COALESCE(sn.number,s.sid) AS student_number,s.name,s.college,s.group_id,s.position,${cohortExpr()} AS cohort,${scopeCohortExpr()} AS management_cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.year_id=? AND s.active=1${studentWhere} ORDER BY s.position`).bind(...studentParams)),
  read<EventRow>(d.prepare(`SELECT e.*,${ratingColumn}, ((SELECT COUNT(*) FROM photos p WHERE p.event_id=e.id)+(SELECT COUNT(*) FROM intake_event_links l WHERE l.event_id=e.id)) AS photos, (SELECT COUNT(*) FROM scores x WHERE x.event_id=e.id AND x.state<>'unrecorded') AS recorded FROM events e JOIN roster_groups g ON g.id=e.group_id${ratingJoin} WHERE e.owner=? AND g.year_id=?${eventWhere} ORDER BY e.updated DESC`).bind(...eventParams)),
  read<IntakeRow>(d.prepare(`SELECT i.id,i.batch_id,i.name,i.date,i.status,i.group_id,i.event_id,i.matched,i.unresolved,i.error,i.created,${FEATURES.collegePhotoSharing?'c.name':'NULL'} AS upload_college FROM intake i JOIN roster_intakes y ON y.intake_id=i.id LEFT JOIN intake_upload_scopes us ON us.owner=i.owner AND us.intake_id=i.id LEFT JOIN colleges c ON c.owner=us.owner AND c.id=us.college_id WHERE i.owner=? AND y.year_id=? ORDER BY i.created DESC`).bind(u,yearId)),
  read<GradeRow>(d.prepare(`SELECT x.sid,x.score,x.state,e.id AS event_id,e.number,e.group_id,e.status AS event_status FROM scores x JOIN events e ON e.id=x.event_id JOIN roster_groups g ON g.id=e.group_id WHERE e.owner=? AND g.year_id=? AND x.state<>'unrecorded'${eventWhere}`).bind(...eventParams)),
  read<LinkRow>(d.prepare('SELECT l.intake_id,l.event_id,e.group_id,g.name AS group_name,l.matched,e.status AS event_status FROM intake_event_links l JOIN events e ON e.id=l.event_id JOIN roster_groups g ON g.id=e.group_id WHERE l.owner=? AND g.year_id=?').bind(u,yearId)),
  a.role==='admin'?Promise.resolve({results:[] as ActorRow[]}):read<ActorRow>(d.prepare(`
   SELECT pa.kind,pa.id,pa.account_id,p.event_id FROM photo_actors pa
   LEFT JOIN photos p ON p.id=pa.id AND p.owner=pa.owner
   WHERE pa.owner=? AND (
    (pa.kind='photo' AND EXISTS(SELECT 1 FROM events e JOIN roster_groups g ON g.id=e.group_id WHERE e.id=p.event_id AND e.owner=pa.owner AND g.year_id=?))
    OR (pa.kind='intake' AND EXISTS(SELECT 1 FROM roster_intakes y WHERE y.intake_id=pa.id AND y.owner=pa.owner AND y.year_id=?))
   )`).bind(u,yearId,yearId))
 ]);
 const semester=await d.prepare('SELECT y.id,y.label,y.created,ar.archived_at FROM roster_years y LEFT JOIN semester_archives ar ON ar.owner=y.owner AND ar.year_id=y.id WHERE y.owner=? AND y.id=?').bind(u,yearId).first();
 const visible=projectWorkspace(a,{colleges:allColleges,groups:g.results,students:s.results,events:e.results,intake:i.results,grades:grades.results,links:links.results,actors:actors.results},FEATURES.groupCohortScope);
 return {yearId,semester,...visible,todos:FEATURES.todoDashboard?buildWorkspaceTodos(visible,a.role,!!semester?.archived_at):[]};
}
