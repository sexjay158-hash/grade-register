export type ActivityRating = 'excellent' | 'good' | 'pass';

export const ACTIVITY_RATINGS: Record<ActivityRating, {label:string; rate:number}> = {
 excellent: {label:'优',rate:1},
 good: {label:'良',rate:0.8},
 pass: {label:'合格',rate:0.6}
};

// A photo with several listed options cannot tell us which option was selected.
export function ratingFromPhotoText(value:unknown):ActivityRating|null {
 if(typeof value!=='string'||value.length>200)return null;
 const text=value.replace(/\s|[：:，,。·（）()\[\]【】]/g,'');
 const found=new Set<ActivityRating>();
 if(/优(?:秀)?/.test(text))found.add('excellent');
 if(/良(?:好)?/.test(text))found.add('good');
 if(/(?<!不)(?:合格|及格)/.test(text))found.add('pass');
 return found.size===1?[...found][0]:null;
}

export function requireActivityRating(value:unknown):ActivityRating {
 if(value==='excellent'||value==='good'||value==='pass')return value;
 throw new Error('请选择优、良或合格');
}

export function convertedScore(score:number|null,state:string,rating:ActivityRating|null|undefined):number|null {
 if(state!=='scored'||score===null||score===undefined||!rating)return null;
 return Math.round(score*ACTIVITY_RATINGS[rating].rate*100)/100;
}
