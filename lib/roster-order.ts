import {FEATURES} from './flags';

export function isCollegeTeam(name:string){return /院队|学院代表队/.test(name);}

// Stable partition keeps the order supplied by the roster within each section.
export function teamLast<T>(rows:T[],groupName:(row:T)=>string):T[]{
 if(FEATURES.preserveExcelOrder||!FEATURES.collegeTeamLast)return rows;
 return [...rows.filter(row=>!isCollegeTeam(groupName(row))),...rows.filter(row=>isCollegeTeam(groupName(row)))];
}
