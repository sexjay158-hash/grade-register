import {requireActiveCollege} from '@/lib/colleges';
import {access,db,json,failure,readBody,requireEditor} from '@/lib/server';
import {requireAccessibleYear} from '@/lib/semester-access';
import {assertRosterEditor} from '@/lib/role-scope';
import {normalizeCohort} from '@/lib/cohort';
import {FEATURES} from '@/lib/flags';

export async function PATCH(req:Request){try{
 if(!FEATURES.groupCohortScope)throw new Error('小组年级分配已关闭');
 const a=await access(req);requireEditor(a);const input=await readBody(req);if(a.role==='recorder')throw new Error('无权限：仅管理员和院负责人可分配小组年级');
 const yearId=await requireAccessibleYear(a,input.yearId,true);
 const group=await db().prepare('SELECT college FROM roster_groups WHERE owner=? AND year_id=? AND id=?').bind(a.owner,yearId,input.groupId).first<{college:string}>();
 if(!group)throw new Error('小组不存在');assertRosterEditor(a,group.college);await requireActiveCollege(a.owner,group.college);
 const cohort=normalizeCohort(input.cohort);
 await db().prepare('INSERT INTO group_cohorts(owner,year_id,group_id,cohort,manual) VALUES(?,?,?,?,1) ON CONFLICT(owner,group_id) DO UPDATE SET cohort=excluded.cohort,manual=1').bind(a.owner,yearId,input.groupId,cohort).run();
 return json({groupId:input.groupId,cohort});
}catch(e){return failure(e);}}
