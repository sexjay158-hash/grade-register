import {FEATURES} from '@/lib/flags';
import {access,requireEditor,json,failure} from '@/lib/server';

async function authorize(req:Request){
 if(!(import.meta as ImportMeta & {env?:{DEV?:boolean}}).env?.DEV)throw new Error('无权限：本机识别转发仅供本地验收使用');
 const a=await access(req);requireEditor(a);if(FEATURES.adminRecognitionSettings&&a.role!=='admin')throw new Error('无权限：本机识别设置仅管理员可操作');
}
export async function GET(req:Request){try{
 await authorize(req);
 const response=await fetch('http://127.0.0.1:8765/health',{signal:AbortSignal.timeout(5000)});
 return json(await response.json(),response.status);
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 await authorize(req);
 const type=req.headers.get('content-type')?.split(';')[0]??'';
 if(!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('请选择 JPG、PNG 或 WebP 图片');
 if(Number(req.headers.get('content-length'))>3*1024*1024)throw new Error('图片太大，请压缩后重试');
 const image=await req.arrayBuffer();if(image.byteLength>3*1024*1024)throw new Error('图片太大，请压缩后重试');
 const response=await fetch('http://127.0.0.1:8765/recognize',{method:'POST',headers:{'Content-Type':type},body:image,signal:AbortSignal.timeout(180000)});
 return json(await response.json(),response.status);
}catch(e){return failure(e);}}
