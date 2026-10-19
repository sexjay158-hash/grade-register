import {normalizeCohort} from './cohort';
export const studentNumber=(student:{sid:string;student_number?:string})=>student.student_number??student.sid;
export function rosterCohort(number:string,value?:unknown){try{return normalizeCohort(value,number);}catch{try{return value?normalizeCohort(value):'';}catch{return '';}}}
