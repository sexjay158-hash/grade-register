"use client";
import {useEffect,useState} from 'react';
import {Users,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {toast} from 'sonner';

type Member={email:string;role:'college_lead'|'recorder';college:string;cohort:string|null;joined:number};
const SITE_URL='https://group-score-register.epic-basil-1699.chatgpt.site/';
async function membersRequest<T=unknown>(method='GET',body?:unknown):Promise<T>{const r=await fetch('/api/members',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),data=await r.json() as T&{error?:string};if(!r.ok)throw new Error(data.error??'账号操作失败');return data;}

export function MemberManager({colleges}:{colleges:string[]}){
 const [members,setMembers]=useState<Member[]>([]),[email,setEmail]=useState(''),[role,setRole]=useState<'college_lead'|'recorder'>('recorder'),[college,setCollege]=useState(''),[cohort,setCohort]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setMembers(await membersRequest<Member[]>());}
 useEffect(()=>{load().catch(e=>toast.error((e as Error).message));},[]);
 async function save(){if(busy)return;setBusy(true);try{await membersRequest('POST',{email,role,college,cohort});await load();setEmail('');setCohort('');toast.success('使用权限已保存，把网址发给该老师即可登录');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 async function remove(value:string){if(busy)return;setBusy(true);try{await membersRequest('DELETE',{email:value});await load();toast.success('该账号的访问权限已移除');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel member-manager"><div className="section-head"><span className="large-icon small"><Users/></span><div><h2>使用人员与权限</h2><p>你管理全校。按老师登录邮箱分配学院和入学年级；未分配的账号无法查看成绩。</p></div></div>
  <div className="member-form">
   <label>老师的登录邮箱<Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="teacher@example.edu.cn"/></label>
   <label>身份<Select value={role} onValueChange={value=>setRole(value as typeof role)}><SelectTrigger aria-label="选择身份"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="college_lead">院负责人 · 查看本院</SelectItem><SelectItem value="recorder">录入员 · 录入本院一个年级</SelectItem></SelectContent></Select></label>
   <label>负责学院<Select value={college} onValueChange={setCollege}><SelectTrigger aria-label="选择负责学院"><SelectValue placeholder="选择学院"/></SelectTrigger><SelectContent>{colleges.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></label>
   {role==='recorder'&&<label>入学年级<Input value={cohort} onChange={e=>setCohort(e.target.value)} placeholder="例如：2024级"/></label>}
   <Button disabled={busy||!email||!college||(role==='recorder'&&!cohort)} onClick={save}>{busy?'保存中…':'添加或更新权限'}</Button>
  </div>
  <p className="member-share">使用网址：<a href={SITE_URL} target="_blank" rel="noreferrer">{SITE_URL}</a>。老师用上方邮箱对应的 ChatGPT 账号登录。识别照片仍需要在老师自己的电脑上启动 RapidOCR，手动录入与查看无需本机识别服务。</p>
  {!members.length?<div className="empty"><Users/><h3>还没有分配老师</h3><p>上方填写邮箱和负责范围，保存后再分享网址。</p></div>:<Table><TableHeader><TableRow><TableHead>邮箱</TableHead><TableHead>身份</TableHead><TableHead>学院</TableHead><TableHead>年级</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{members.map(item=><TableRow key={item.email}><TableCell>{item.email}</TableCell><TableCell>{item.role==='college_lead'?'院负责人':'录入员'}</TableCell><TableCell>{item.college}</TableCell><TableCell>{item.cohort?item.cohort+'级':'全部年级'}</TableCell><TableCell>{item.joined?'已登录':'待首次登录'}</TableCell><TableCell><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setEmail(item.email);setRole(item.role);setCollege(item.college);setCohort(item.cohort??'');}}>修改</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>remove(item.email)}><Trash2 size={14}/>移除</Button></TableCell></TableRow>)}</TableBody></Table>}
 </section>;
}
