export function majorityCohort(cohorts:string[]):string|null{
 const counts=new Map<string,number>();for(const cohort of cohorts)counts.set(cohort,(counts.get(cohort)??0)+1);
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
 return ranked.length&&(!ranked[1]||ranked[0][1]>ranked[1][1])?ranked[0][0]:null;
}
