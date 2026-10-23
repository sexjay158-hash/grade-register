import {FEATURES} from '@/lib/flags';
import {accountFromCookie,hasLocalAdmin} from '@/lib/local-auth';
import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {ManageRegistrations} from '@/app/group-registration-forms';
import '@/app/group-registration.css';
export const dynamic='force-dynamic';
export default async function ManagePage({searchParams}:{searchParams:Promise<{yearId?:string}>}){
 if(!FEATURES.groupRegistration)notFound();
 if(FEATURES.localAccounts){
  if(!await hasLocalAdmin())redirect('/setup');
  const account=await accountFromCookie((await headers()).get('cookie')??'');if(!account)redirect('/login');
 }else await requireChatGPTUser('/registration/manage');
 return <ManageRegistrations yearId={(await searchParams).yearId??''}/>;
}
