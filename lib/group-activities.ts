import type {ActivityRating} from './activity-rating';

export type ArchiveGroup={id:string;name:string;college:string;members:number;responsible_cohort?:string|null};
export type GroupActivity={id:string;group_id:string;number:number;date:string;status:string;photos:number;recorded:number;rating:ActivityRating|null};
// Use the already authorized, semester-scoped workspace data; never merge by group name.
export function groupActivityArchives(groups:ArchiveGroup[],events:GroupActivity[]){
 const byGroup=new Map(groups.map(group=>[group.id,{group,activities:[] as GroupActivity[],committed:0,drafts:0,photos:0}]));
 for(const event of events){
  const archive=byGroup.get(event.group_id);if(!archive)continue;
  archive.activities.push(event);
  if(event.status==='committed')archive.committed++;else if(event.status==='draft')archive.drafts++;
  archive.photos+=event.photos;
 }
 for(const archive of byGroup.values())archive.activities.sort((a,b)=>b.number-a.number||b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return [...byGroup.values()];
}
