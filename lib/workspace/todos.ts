import {ACTIVITY_RATINGS} from '../activity-rating';

export type TodoRole='admin'|'college_lead'|'recorder';
export type WorkspaceTodo={
 id:string;kind:'photo'|'complete'|'confirm';reason:'photo_pending'|'photo_review'|'photo_conflict'|'scores_missing'|'rating_missing'|'awaiting_confirmation';
 title:string;detail:string;date:string;colleges:string[];groupNames:string[];
 target:{type:'photo'|'event';id:string};
};
type TodoSource={
 colleges:{name:string;active:number}[];
 groups:{id:string;name:string;college:string}[];
 events:{id:string;group_id:string;status?:string;recorded:number;number?:number;date?:string;rating?:string|null}[];
 intake:{id:string;name?:string;date?:string;status:string;group_id:string|null;event_id:string|null;unresolved?:number;error?:string;upload_college?:string|null;read_only?:boolean}[];
 intakeLinks:{intake_id:string;event_id:string;group_id:string}[];
};

/** Input MUST be the per-account result of projectWorkspace, never raw database rows. */
export function buildWorkspaceTodos(source:TodoSource,role:TodoRole,archived=false):WorkspaceTodo[]{
 if(archived)return [];
 const activeColleges=new Set(source.colleges.filter(row=>row.active).map(row=>row.name));
 if(role!=='admin'&&!activeColleges.size)return [];
 const groups=new Map(source.groups.filter(row=>activeColleges.has(row.college)).map(row=>[row.id,row]));
 const events=new Map(source.events.filter(row=>groups.has(row.group_id)).map(row=>[row.id,row]));
 const links=new Map<string,TodoSource['intakeLinks']>();
 for(const link of source.intakeLinks){const related=links.get(link.intake_id)??[];related.push(link);links.set(link.intake_id,related);}
 const todos:WorkspaceTodo[]=[];
 for(const photo of source.intake){
  const related=links.get(photo.id)??[];
  const groupIds=new Set([...related.map(link=>link.group_id),...(photo.group_id?[photo.group_id]:[])]);
  if([...groupIds].some(id=>!groups.has(id)))continue;
  const eventIds=new Set([...related.map(link=>link.event_id),...(photo.event_id?[photo.event_id]:[])]);
  const relatedEvents=[...eventIds].map(id=>events.get(id));
  if(relatedEvents.length&&relatedEvents.every(event=>event?.status==='committed'))continue;
  let error=photo.error??'';
  if(relatedEvents.length&&relatedEvents.every(event=>event?.rating))error=error.replaceAll('右上角等次未能明确识别，请在活动详情中核对选择','').replace(/^；+|；+$/g,'');
  if(photo.status==='assigned'&&!photo.unresolved&&!error)continue;
  const conflict=/不一致|冲突|不同|重复且/.test(error);
  const relatedGroups=[...groupIds].map(id=>groups.get(id)!);
  todos.push({
   id:'photo:'+photo.id,kind:'photo',reason:conflict?'photo_conflict':photo.status==='pending'?'photo_pending':'photo_review',
   title:photo.name??'成绩照片',date:photo.date??'',colleges:relatedGroups.length?[...new Set(relatedGroups.map(group=>group.college))]:photo.upload_college?[photo.upload_college]:role==='admin'?[]:[...activeColleges],groupNames:relatedGroups.map(group=>group.name),
   detail:photo.read_only?'本院照片已同步；尚未归组，由上传者继续识别或管理员处理。':error||(photo.unresolved?`${photo.unresolved} 行需要核对，请对照原图检查。`:'尚未完成识别，请核对照片后重试；错传的照片可按现有权限删除。'),
   target:{type:'photo',id:photo.id},
  });
 }
 for(const event of events.values()){
  if(event.status!=='draft')continue;
  const group=groups.get(event.group_id)!;
  const hasScores=event.recorded>0,hasRating=typeof event.rating==='string'&&Object.hasOwn(ACTIVITY_RATINGS,event.rating);
  const ready=hasScores&&hasRating;
  todos.push({
   id:'event:'+event.id,kind:ready?'confirm':'complete',reason:!hasScores?'scores_missing':!hasRating?'rating_missing':'awaiting_confirmation',
   title:`${group.name} · 第 ${event.number??'?'} 次活动`,date:event.date??'',colleges:[group.college],groupNames:[group.name],
   detail:!hasScores?'草稿尚未登记成绩或出勤，请继续录入。':!hasRating?`已登记 ${event.recorded} 人，尚未选择本次活动评级。`:role==='recorder'?`已登记 ${event.recorded} 人，等待院负责人核对并确认。`:`已登记 ${event.recorded} 人，请核对照片、成绩和评级后确认。`,
   target:{type:'event',id:event.id},
  });
 }
 const priority=(todo:WorkspaceTodo)=>todo.reason==='photo_conflict'?0:todo.kind==='photo'?1:todo.kind==='complete'?2:3;
 return todos.sort((a,b)=>priority(a)-priority(b)||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
