/** Shared HTTP primitives; no database, credentials or framework imports. */
export class HttpError extends Error {
 status:number;
 code:string;
 constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;this.name='HttpError';}
}

export function json(data:unknown,status=200,headers:HeadersInit={}){
 const result=new Headers(headers);result.set('Cache-Control','no-store');
 return Response.json(data,{status,headers:result});
}

export async function readJsonBody(req:Request,maxBytes=2_000_000):Promise<Record<string,any>>{
 const declared=req.headers.get('content-length');
 if(declared&&/^\d+$/.test(declared)&&Number(declared)>maxBytes)throw new HttpError(413,'BODY_TOO_LARGE','请求内容过大');
 const reader=req.body?.getReader();
 if(!reader)throw new HttpError(400,'INVALID_JSON','请求格式不正确');
 const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){await reader.cancel();throw new HttpError(413,'BODY_TOO_LARGE','请求内容过大');}
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  const value=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'INVALID_JSON','请求格式不正确');
  return value;
 }catch(error){
  if(error instanceof HttpError)throw error;
  if(error instanceof SyntaxError||error instanceof TypeError)throw new HttpError(400,'INVALID_JSON','请求格式不正确');
  throw error;
 }finally{reader.releaseLock();}
}

export function failure(error:unknown){
 const requestId=crypto.randomUUID();
 let status=500,code='INTERNAL_ERROR',message='服务暂时无法完成操作，请稍后重试';
 if(error instanceof HttpError){status=error.status;code=error.code;message=error.message;}
 else if(error instanceof Error){
  const raw=error.message;
  if(/D1_|SQLITE|R2_|Network connection lost|fetch failed/i.test(raw)){
   status=503;code='SERVICE_UNAVAILABLE';message='数据服务暂不可用，请刷新核对后重试';
  }else if(/[\u3400-\u9fff]/.test(raw)){
   // Preserve existing localized domain validation while new modules adopt HttpError.
   status=raw.includes('登录')?401:/无权限|尚未获得使用权限|已绑定其他账号/.test(raw)?403:400;
   code=status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':'VALIDATION_ERROR';message=raw;
  }
 }
 // Never log request bodies, student information, credentials or raw database errors.
 console.error(JSON.stringify({event:'request_failed',requestId,status,code}));
 return json({error:message,code,requestId},status,{'X-Request-ID':requestId});
}
