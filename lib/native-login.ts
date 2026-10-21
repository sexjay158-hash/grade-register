// Native POST remains usable before JavaScript has downloaded or hydrated.
export const nativeLoginMessage=(reason:string)=>({invalid:'账号或密码不正确，请重新输入。',busy:'当前登录人数较多，请稍候几秒再登录。',limited:'尝试次数过多，请 15 分钟后再试。',unavailable:'登录服务暂不可用，请稍后重试。'}[reason]??'');
export async function handleNativeLogin(req:Request,authenticate:(req:Request)=>Promise<Response>){
 if(req.headers.get('origin')!==new URL(req.url).origin)return new Response('请求来源不正确',{status:403});
 const redirect=(location:string,cookie?:string|null)=>{const headers=new Headers({'Location':location,'Cache-Control':'no-store'});if(cookie)headers.set('Set-Cookie',cookie);return new Response(null,{status:303,headers});};
 try{
  const reader=req.body?.getReader(),parts:Uint8Array[]=[];let bytes=0;
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return redirect('/login?reason=invalid');}parts.push(value);}
  const all=new Uint8Array(bytes);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.byteLength;}
  const form=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(all));
  const headers=new Headers(req.headers);headers.set('Content-Type','application/json');headers.delete('content-length');
  const response=await authenticate(new Request(req.url,{method:'POST',headers,body:JSON.stringify({username:form.get('username')??'',password:form.get('password')??''})}));
  if(response.ok)return redirect('/',response.headers.get('set-cookie'));
  const data=await response.json().catch(()=>({})) as {code?:string};
  const reason=response.status===401?'invalid':response.status===429?'limited':data.code==='LOGIN_BUSY'?'busy':'unavailable';
  return redirect('/login?reason='+reason);
 }catch{return redirect('/login?reason=unavailable');}
}
