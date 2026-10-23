import {nativeLoginMessage} from '@/lib/native-login';

export function NativeLoginForm({reason=''}:{reason?:string}){
 const error=nativeLoginMessage(reason);
 return <main className="auth-shell"><section className="auth-card">
  <div className="auth-brand"><img src="/arts-university-logo.png" alt="学校校徽"/><div><strong>课外锻炼</strong><span>全校成绩登记</span></div></div>
  <h1>账号密码登录</h1><p>请使用管理员分配给你的系统账号和密码。</p>
  <form action="/api/auth/login" method="post" className="auth-form native-login-form">
   <label>账号<input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" placeholder="输入管理员分配的账号" required maxLength={32}/></label>
   <label>密码<input name="password" type="password" autoComplete="current-password" placeholder="输入密码" required maxLength={128}/></label>
   {error&&<p className="auth-error" role="alert">{error}</p>}
   <button type="submit">登录系统</button>
  </form><p className="auth-help"><a href="/activate">首次使用小组账号？输入激活码设置密码</a></p><p className="auth-help">忘记账号或密码，请联系学校管理员重置。</p>
 </section></main>;
}
