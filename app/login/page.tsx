import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {FEATURES} from '@/lib/flags';
import {accountFromCookie,hasLocalAdmin} from '@/lib/local-auth';
import {LoginForm} from '../local-auth-forms';
import {NativeLoginForm} from '../native-login-form';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{reason?:string}>}){
 if(!FEATURES.localAccounts)redirect('/');
 if(!await hasLocalAdmin())redirect('/setup');
 if(await accountFromCookie((await headers()).get('cookie')??''))redirect('/');
 return FEATURES.nativeMobileLogin?<NativeLoginForm reason={(await searchParams).reason}/>:<LoginForm/>;
}
