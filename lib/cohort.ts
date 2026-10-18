import {FEATURES} from './flags';
export function normalizeCohort(value:unknown,sid?:string){
 const text=String(value??'').trim().normalize('NFKC').replace(/级$/,'').trim();
 const raw=/^\d{2}$/.test(text)?'20'+text:text;
 const inferred=String(sid??'').slice(0,4);
 const cohort=(FEATURES.sidCohort&&sid?inferred:raw)||(/^\d{4}$/.test(inferred)?inferred:'');
 if(!/^\d{4}$/.test(cohort)||Number(cohort)<2000||Number(cohort)>2100)throw new Error(FEATURES.sidCohort&&sid?'学号前四位须为入学年份，例如 2024；请检查学号':'请填写入学年级，例如 24级或2024级');
 return cohort;
}
