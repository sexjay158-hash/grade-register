import type {Access} from '../server';
import type {College} from '../colleges';

// Database rows at the workspace boundary. Additional selected columns pass through unchanged.
export type GroupRow = {id:string; name:string; college:string; responsible_cohort?:string|null};
export type StudentRow = {sid:string; name:string; college:string; group_id:string; position:number; cohort:string; management_cohort:string};
export type EventRow = {id:string; group_id:string; recorded:number; status?:string; photos?:number};
export type IntakeRow = {id:string; group_id:string|null; event_id:string|null; matched:number; status:string};
export type GradeRow = {sid:string; event_id:string; group_id:string};
export type LinkRow = {intake_id:string; event_id:string; group_id:string; matched:number};
export type ActorRow = {kind:string; id:string; account_id:string; event_id:string|null};
export type WorkspaceRows = {
 colleges:College[]; groups:GroupRow[]; students:StudentRow[]; events:EventRow[];
 intake:IntakeRow[]; grades:GradeRow[]; links:LinkRow[]; actors:ActorRow[];
};
export type WorkspaceAccess = Pick<Access,'role'|'college'|'cohort'|'userId'>;
