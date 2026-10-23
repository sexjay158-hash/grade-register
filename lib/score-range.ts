export const SCORE_RANGE_MESSAGE='成绩须为 0～100 的数字';
export function isValidScore(value:unknown):value is number{
 return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
}
