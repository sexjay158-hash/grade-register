export class BrowserRequestError extends Error{
 status:number;
 constructor(message:string,status=0){super(message);this.status=status;this.name='BrowserRequestError';}
}

// Bound reads and writes, including response parsing. Only safe reads may be retried.
export async function requestJson<T=unknown>(path:string,init:RequestInit={},options:{timeoutMs?:number;retries?:number}={}):Promise<T>{
 const method=(init.method??'GET').toUpperCase(),read=method==='GET',retries=read?(options.retries??1):0;
 for(let attempt=0;;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),options.timeoutMs??15000);
  const abort=()=>controller.abort();init.signal?.addEventListener('abort',abort,{once:true});
  if(init.signal?.aborted)controller.abort();
  try{
   const response=await fetch(path,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(read&&[502,503,504].includes(response.status)&&attempt<retries){await response.body?.cancel();continue;}
   const data=await response.json() as T&{error?:string};
   if(!response.ok)throw new BrowserRequestError(data.error??'请求失败，请稍后重试',response.status);
   return data;
  }catch(error){
   if(error instanceof BrowserRequestError)throw error;
   if(init.signal?.aborted)throw new BrowserRequestError('请求已取消');
   if(read&&attempt<retries&&(controller.signal.aborted||error instanceof TypeError))continue;
   if(controller.signal.aborted)throw new BrowserRequestError(read?'读取超时，请检查网络后重新加载':'请求超时，操作可能已保存，请刷新核对后再试');
   if(error instanceof TypeError)throw new BrowserRequestError('网络连接中断，请检查网络后重试');
   throw new BrowserRequestError('服务器响应不完整，请重新加载');
  }finally{clearTimeout(timeout);init.signal?.removeEventListener('abort',abort);}
 }
}

// Storage is an optional preference. Private browsing or blocked storage must not prevent login.
export function readBrowserPreference(key:string):string|null{
 try{return typeof window==='undefined'?null:window.localStorage.getItem(key);}catch{return null;}
}
export function saveBrowserPreference(key:string,value:string){
 try{if(typeof window!=='undefined')window.localStorage.setItem(key,value);}catch{}
}
