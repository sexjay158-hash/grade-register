import {FEATURES} from './flags';
import {initializeOnce} from './query-initialization';
import type {Access} from './server';

export type WriteGuard={sql:string;values:unknown[]};
export class MutationRejectedError extends Error{}
// Preconditions and writes must run in the same transaction. Throwing after batch()
// has committed cannot undo a partially applied recognition or roster import.
export async function guardedBatch(d:D1Database,queries:D1PreparedStatement[],checks:WriteGuard[],message='数据已变化，请刷新核对后重试'){
 if(!FEATURES.atomicMutations)return d.batch(queries);
 await initializeOnce('write-guard-schema',()=>d.prepare('CREATE TABLE IF NOT EXISTS mutation_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CONSTRAINT mutation_precondition CHECK(valid=1))').run());
 const id=crypto.randomUUID();
 const guards=checks.map(check=>d.prepare(`INSERT INTO mutation_guards(id,valid) SELECT ?,CASE WHEN (${check.sql}) THEN 1 ELSE 0 END ON CONFLICT(id) DO UPDATE SET valid=excluded.valid`).bind(id,...check.values));
 try{
  const result=await d.batch([...guards,...queries,d.prepare('DELETE FROM mutation_guards WHERE id=?').bind(id)]);
  return result.slice(guards.length,-1);
 }catch(error){if(String(error).includes('mutation_precondition'))throw new MutationRejectedError(message);throw error;}
}
export const writableYearGuard=(owner:string,yearId:string):WriteGuard=>({sql:'EXISTS(SELECT 1 FROM roster_years WHERE owner=? AND id=?) AND NOT EXISTS(SELECT 1 FROM semester_archives WHERE owner=? AND year_id=?)',values:[owner,yearId,owner,yearId]});
export const writableGroupGuard=(owner:string,groupId:string,a?:Access):WriteGuard=>({sql:'EXISTS(SELECT 1 FROM roster_groups g JOIN colleges c ON c.owner=g.owner AND c.name=g.college WHERE g.owner=? AND g.id=? AND c.active=1 AND NOT EXISTS(SELECT 1 FROM semester_archives ar WHERE ar.owner=g.owner AND ar.year_id=g.year_id)'+(a&&a.role!=='admin'?' AND g.college=?'+(a.groupId?' AND g.id=? AND g.year_id=?':a.role==='recorder'?' AND EXISTS(SELECT 1 FROM group_cohorts gc WHERE gc.owner=g.owner AND gc.group_id=g.id AND gc.cohort=?)':''):'')+')',values:[owner,groupId,...(a&&a.role!=='admin'?[a.college,...(a.groupId?[a.groupId,a.groupYearId]:a.role==='recorder'?[a.cohort]:[])]:[])]});
export const accountWriteGuard=(a:Access):WriteGuard=>FEATURES.localAccounts?{sql:'EXISTS(SELECT 1 FROM local_accounts WHERE id=? AND active=1 AND role=? AND college IS ? AND cohort IS ?)'+(a.groupId?' AND EXISTS(SELECT 1 FROM group_account_assignments WHERE account_id=? AND group_id=? AND year_id=?)':''),values:[a.userId,a.groupId?'group_recorder':a.role,a.college,a.cohort,...(a.groupId?[a.userId,a.groupId,a.groupYearId]:[])]}:{sql:'1',values:[]};
