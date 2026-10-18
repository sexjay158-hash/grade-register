import type {OcrResultItem} from '@paddleocr/paddleocr-js';

type BrowserOcr=Awaited<ReturnType<typeof import('@paddleocr/paddleocr-js')['PaddleOCR']['create']>>;
let enginePromise:Promise<BrowserOcr>|null=null;

export function browserOcrSupported(){return typeof window!=='undefined'&&typeof WebAssembly!=='undefined'&&typeof createImageBitmap==='function';}

export async function initializeBrowserOcr(){
 if(!browserOcrSupported())throw new Error('当前浏览器不支持免费网页识别，请改用本机 RapidOCR');
 if(!enginePromise)enginePromise=import('@paddleocr/paddleocr-js').then(({PaddleOCR})=>PaddleOCR.create({
  lang:'ch',ocrVersion:'PP-OCRv5',worker:false,
  ortOptions:{backend:'wasm',numThreads:1,simd:true,wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'}
 })).catch(error=>{enginePromise=null;throw new Error(`网页识别模型加载失败：${error instanceof Error?error.message:String(error)}`);});
 return enginePromise;
}

type Positioned={index:number;text:string;x:number;y:number;height:number};
function bounds(item:OcrResultItem,index:number):Positioned|null{
 if(!item.text?.trim()||!Array.isArray(item.poly)||!item.poly.length)return null;
 const xs=item.poly.map(point=>point[0]),ys=item.poly.map(point=>point[1]);
 if([...xs,...ys].some(value=>!Number.isFinite(value)))return null;
 return {index,text:item.text.trim(),x:Math.min(...xs),y:(Math.min(...ys)+Math.max(...ys))/2,height:Math.max(...ys)-Math.min(...ys)};
}

export function arrangeBrowserOcr(items:OcrResultItem[],width:number,height:number){
 const positioned=items.map(bounds).filter((item):item is Positioned=>!!item);
 const ratingItems=positioned.filter(item=>item.x>=width*0.55&&item.y<=height*0.30).sort((a,b)=>a.y-b.y||a.x-b.x);
 const ratingText=ratingItems.map(item=>item.text).join(' ');
 const ratingIndexes=new Set(ratingItems.filter(item=>/优|良|合格|及格|等次|评级|等级/.test(item.text)).map(item=>item.index));
 const bands:{y:number;height:number;items:Positioned[]}[]=[];
 for(const item of positioned.filter(item=>!ratingIndexes.has(item.index)).sort((a,b)=>a.y-b.y)){
  const band=bands.find(candidate=>Math.abs(candidate.y-item.y)<Math.max(6,Math.min(candidate.height,item.height)*0.55));
  if(band)band.items.push(item);else bands.push({y:item.y,height:item.height,items:[item]});
 }
 return {lines:bands.map(band=>band.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')),ratingText};
}

export async function recognizeBrowserPhotoDetails(photo:Blob):Promise<{lines:string[];ratingText:string}>{
 const engine=await initializeBrowserOcr();
 const [result]=await engine.predict(photo);
 if(!result||!Array.isArray(result.items))throw new Error('网页识别没有返回有效结果');
 return arrangeBrowserOcr(result.items,result.image.width,result.image.height);
}
