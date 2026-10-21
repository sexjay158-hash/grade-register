"use client";
import {FEATURES} from '@/lib/flags';

export default function WorkspaceError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="auth-shell"><section className="auth-card" role="alert">
  <h1>页面暂时遇到问题</h1>
  <p>请重新加载页面。若刚才提交过名单或成绩，请先查看记录，确认后再操作。</p>
  {FEATURES.operationalSafety&&<button type="button" onClick={reset}>重试打开页面</button>}
  <p><a href="/">重新加载系统</a> · <a href="/login">返回登录</a></p>
 </section></main>;
}
