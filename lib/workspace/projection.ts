import {teamLast} from '../roster-order';
import type {WorkspaceAccess,WorkspaceRows} from './types';

function countBy<T>(rows:T[],key:(row:T)=>string){
 const counts=new Map<string,number>();
 for(const row of rows){const id=key(row);counts.set(id,(counts.get(id)??0)+1);}
 return counts;
}

/** Final authorization boundary. Never cache or share its result between accounts. */
export function projectWorkspace(a:WorkspaceAccess,rows:WorkspaceRows,groupCohortScope:boolean){
 const {groups:allGroups,students:allStudents,events:allEvents,intake:allIntake,grades:allGrades,links,actors}=rows;
 const groupNames=new Map(allGroups.map(row=>[row.id,row.name]));
 const students=teamLast(a.role==='admin'?allStudents:allStudents.filter(row=>row.college===a.college&&(a.role!=='recorder'||row.management_cohort===a.cohort)),row=>groupNames.get(row.group_id)??'');
 const sidSet=new Set(students.map(row=>row.sid));
 const members=countBy(students,row=>row.group_id);
 const groups=allGroups.filter(row=>a.role==='admin'||a.role==='college_lead'&&row.college===a.college||a.role==='recorder'&&members.has(row.id)).map(row=>({...row,members:members.get(row.id)??0}));
 const groupIds=new Set(groups.map(row=>row.id));
 let events=allEvents.filter(row=>groupIds.has(row.group_id));
 const eventIds=new Set(events.map(row=>row.id));
 const grades=allGrades.filter(row=>a.role==='admin'||eventIds.has(row.event_id)&&(a.role==='college_lead'||sidSet.has(row.sid)));
 const visibleLinks=links.filter(row=>a.role==='admin'||eventIds.has(row.event_id));
 const gradeCounts=countBy(grades,row=>row.event_id);
 const actorById=new Map(actors.map(row=>[row.id,row.account_id]));
 const linksByIntake=new Map<string,typeof links>();
 for(const link of links){const related=linksByIntake.get(link.intake_id)??[];related.push(link);linksByIntake.set(link.intake_id,related);}
 const groupCollege=new Map(allGroups.map(row=>[row.id,row.college]));
 const intake=allIntake.filter(row=>{
  if(a.role==='admin')return true;
  const related=linksByIntake.get(row.id)??[];
  if(a.role==='recorder'){
   if(groupCohortScope&&(related.length||row.group_id))return related.length?related.every(link=>groupIds.has(link.group_id)):groupIds.has(row.group_id!);
   return actorById.get(row.id)===a.userId;
  }
  return related.length?related.every(link=>groupCollege.get(link.group_id)===a.college):row.group_id?groupCollege.get(row.group_id)===a.college:actorById.get(row.id)===a.userId||!!row.upload_college&&row.upload_college===a.college;
 });
 const intakeIds=new Set(intake.map(row=>row.id));
 const matchedByIntake=new Map<string,number>();
 for(const link of visibleLinks)matchedByIntake.set(link.intake_id,(matchedByIntake.get(link.intake_id)??0)+(gradeCounts.get(link.event_id)??0));
 if(a.role==='recorder'){
  const photoCounts=countBy(actors.filter(row=>row.kind==='photo'&&(groupCohortScope||row.account_id===a.userId)&&row.event_id!==null),row=>row.event_id!);
  // A photo linked both directly and through intake_event_links counts once per event.
  const intakeByEvent=new Map<string,Set<string>>();
  const add=(eventId:string|null,intakeId:string)=>{if(!eventId)return;const ids=intakeByEvent.get(eventId)??new Set<string>();ids.add(intakeId);intakeByEvent.set(eventId,ids);};
  for(const photo of intake)add(photo.event_id,photo.id);
  for(const link of visibleLinks)if(intakeIds.has(link.intake_id))add(link.event_id,link.intake_id);
  events=events.map(row=>({...row,recorded:gradeCounts.get(row.id)??0,photos:(photoCounts.get(row.id)??0)+(intakeByEvent.get(row.id)?.size??0)}));
 }
 const colleges=(a.role==='admin'?rows.colleges:rows.colleges.filter(row=>row.name===a.college)).map(row=>a.role==='recorder'?{...row,students:students.length,groups:groups.length,events:events.filter(event=>event.status==='committed').length,drafts:events.filter(event=>event.status==='draft').length}:row);
 return {
  colleges,groups,students,events,grades,
  intake:intake.map(row=>a.role==='recorder'?{...row,matched:matchedByIntake.get(row.id)??0}:a.role==='college_lead'&&!row.group_id&&!linksByIntake.get(row.id)?.length&&actorById.get(row.id)!==a.userId?{...row,read_only:true}:row),
  intakeLinks:visibleLinks.filter(link=>intakeIds.has(link.intake_id)).map(link=>a.role==='recorder'?{...link,matched:gradeCounts.get(link.event_id)??0}:link),
 };
}
