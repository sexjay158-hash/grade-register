import {redirect} from 'next/navigation';
import {FEATURES} from '@/lib/flags';
import {hasLocalAdmin} from '@/lib/local-auth';
import {bootstrapTokenConfigured} from '@/lib/bootstrap-token';
import {SetupForm} from '../local-auth-forms';
export const dynamic='force-dynamic';
export default async function Setup(){
 if(!FEATURES.localAccounts)redirect('/');
 if(await hasLocalAdmin())redirect('/login');
 return bootstrapTokenConfigured()?<SetupForm/>:<main className="auth-shell"><section className="auth-card"><img src="/arts-university-logo.png" alt="学校校徽"/><h1>等待管理员完成首次设置</h1><p>网站尚未配置管理员初始化口令。请先在运行环境中设置 ADMIN_SETUP_TOKEN，再由管理员创建账号密码。</p></section></main>;
}
