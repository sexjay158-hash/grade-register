import {bucket} from '@/lib/server';
export async function recognizeStoredPhoto(owner:string,id:string,apiKey:string,secretKey:string){
 if(!apiKey||!secretKey)throw new Error('请先配置百度智能云识别服务');
 const tokenResponse=await fetch('https://aip.baidubce.com/oauth/2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:apiKey.trim(),client_secret:secretKey.trim()}),signal:AbortSignal.timeout(30000)});
 const token:any=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)throw new Error('识别服务连接失败，请检查密钥与服务权限');
 const f=await bucket().get(`${owner}/${id}`);if(!f)throw new Error('照片暂不可用');
 const bytes=new Uint8Array(await f.arrayBuffer());if(bytes.length>3*1024*1024)throw new Error('照片超过识别限制，请上传压缩后的照片（3 MB 以下）');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const response=await fetch('https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting?access_token='+encodeURIComponent(token.access_token),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({image:btoa(binary),probability:'true'}),signal:AbortSignal.timeout(60000)});
 const result:any=await response.json();if(!response.ok||result.error_code)throw new Error(`识别服务返回错误（${result.error_code??response.status}），请检查额度、权限或照片`);
 const words=(result.words_result??[]).filter((x:any)=>typeof x.words==='string'),bands:{y:number;h:number;items:any[]}[]=[];
 const located=words.filter((w:any)=>w.location&&Number.isFinite(w.location.left)&&Number.isFinite(w.location.top)),right=Math.max(0,...located.map((w:any)=>w.location.left+w.location.width)),bottom=Math.max(0,...located.map((w:any)=>w.location.top+w.location.height)),top=Math.min(bottom,...located.map((w:any)=>w.location.top));
 const inCorner=(w:any)=>right>0&&bottom>top&&w.location.left+w.location.width/2>=right*0.55&&w.location.top+w.location.height/2<=top+(bottom-top)*0.30;
 const ratingText=located.filter(inCorner).sort((a:any,b:any)=>(a.location.top-b.location.top)||(a.location.left-b.location.left)).map((w:any)=>w.words).join(' ');
 const ratingWords=new Set(located.filter((w:any)=>inCorner(w)&&/优|良|合格|及格|等次|评级|等级/.test(w.words)));
 for(const w of words.filter((w:any)=>!ratingWords.has(w)).sort((a:any,b:any)=>(a.location?.top??0)-(b.location?.top??0))){
  if(!w.location){bands.push({y:-10000,h:0,items:[w]});continue;}
  const y=w.location.top+w.location.height/2,h=w.location.height,band=bands.find(b=>Math.abs(b.y-y)<Math.max(6,Math.min(b.h,h)*0.55));
  if(band)band.items.push(w);else bands.push({y,h,items:[w]});
 }
 return {lines:bands.map(b=>b.items.sort((a:any,b:any)=>(a.location?.left??0)-(b.location?.left??0)).map((w:any)=>w.words).join(' ')),ratingText};
}
