import {isRatingAnnotation} from './activity-rating';

type Location={left:number;top:number;width:number;height:number};
type Word={words:string;location?:Location};

function object(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
export function baiduAccessToken(value:unknown):string|null{
 const token=object(value)?.access_token;
 return typeof token==='string'&&token.length>0?token:null;
}
export function baiduOcrError(value:unknown):string|null{
 const error=object(value)?.error_code;
 return typeof error==='number'||typeof error==='string'?String(error):null;
}
function location(value:unknown):Location|undefined{
 const row=object(value);if(!row)return;
 const {left,top,width,height}=row;
 if(typeof left==='number'&&typeof top==='number'&&typeof width==='number'&&typeof height==='number'&&[left,top,width,height].every(Number.isFinite)&&width>=0&&height>=0)return {left,top,width,height};
}
export function arrangeBaiduOcr(value:unknown){
 const raw=object(value)?.words_result;
 if(!Array.isArray(raw))throw new Error('识别服务返回内容格式不正确，请稍后重试');
 if(raw.length>1000)throw new Error('识别服务返回文字过多，请分开拍摄后重试');
 const words:Word[]=raw.map(item=>{
  const row=object(item);
  if(typeof row?.words!=='string'||row.words.length>300)throw new Error('识别服务返回文字格式不正确，请稍后重试');
  return {words:row.words,location:location(row.location)};
 });
 const located=words.filter((word):word is Word&{location:Location}=>!!word.location);
 const right=Math.max(0,...located.map(word=>word.location.left+word.location.width));
 const bottom=Math.max(0,...located.map(word=>word.location.top+word.location.height));
 const top=Math.min(bottom,...located.map(word=>word.location.top));
 const inCorner=(word:Word&{location:Location})=>right>0&&bottom>top&&word.location.left+word.location.width/2>=right*0.55&&word.location.top+word.location.height/2<=top+(bottom-top)*0.30;
 const corner=located.filter(inCorner);
 const ratingText=corner.toSorted((a,b)=>a.location.top-b.location.top||a.location.left-b.location.left).map(word=>word.words).join(' ');
 const ratingWords=new Set<Word>(corner.filter(word=>isRatingAnnotation(word.words)));
 const bands:{y:number;h:number;items:Word[]}[]=[];
 for(const word of words.filter(item=>!ratingWords.has(item)).toSorted((a,b)=>(a.location?.top??0)-(b.location?.top??0))){
  if(!word.location){bands.push({y:-10000,h:0,items:[word]});continue;}
  const y=word.location.top+word.location.height/2,h=word.location.height;
  const band=bands.find(item=>Math.abs(item.y-y)<Math.max(6,Math.min(item.h,h)*0.55));
  if(band)band.items.push(word);else bands.push({y,h,items:[word]});
 }
 return {lines:bands.map(band=>band.items.toSorted((a,b)=>(a.location?.left??0)-(b.location?.left??0)).map(word=>word.words).join(' ')),ratingText};
}
