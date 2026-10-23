import {db,type Access} from './server';
import {requireYear,yearForIntake} from './yearly-rosters';
import {FEATURES} from './flags';

export async function requireAccessibleYear(a:Access,value:unknown,write=false){
 const id=await requireYear(a.owner,value);
 if(a.groupYearId&&id!==a.groupYearId)throw new Error('无权限：只能访问账号分配的学期');
 if(FEATURES.semesterArchives){
  const archived=await db().prepare('SELECT year_id FROM semester_archives WHERE owner=? AND year_id=?').bind(a.owner,id).first();
  if(archived&&a.role!=='admin')throw new Error('无权限：归档学期仅管理员可以查看');
  if(archived&&write)throw new Error('归档学期只读，请先在学期归档中恢复后操作');
 }
 return id;
}
export async function requireIntakeSemester(a:Access,id:string,write=false){return requireAccessibleYear(a,await yearForIntake(a.owner,id),write);}
