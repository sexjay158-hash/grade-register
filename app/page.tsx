import Workspace from './workspace';
import {requireChatGPTUser} from './chatgpt-auth';
import {FEATURES} from '@/lib/flags';
import {accountFromCookie,hasLocalAdmin} from '@/lib/local-auth';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Home(){
 if(FEATURES.localAccounts){
  if(!await hasLocalAdmin())redirect('/setup');
  const h=await headers();if(!await accountFromCookie(h.get('cookie')??''))redirect('/login');
 }else if(FEATURES.sharedRoles)await requireChatGPTUser('/');
 return <Workspace/>;
}
