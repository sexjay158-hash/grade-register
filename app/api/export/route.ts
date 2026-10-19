import {requireAccessibleYear} from '@/lib/semester-access';
import {access,db,json,failure} from '@/lib/server';
import {requireYear} from '@/lib/yearly-rosters';
import {FEATURES} from '@/lib/flags';
import {convertedScore,type ActivityRating} from '@/lib/activity-rating';
import {ensureActivityRatings} from '@/lib/activity-rating-store';
import {cohortExpr,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';

export async function GET(req:Request){try{
 const a=await access(req),u=a.owner,yearId=await requireAccessibleYear(a,new URL(req.url).searchParams.get('yearId'));
 if(FEATURES.activityRating)await ensureActivityRatings();
 const ratingColumn=FEATURES.activityRating?'ar.rating AS rating':'NULL AS rating';
 const ratingJoin=FEATURES.activityRating?' LEFT JOIN event_ratings ar ON ar.event_id=e.id AND ar.owner=e.owner':'';
 const rows=await db().prepare(`SELECT x.sid,COALESCE(sn.number,s.sid) AS student_number,x.score,x.state,x.note,e.number,e.group_id,e.date,s.college,${cohortExpr()} AS cohort,${scopeCohortExpr()} AS management_cohort,${ratingColumn} FROM scores x JOIN events e ON x.event_id=e.id JOIN roster_groups g ON g.id=e.group_id JOIN roster_students s ON s.owner=g.owner AND s.year_id=g.year_id AND s.sid=x.sid ${cohortJoin()}${ratingJoin} WHERE e.owner=? AND g.year_id=? AND e.status='committed'`).bind(u,yearId).all<{score:number|null;state:string;rating:ActivityRating|null;college:string;cohort:string;management_cohort:string}>();
 return json(rows.results.filter(row=>a.role==='admin'||row.college===a.college&&(a.role!=='recorder'||row.management_cohort===a.cohort)).map(row=>({...row,converted_score:convertedScore(row.score,row.state,row.rating)})));
}catch(e){return failure(e);}}
