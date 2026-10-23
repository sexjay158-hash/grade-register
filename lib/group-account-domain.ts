export type GroupAccountInput={sid:string;name:string;college:string;cohort:string;group:string};
export type AccountCatalogRow={sid:string;name:string;college:string;group_id:string;group_name:string;cohort:string|null};
export type ExistingGroupAccount={id:string;username:string;group_id:string|null;year_id:string|null;role?:string;active?:number};
export function validateGroupAccounts(input:unknown,catalog:AccountCatalogRow[],accounts:ExistingGroupAccount[],college:string|null){
 if(!Array.isArray(input)||!input.length||input.length>2000)throw new Error('每次请导入 1～2000 个小组负责人');
 const byNumber=new Map<string,AccountCatalogRow[]>();for(const row of catalog){const list=byNumber.get(row.sid)??[];list.push(row);byNumber.set(row.sid,list);}
 const existing=new Map(accounts.map(row=>[row.username,row]));
 const occupied=new Map(accounts.filter(row=>row.group_id).map(row=>[row.group_id!,row.username]));
 const numbers=new Set<string>(),groups=new Set<string>();
 return input.map((value,index)=>{
  const row={sid:String(value?.sid??'').trim(),name:String(value?.name??'').trim(),college:String(value?.college??'').trim(),cohort:String(value?.cohort??'').trim().replace(/级$/,''),group:String(value?.group??'').trim()};
  if(/^\d{2}$/.test(row.cohort))row.cohort='20'+row.cohort;
  let error='';let match:AccountCatalogRow|undefined;
  if(!/^\d{6,24}$/.test(row.sid)||!row.name||!row.college||!row.group)error='学号须为 6～24 位数字，姓名、学院、小组必填';
  else if(college&&row.college!==college)error='无权限：只能开通本院小组账号';
  else if(numbers.has(row.sid))error='本文件学号重复';
  else {
   const found=(byNumber.get(row.sid)??[]).filter(s=>s.college===row.college&&s.group_name===row.group&&s.name===row.name);
   if(found.length!==1)error='学号、姓名、小组与本学期正式名单不唯一匹配，请先审核或导入名单';
   else {match=found[0];if(row.cohort&&row.cohort!==(match.cohort??row.sid.slice(0,4)))error='填写年级与小组负责年级不一致';
    else if(groups.has(match.group_id))error='本文件同一小组重复分配';
    else if(existing.has(row.sid)&&existing.get(row.sid)?.group_id!==match.group_id&&!(existing.get(row.sid)?.role==='group_recorder'&&existing.get(row.sid)?.active===0&&!existing.get(row.sid)?.group_id))error='账号已被占用或绑定其他小组，请先办理交接';
    else if(occupied.has(match.group_id)&&occupied.get(match.group_id)!==row.sid)error='小组已分配负责人，请先停用并交接原账号';
   }
  }
  numbers.add(row.sid);if(match)groups.add(match.group_id);
  return {...row,cohort:match?.cohort||(row.cohort||row.sid.slice(0,4)),row:index+2,groupId:match?.group_id??'',reuseId:existing.get(row.sid)?.group_id?undefined:existing.get(row.sid)?.id,status:error?'error':existing.get(row.sid)?.group_id===match?.group_id?'existing':'new',error};
 });
}
