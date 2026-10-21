import {FEATURES} from './flags';

// Keep the stored `pass` key for the 60% tier so historical grades need no rewrite.
export type ActivityRating = 'excellent' | 'good' | 'pass' | 'poor' | 'none';

export const ACTIVITY_RATINGS: Record<ActivityRating, {label:string; rate:number}> = {
 excellent: {label:'优',rate:1},
 good: {label:'良',rate:0.8},
 pass: {label:FEATURES.fiveLevelRating?'中':'合格',rate:0.6},
 poor: {label:'差',rate:0.5},
 none: {label:'无',rate:0}
};

export function activityRatingOptions(current?:ActivityRating|null):ActivityRating[]{
 const values:ActivityRating[]=FEATURES.fiveLevelRating?['excellent','good','pass','poor','none']:['excellent','good','pass'];
 // A UI rollback must still display already saved new grades correctly.
 if(current&&Object.hasOwn(ACTIVITY_RATINGS,current)&&!values.includes(current))values.push(current);
 return values;
}

export const ACTIVITY_RATING_RULES=activityRatingOptions().map(value=>`${ACTIVITY_RATINGS[value].label} ${ACTIVITY_RATINGS[value].rate*100}%`).join('、');
export const ACTIVITY_RATING_LABELS=activityRatingOptions().map(value=>ACTIVITY_RATINGS[value].label).join('、');

const aliases:Record<string,ActivityRating>={优:'excellent',优秀:'excellent',良:'good',良好:'good',中:'pass',中等:'pass',合格:'pass',及格:'pass',差:'poor',无:'none'};
function photoRatingChoices(value:string){
 // Single-character tiers must not match names, 中午, 无故缺席 or other prose.
 const text=value.replace(/(?:评定级别|评定等级|活动等次|活动评级|评级|等级|级别|等次|评定)[\s：:]*(?=(?:优秀|良好|中等|合格|及格|优|良|中|差|无)(?![\u3400-\u9fffA-Za-z0-9]))/g,' ');
 return new Set([...text.matchAll(/(?<![\u3400-\u9fffA-Za-z0-9])(?:优秀|良好|中等|合格|及格|优|良|中|差|无)(?![\u3400-\u9fffA-Za-z0-9])/g)].map(match=>aliases[match[0]]));
}

export function isRatingAnnotation(value:unknown):boolean{
 return typeof value==='string'&&value.length<=200&&(/等次|评级|等级|级别|不\s*(?:合格|及格)/.test(value)||photoRatingChoices(value).size>0);
}

// A photo with several listed options cannot tell us which option was selected.
export function ratingFromPhotoText(value:unknown):ActivityRating|null {
 if(typeof value!=='string'||value.length>200)return null;
 if(/不\s*(?:合格|及格)/.test(value))return null;
 const found=photoRatingChoices(value);
 return found.size===1?[...found][0]:null;
}

export function requireActivityRating(value:unknown):ActivityRating {
 if(typeof value==='string'&&Object.hasOwn(ACTIVITY_RATINGS,value))return value as ActivityRating;
 throw new Error('请选择'+ACTIVITY_RATING_LABELS);
}

export function convertedScore(score:number|null,state:string,rating:ActivityRating|null|undefined):number|null {
 if(state!=='scored'||score===null||score===undefined||!rating||!Object.hasOwn(ACTIVITY_RATINGS,rating))return null;
 const scaled=score*ACTIVITY_RATINGS[rating].rate*100;
 return Math.round(scaled+Number.EPSILON*Math.max(1,Math.abs(scaled)))/100;
}
