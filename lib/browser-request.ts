export class BrowserRequestError extends Error{
 status:number;
 code?:string;
 constructor(message:string,status=0,code?:string){super(message);this.status=status;this.code=code;this.name='BrowserRequestError';}
}

export function waitForRetry(ms:number,signal?:AbortSignal|null){return new Promise<void>((resolve,reject)=>{
 const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(new BrowserRequestError('请求已取消'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
 signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
});}

// Bound reads and writes, including response parsing. Only safe reads may be retried.
export async function requestJson<T=unknown>(path:string,init:RequestInit={},options:{timeoutMs?:number;retries?:number}={}):Promise<T>{
 const method=(init.method??'GET').toUpperCase(),read=method==='GET',retries=read?(options.retries??1):0;
 for(let attempt=0;;attempt++){
  if(attempt)await waitForRetry(300*2**(attempt-1)+Math.random()*300,init.signal);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),options.timeoutMs??15000);
  const abort=()=>controller.abort();init.signal?.addEventListener('abort',abort,{once:true});
  if(init.signal?.aborted)controller.abort();
  try{
   const response=await fetch(path,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(read&&[502,503,504].includes(response.status)&&attempt<retries){await response.body?.cancel();continue;}
   let data:T&{error?:string;code?:string};
   try{data=await response.json();}catch(error){
    if(controller.signal.aborted)throw error;
    if(!response.ok)throw new BrowserRequestError(read?'服务暂不可用，请稍后重新加载':'服务响应异常，操作可能已保存，请刷新核对后再试',response.status);
    throw error;
   }
   if(!response.ok)throw new BrowserRequestError(data?.error??'请求失败，请稍后重试',response.status,data?.code);
   return data;
  }catch(error){
   if(error instanceof BrowserRequestError)throw error;
   if(init.signal?.aborted)throw new BrowserRequestError('请求已取消');
   if(read&&attempt<retries&&(controller.signal.aborted||error instanceof TypeError))continue;
   if(controller.signal.aborted)throw new BrowserRequestError(read?'读取超时，请检查网络后重新加载':'请求超时，操作可能已保存，请刷新核对后再试');
   if(error instanceof TypeError)throw new BrowserRequestError(read?'网络连接中断，请检查网络后重试':'网络连接中断，操作可能已保存，请刷新核对后再试');
   throw new BrowserRequestError(read?'服务器响应不完整，请重新加载':'服务器响应不完整，操作可能已保存，请刷新核对后再试');
  }finally{clearTimeout(timeout);init.signal?.removeEventListener('abort',abort);}
 }
}

// Only LOGIN_BUSY guarantees that no password check or session creation was started.
// Never automatically repeat a timed-out or otherwise ambiguous login POST.
export async function loginWithWaiting(value:{username:string;password:string},waiting:()=>void,signal?:AbortSignal,options:{maxWaitMs?:number;retryDelay?:()=>number}={}){
 return authenticationWithWaiting('/api/auth/login',value,waiting,signal,options);
}
export async function activateWithWaiting(value:{username:string;code:string;password:string},waiting:()=>void,signal?:AbortSignal,options:{maxWaitMs?:number;retryDelay?:()=>number}={}){
 return authenticationWithWaiting('/api/auth/activate',value,waiting,signal,options);
}
async function authenticationWithWaiting(path:string,value:unknown,waiting:()=>void,signal?:AbortSignal,options:{maxWaitMs?:number;retryDelay?:()=>number}={}){
 const end=Date.now()+(options.maxWaitMs??300000);
 let rejections=0;
 for(;;){
  try{return await requestJson(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal},{timeoutMs:20000});}
  catch(error){
   if(!(error instanceof BrowserRequestError)||error.status!==503||error.code!=='LOGIN_BUSY')throw error;
   const base=Math.min(15000,3000*2**Math.min(rejections++,3));
   const delay=options.retryDelay?.()??base*(1+Math.random());
   if(Date.now()+delay>=end)throw new BrowserRequestError('登录人数较多，请稍后再次登录',503,'LOGIN_BUSY');
   waiting();await waitForRetry(delay,signal);
  }
 }
}

// Storage is optional. Blocked storage must not prevent login.
export function readBrowserPreference(key:string):string|null{
 try{return typeof window==='undefined'?null:window.localStorage.getItem(key);}catch{return null;}
}
export function saveBrowserPreference(key:string,value:string){
 try{if(typeof window!=='undefined')window.localStorage.setItem(key,value);}catch{}
}

// The timeout must cover downloading the body, not just receiving response headers.
export async function requestPhoto(path:string,timeoutMs=45000):Promise<Blob>{
 for(let attempt=0;;attempt++){
  if(attempt)await waitForRetry(500+Math.random()*500);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if([502,503,504].includes(response.status)&&attempt===0){await response.body?.cancel();continue;}
   if(!response.ok)throw new BrowserRequestError(response.status===401?'登录已过期，请重新登录':response.status===403?'无权限：不能读取这张照片':'照片读取失败，请刷新后重试',response.status);
   const blob=await response.blob();if(!blob.size)throw new BrowserRequestError('照片内容为空，请重新加载');return blob;
  }catch(error){
   if(error instanceof BrowserRequestError)throw error;
   if(!attempt&&(controller.signal.aborted||error instanceof TypeError))continue;
   throw new BrowserRequestError(controller.signal.aborted?'照片读取超时，请检查网络后重试':'照片读取中断，请检查网络后重试');
  }finally{clearTimeout(timer);}
 }
}
