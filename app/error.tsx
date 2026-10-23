"use client";
import Link from 'next/link';
import {FEATURES} from '@/lib/flags';

export default function WorkspaceError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="auth-shell"><section className="auth-card" role="alert">
  <h1>页面暂时遇到问题</h1>
  <p>请重新加载页面。若刚才提交过名单或成绩，请先查看记录，确认后再操作。</p>
  {FEATURES.operationalSafety&&<button type="button" onClick={reset}>重试打开页面</button>}
  <p><button type="button" className="auth-help-action" onClick={()=>window.location.reload()}>重新加载系统</button> · <Link href="/login">返回登录</Link></p>
 </section></main>;
}
