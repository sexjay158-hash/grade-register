import {FEATURES} from '@/lib/flags';
import {JoinForm} from '@/app/group-registration-forms';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import '@/app/group-registration.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={referrer:'no-referrer'};
export default async function JoinPage({params}:{params:Promise<{token:string}>}){if(!FEATURES.groupRegistration)notFound();return <JoinForm token={(await params).token}/>;}
