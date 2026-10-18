const BASE='http://127.0.0.1:8765';
type LoopbackInit=RequestInit&{targetAddressSpace?:'loopback'};
async function localFetch(path:string,init:RequestInit,timeoutMs:number){
 const useProxy=!!(import.meta as ImportMeta & {env?:{DEV?:boolean}}).env?.DEV;
 const request:LoopbackInit={...init,...(!useProxy?{targetAddressSpace:'loopback' as const}:{}),signal:AbortSignal.timeout(timeoutMs)};
 try{return await fetch(useProxy?'/api/local-ocr':BASE+path,request);}catch{
  throw new Error('无法连接本机 RapidOCR。请在项目目录运行 npm run rapidocr，并允许浏览器访问本地网络');
 }
}
export async function checkRapidOcr():Promise<boolean>{
 try{const response=await localFetch('/health',{cache:'no-store'},5000);const data:any=await response.json();return response.ok&&data.ready===true&&data.service==='grade-register-rapidocr';}catch{return false;}
}
export async function recognizeLocalPhotoDetails(photo:Blob):Promise<{lines:string[];ratingText:string}>{
 const response=await localFetch('/recognize',{method:'POST',headers:{'Content-Type':photo.type||'image/jpeg'},body:photo},180000);
 const data:any=await response.json();
 if(!response.ok)throw new Error(data.error||'本机 RapidOCR 识别失败');
 if(!Array.isArray(data.lines)||!data.lines.every((line:unknown)=>typeof line==='string'))throw new Error('RapidOCR 返回格式错误');
 return {lines:data.lines,ratingText:typeof data.ratingText==='string'?data.ratingText:''};
}

export async function recognizeLocalPhoto(photo:Blob):Promise<string[]>{return (await recognizeLocalPhotoDetails(photo)).lines;}
