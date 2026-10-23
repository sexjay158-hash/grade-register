import {bucket} from '@/lib/server';
import {arrangeBaiduOcr,baiduAccessToken,baiduOcrError} from './baidu-ocr-response';
export async function recognizeStoredPhoto(owner:string,id:string,apiKey:string,secretKey:string){
 if(!apiKey||!secretKey)throw new Error('请先配置百度智能云识别服务');
 const tokenResponse=await fetch('https://aip.baidubce.com/oauth/2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:apiKey.trim(),client_secret:secretKey.trim()}),signal:AbortSignal.timeout(30000)});
 const token=baiduAccessToken(await tokenResponse.json());if(!tokenResponse.ok||!token)throw new Error('识别服务连接失败，请检查密钥与服务权限');
 const f=await bucket().get(`${owner}/${id}`);if(!f)throw new Error('照片暂不可用');
 const bytes=new Uint8Array(await f.arrayBuffer());if(bytes.length>3*1024*1024)throw new Error('照片超过识别限制，请上传压缩后的照片（3 MB 以下）');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const response=await fetch('https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({image:btoa(binary),probability:'true'}),signal:AbortSignal.timeout(60000)});
 const result:unknown=await response.json(),error=baiduOcrError(result);if(!response.ok||error)throw new Error(`识别服务返回错误（${error??response.status}），请检查额度、权限或照片`);
 return arrangeBaiduOcr(result);
}
