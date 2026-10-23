"use client";
import {requestJson} from '@/lib/browser-request';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {Users,UserX,KeyRound,RefreshCw,Trash2,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {toast} from 'sonner';
import {PASSWORD_MIN_LENGTH} from '@/lib/password-policy';
import {FEATURES} from '@/lib/flags';
import {normalizeCohort} from '@/lib/cohort';
import {MemberManager as LegacyMemberManager} from './member-manager-legacy';

type Member={username:string;role:'college_lead'|'recorder';college:string;cohort:string|null;active:number};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
const noLocationUpdates=()=>()=>{};
function generatedPassword(){const values=crypto.getRandomValues(new Uint8Array(20));return Array.from(values,n=>alphabet[n%alphabet.length]).join('');}
async function request<T=unknown>(path:string,method='GET',body?:unknown):Promise<T>{return requestJson<T>(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}

export function MemberManager({colleges,adminUsername=''}:{colleges:string[];adminUsername?:string}){
 if(!FEATURES.localAccounts)return <LegacyMemberManager colleges={colleges}/>;
 return <LocalMemberManager colleges={colleges} adminUsername={adminUsername}/>;
}
function LocalMemberManager({colleges,adminUsername}:{colleges:string[];adminUsername:string}){
 const [members,setMembers]=useState<Member[]>([]),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<'college_lead'|'recorder'>('recorder'),[college,setCollege]=useState(''),[cohort,setCohort]=useState(''),[editing,setEditing]=useState(false),[originalUsername,setOriginalUsername]=useState(''),[query,setQuery]=useState(''),[reactivating,setReactivating]=useState(false),[busy,setBusy]=useState(false),[showPassword,setShowPassword]=useState(false),[current,setCurrent]=useState(''),[next,setNext]=useState(''),[issued,setIssued]=useState<{username:string;password:string}|null>(null);
 const siteUrl=useSyncExternalStore(noLocationUpdates,()=>window.location.origin+'/',()=>'');
 const hostname=siteUrl?new URL(siteUrl).hostname:'';
 const localPreview=!!hostname&&(['localhost','127.0.0.1','::1','[::1]'].includes(hostname)||/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname));
 async function load(){setMembers(await request<Member[]>('/api/members'));}
 useEffect(()=>{request<Member[]>('/api/members').then(setMembers).catch(e=>toast.error((e as Error).message));},[]);
 function reset(){setUsername('');setPassword('');setCollege('');setCohort('');setRole('recorder');setEditing(false);setOriginalUsername('');setReactivating(false);}
 async function save(){if(busy)return;setBusy(true);try{const assignedCohort=role==='recorder'?normalizeCohort(cohort):null;const saved=await request<Member>('/api/members',editing&&FEATURES.memberAccountManagement?'PUT':'POST',{username,password,role,college,cohort:assignedCohort,...(editing?{oldUsername:originalUsername}:{createOnly:true})});await load();setIssued(password?{username:saved.username,password}:null);reset();toast.success(editing?'账号权限已更新，原登录会话已失效':localPreview?'本地验收账号已创建':'账号已创建，可以把账号和密码交给老师');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 async function disable(value:string){if(busy||!window.confirm(`停用 ${value}？该老师会立即失去系统访问权限。`))return;setBusy(true);try{await request('/api/members','DELETE',{username:value});await load();if(originalUsername===value)reset();setIssued(previous=>previous?.username===value?null:previous);toast.success('账号已停用，现有登录会话已失效');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 async function remove(value:string){if(busy)return;const confirmation=window.prompt('删除账号 '+value+'？已有名单、成绩和照片会保留，账号将无法登录。请输入完整账号名称确认：');if(confirmation===null)return;if(confirmation!==value){toast.error('账号名称不一致，未删除');return;}setBusy(true);try{await request('/api/members','DELETE',{username:value,action:'delete',confirmUsername:confirmation});await load();if(originalUsername===value)reset();setIssued(previous=>previous?.username===value?null:previous);toast.success('账号已删除，现有登录会话已失效');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 async function changeOwnPassword(){if(busy)return;setBusy(true);try{await request('/api/auth/password','POST',{current,next});setCurrent('');setNext('');toast.success('管理员密码已修改，其他登录会话已退出');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 return <><section className="panel member-manager"><div className="section-head"><span className="large-icon small"><Users/></span><div><h2>使用人员与权限</h2><p>管理员管理全校；院负责人管理本院；年级负责人可增删改查本院对应年级的名单，并增删改查未确认成绩；更新会同步到院负责人。学生入学年级按学号保留，负责范围按小组主要年级分配，个别其他年级学生随组走。</p></div></div>
  <div className="member-form local-member-form">
   <label>登录账号<Input value={username} disabled={busy||editing&&!FEATURES.memberAccountManagement} autoComplete="off" onChange={e=>setUsername(e.target.value)} placeholder="例如：jx2024"/></label>
   <label>{editing?(reactivating?'新密码（重新启用必填）':'新密码（不修改可留空）'):`初始密码（至少 ${PASSWORD_MIN_LENGTH} 位）`}<div className="password-entry"><Input type={showPassword?'text':'password'} value={password} autoComplete="new-password" onChange={e=>setPassword(e.target.value)} placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位密码`}/><Button type="button" variant="outline" onClick={()=>{setPassword(generatedPassword());setShowPassword(true);}}>生成密码</Button></div></label>
   <label>身份<Select value={role} onValueChange={value=>setRole(value as typeof role)}><SelectTrigger aria-label="选择身份"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="college_lead">院负责人</SelectItem><SelectItem value="recorder">年级负责人</SelectItem></SelectContent></Select></label>
   <label>负责学院<Select value={college} onValueChange={setCollege}><SelectTrigger aria-label="选择负责学院"><SelectValue placeholder="选择学院"/></SelectTrigger><SelectContent>{colleges.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></label>
   {role==='recorder'&&<label>负责年级<Input value={cohort} onChange={e=>setCohort(e.target.value)} placeholder="例如：24级、25级（也可填2024）"/></label>}
   <div className="member-form-actions"><Button disabled={busy||!username||!college||(role==='recorder'&&!cohort)||((!editing||reactivating)&&password.length<PASSWORD_MIN_LENGTH)} onClick={save}>{busy?'保存中…':editing?reactivating?'重新启用账号':'保存账号修改':'创建账号'}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={reset}>取消修改</Button>}</div>
  </div>
  {issued&&<div className="issued-credential" role="status"><div><strong>{localPreview?'本地验收账号已保存':'请现在保存并发放这组登录信息'}</strong><p>账号：<code>{issued.username}</code>　密码：<code>{issued.password}</code></p><small>{localPreview?'这些账号保存在本地验收库，上线后须在正式网站重新创建。':'关闭后系统不会再次显示密码。请只交给对应老师。'}</small></div><Button variant="outline" onClick={()=>setIssued(null)}>已记录，关闭</Button></div>}
  <p className="member-share">{localPreview?'当前是本地验收网站；这里创建的账号仅用于本地测试，上线前不要发给老师。':<>使用网址：{siteUrl&&<a href={siteUrl} target="_blank" rel="noreferrer">{siteUrl}</a>}。把账号和密码单独交给对应老师；系统不会再次显示已保存的密码，忘记时由你重置。</>}</p>
  <div className="table-toolbar"><label className="member-search"><Search size={17}/><Input aria-label="查询账号" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索账号、学院、年级或身份"/></label><Button variant="outline" disabled={busy} onClick={()=>load().catch(e=>toast.error((e as Error).message))}><RefreshCw size={15}/>刷新账号</Button></div>
  {!members.length?<div className="empty"><Users/><h3>还没有分配老师</h3><p>填写账号、密码和负责范围，保存后即可让老师登录。</p></div>:<Table><TableHeader><TableRow><TableHead>账号</TableHead><TableHead>身份</TableHead><TableHead>学院</TableHead><TableHead>年级</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{members.filter(item=>[item.username,item.college,item.cohort??'',item.role==='college_lead'?'院负责人':'年级负责人',item.active?'可登录':'已停用'].some(value=>value.toLowerCase().includes(query.trim().toLowerCase()))).map(item=><TableRow key={item.username}><TableCell>{item.username}</TableCell><TableCell>{item.role==='college_lead'?'院负责人':'年级负责人'}</TableCell><TableCell>{item.college}</TableCell><TableCell>{item.cohort?item.cohort+'级':'全部年级'}</TableCell><TableCell>{item.active?'可登录':'已停用'}</TableCell><TableCell><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setUsername(item.username);setOriginalUsername(item.username);setPassword('');setRole(item.role);setCollege(item.college);setCohort(item.cohort??'');setEditing(true);setReactivating(!item.active);}}><RefreshCw size={14}/>{item.active?'修改 / 重置':'重新启用'}</Button>{!!item.active&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>disable(item.username)}><UserX size={14}/>停用</Button>}{FEATURES.memberAccountManagement&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>remove(item.username)}><Trash2 size={14}/>删除</Button>}</TableCell></TableRow>)}</TableBody></Table>}
 </section><section className="panel member-manager own-password"><div className="section-head"><span className="large-icon small"><KeyRound/></span><div><h2>修改我的管理员密码</h2><p>当前账号：{adminUsername}。修改后其他设备会退出登录。</p></div></div><div className="member-form local-member-form"><label>原密码<Input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>新密码<Input type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={next} onChange={e=>setNext(e.target.value)}/></label><div className="member-form-actions"><Button disabled={busy||!current||next.length<PASSWORD_MIN_LENGTH} onClick={changeOwnPassword}>保存新密码</Button></div></div></section></>;
}
