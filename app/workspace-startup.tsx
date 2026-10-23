"use client";
import Link from 'next/link';
export function WorkspaceStartup({error,loading,onRetry}:{error:string;loading:boolean;onRetry:()=>void}){
 return <main className="auth-shell"><section className="auth-card" aria-busy={loading}>
  <div className="auth-brand"><img src="/arts-university-logo.png" alt="学校校徽"/><div><strong>课外锻炼</strong><span>全校成绩登记</span></div></div>
  <h1>{error?'暂时未能进入系统':'正在进入系统'}</h1>
  <p role={error?'alert':'status'}>{error||'正在加载页面和账号数据，请稍候…'}</p>
  {error&&<button type="button" className="auth-link" disabled={loading} onClick={onRetry}>{loading?'正在重试…':'重试进入系统'}</button>}
  <p className="auth-help"><button type="button" className="auth-help-action" onClick={()=>window.location.reload()}>重新加载页面</button>{error.includes('登录')&&<> · <Link href="/login">返回登录</Link></>}</p>
  <noscript><p>请在浏览器中启用 JavaScript 后重新加载页面。</p></noscript>
 </section></main>;
}
