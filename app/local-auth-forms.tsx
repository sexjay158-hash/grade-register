"use client";
import {PASSWORD_MIN_LENGTH} from '@/lib/password-policy';
import {useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

async function submit(path:string,value:unknown){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error??'操作失败');}
function Shell({title,description,children}:{title:string;description:string;children:React.ReactNode}){return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><img src="/arts-university-logo.png" alt="学校校徽"/><div><strong>课外锻炼</strong><span>全校成绩登记</span></div></div><h1>{title}</h1><p>{description}</p>{children}</section></main>;}
export function LoginForm(){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await submit('/api/auth/login',{username,password});window.location.assign('/');}catch(err){setError((err as Error).message);setBusy(false);}}
 return <Shell title="账号密码登录" description="请使用管理员分配给你的系统账号和密码。"><form onSubmit={login} className="auth-form"><label>账号<Input autoFocus autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="输入管理员分配的账号" required/></label><label>密码<Input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="输入密码" required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}<Button type="submit" disabled={busy||!username||!password}>{busy?'登录中…':'登录系统'}</Button></form><p className="auth-help">忘记账号或密码，请联系学校管理员重置。</p></Shell>;
}
export function SetupForm(){
 const [setupToken,setSetupToken]=useState(''),[username,setUsername]=useState('admin'),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function setup(e:FormEvent){e.preventDefault();if(busy)return;if(password!==repeat){setError('两次输入的密码不一致');return;}setBusy(true);setError('');try{await submit('/api/auth/bootstrap',{setupToken,username,password});window.location.assign('/');}catch(err){setError((err as Error).message);setBusy(false);}}
 return <Shell title="设置管理员账号" description="由学校管理员输入部署时设置的初始化口令，创建第一组账号密码；不需要 Google 或 ChatGPT 登录。"><form onSubmit={setup} className="auth-form"><label>初始化口令<Input type="password" autoComplete="off" value={setupToken} onChange={e=>setSetupToken(e.target.value)} required/></label><label>管理员账号<Input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>管理员密码（至少 {PASSWORD_MIN_LENGTH} 位）<Input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={PASSWORD_MIN_LENGTH} required/></label><label>再输入一次密码<Input type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)} minLength={PASSWORD_MIN_LENGTH} required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}<Button type="submit" disabled={busy||setupToken.length<32||!username||password.length<PASSWORD_MIN_LENGTH||!repeat}>{busy?'正在设置…':'完成设置并进入系统'}</Button></form><p className="auth-help">初始化口令仅用于首次设置。密码只以加盐哈希保存；目前没有自助找回入口。</p></Shell>;
}
