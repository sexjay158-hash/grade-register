'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {requestJson} from '@/lib/browser-request';
import {downloadGroupRegistrationWorkbook,type ExportedGroup} from '@/lib/group-registration-excel';

type Member={sid:string;name:string};
type Leader={sid:string;name:string;college:string;cohort:string};
type OwnSubmission={id:string;status:string;group_name:string;note?:string|null};
type Catalog={year:string;open:boolean;colleges:string[];leader:Leader|null;submission:OwnSubmission|null};
type Submission={id:string;college:string;cohort:string;group_name:string;leader_sid:string;members:Member[];status:string;created:string;note?:string|null};
type RegistrationStat={college:string;cohort:string;status:string;groups:number;members:number};
type Management={campaign:{token:string;open:number}|null;campaignOpen:boolean|null;canManageCampaign:boolean;stats:RegistrationStat[];total:number;recordsTotal:number;page:number;submissions:Submission[]};
const blank=():Member=>({sid:'',name:''});
const statusName=(status:string)=>({pending:'待审核',reviewing:'处理中',approved:'已通过',rejected:'已退回'} as Record<string,string>)[status]??status;

export function JoinForm({token}:{token:string}){
 const path='/api/group-registration/public/'+encodeURIComponent(token);
 const authPath='/api/group-registration/leader/'+encodeURIComponent(token);
 const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<'register'|'login'>('register'),[sid,setSid]=useState(''),[name,setName]=useState(''),[college,setCollege]=useState(''),[password,setPassword]=useState('');
 const [group,setGroup]=useState(''),[members,setMembers]=useState<Member[]>([]);
 useEffect(()=>{requestJson<Catalog>(path).then(setCatalog).catch(e=>setError((e as Error).message));},[path]);
 async function refresh(){setCatalog(await requestJson<Catalog>(path));}
 async function authenticate(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  await requestJson(authPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:catalog?.open?mode:'login',sid,name,college,password})});
  setPassword('');await refresh();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function logout(){setBusy(true);setError('');try{await requestJson(authPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});setGroup('');setMembers([]);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!catalog?.leader)return;setBusy(true);setError('');try{
  await requestJson(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({group,members:[{sid:catalog.leader.sid,name:catalog.leader.name},...members],website:''})});await refresh();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const leader=catalog?.leader,submission=catalog?.submission;
 return <main className="registration-shell"><section className="registration-card"><h1>小组线上报名</h1>
  {catalog&&<><p>{catalog.year} · 每个小组由组长注册账号并申报成员，审核后进入正式名单。学院按组长所选学院、学号前四位对应的入学年级归类。</p>
   {!leader?<><div className="registration-switch">{catalog.open&&<button type="button" className={mode==='register'?'is-active':''} onClick={()=>setMode('register')}>注册组长账号</button>}<button type="button" className={mode==='login'||!catalog.open?'is-active':''} onClick={()=>setMode('login')}>已有账号登录</button></div>
    {!catalog.open&&<p>报名已关闭，已有账号仍可登录查看审核结果。</p>}
    <form onSubmit={authenticate}><label>组长学号<input required inputMode="numeric" pattern="[0-9]{6,24}" maxLength={24} autoComplete="username" value={sid} onChange={e=>setSid(e.target.value)}/></label>
     {mode==='register'&&catalog.open&&<><label>组长姓名<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>学院<select required value={college} onChange={e=>setCollege(e.target.value)}><option value="">请选择学院</option>{catalog.colleges.map(item=><option key={item} value={item}>{item}</option>)}</select></label></>}
     <label>密码<input required type="password" minLength={6} maxLength={128} autoComplete={mode==='login'||!catalog.open?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
     <p>请使用本人的真实信息。账号与学号绑定；申报的学院和年级将在审核时核对。</p><button type="submit" disabled={busy}>{busy?'处理中…':mode==='register'&&catalog.open?'注册并继续报名':'登录'}</button></form></>:
    <><div className="registration-account"><span>当前组长：<strong>{leader.name}（{leader.sid}）</strong><br/>{leader.college} · {leader.cohort} 级</span><button type="button" onClick={()=>void logout()} disabled={busy}>退出账号</button></div>
     {submission&&<div className="registration-success" role="status"><strong>{submission.group_name}：{statusName(submission.status)}</strong>{submission.note&&<p>审核意见：{submission.note}</p>}{submission.status==='approved'&&<p>已进入正式名单。</p>}{submission.status==='pending'&&<p>学院负责人正在审核，你可以稍后回来查看。</p>}</div>}
     {catalog.open&&(!submission||submission.status==='rejected')&&<form onSubmit={submit}><label>小组名称<input required maxLength={150} value={group} onChange={e=>setGroup(e.target.value)} placeholder="填写本学期小组名称"/></label><p>组长已自动列为第 1 位成员。其他成员须与组长属于同一入学年级，最多 60 人。</p>
      <div className="registration-members"><div className="registration-member"><span>1</span><input readOnly aria-label="组长学号" value={leader.sid}/><input readOnly aria-label="组长姓名" value={leader.name}/></div>{members.map((member,index)=><div className="registration-member" key={index}><span>{index+2}</span><input required inputMode="numeric" pattern="[0-9]{6,24}" maxLength={24} aria-label={`第 ${index+2} 人学号`} placeholder="学号" value={member.sid} onChange={e=>setMembers(members.map((m,i)=>i===index?{...m,sid:e.target.value}:m))}/><input required maxLength={40} aria-label={`第 ${index+2} 人姓名`} placeholder="姓名" value={member.name} onChange={e=>setMembers(members.map((m,i)=>i===index?{...m,name:e.target.value}:m))}/><button type="button" onClick={()=>setMembers(members.filter((_,i)=>i!==index))}>移除</button></div>)}</div>
      <button type="button" disabled={members.length>=59} onClick={()=>setMembers([...members,blank()])}>添加成员</button><button type="submit" disabled={busy}>{busy?'提交中…':'提交本组名单，等待审核'}</button></form>}</>}
  </>}
  {!catalog&&!error&&<p>正在读取报名信息…</p>}{error&&<p className="registration-error" role="alert">{error}</p>}
 </section></main>;
}

export function ManageRegistrations({yearId,embedded=false,readOnly=false}:{yearId:string;embedded?:boolean;readOnly?:boolean}){
 const [data,setData]=useState<Management|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[note,setNote]=useState<Record<string,string>>({}),[page,setPage]=useState(0);
 const url='/api/group-registration?yearId='+encodeURIComponent(yearId)+'&page='+page;
 async function load(){if(!yearId)return;try{setData(await requestJson<Management>(url));setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{if(yearId)void requestJson<Management>(url).then(value=>{setData(value);setError('');}).catch(e=>setError((e as Error).message));},[yearId,url]);
 async function act(action:string,id?:string){setBusy(id??action);setError('');try{await requestJson('/api/group-registration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,yearId,id,note:id?note[id]:undefined})});await load();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function download(){setBusy('export');setError('');try{const result=await requestJson<{year:string;submissions:ExportedGroup[]}>('/api/group-registration/export?yearId='+encodeURIComponent(yearId));await downloadGroupRegistrationWorkbook(result.year,result.submissions);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 const link=data?.campaign?'/join/'+data.campaign.token:'';
 return <main className={'registration-shell'+(embedded?' registration-embedded':'')}><section className="registration-card registration-manage">{!embedded&&<Link href="/">← 返回学生名单</Link>}{embedded?<h2>报名管理与审核</h2>:<h1>小组报名审核</h1>}{!yearId?<p>请先选择学期。</p>:<><p>先由管理员生成并发放报名链接。组长注册账号后申报新小组；院负责人查看本院报名，审核通过后名单才进入正式系统。</p>{readOnly&&<p>此学期已归档，报名审核为只读。</p>}
  {data?.canManageCampaign&&<div className="registration-campaign">{data.campaign?<><strong>报名链接：{data.campaign.open?'开放中':'已关闭'}</strong><input readOnly aria-label="报名链接" value={link} onFocus={e=>e.target.select()}/><button onClick={()=>void navigator.clipboard.writeText(new URL(link,window.location.href).href)}>复制给组长的链接</button><button disabled={!!busy||readOnly} onClick={()=>void act(data.campaign?.open?'close':'open')}>{data.campaign.open?'关闭报名':'重新开放'}</button></>:<button disabled={!!busy||readOnly} onClick={()=>void act('open')}>生成本学期报名链接</button>}</div>}
  {data&&!data.canManageCampaign&&<p role="status">{data.campaignOpen===null?'管理员尚未生成报名链接。':data.campaignOpen?'报名已开放，组长可使用管理员发放的链接申报。':'报名已关闭，仍可查看和导出已有记录。'}</p>}
  {error&&<p role="alert" className="registration-error">{error}</p>}{data&&<><div className="registration-summary"><strong>已申报 {data.total} 个小组</strong><button disabled={!!busy||!data.total} onClick={()=>void download()}>{busy==='export'?'生成中…':'导出 Excel'}</button></div><div className="registration-stats">{data.stats.map(row=><div key={`${row.college}-${row.cohort}-${row.status}`}><strong>{row.college} · {row.cohort} 级</strong><span>{statusName(row.status)}：{row.groups} 组 / {row.members} 人</span></div>)}</div></>}
  {!data?<p>正在读取报名记录…</p>:data.recordsTotal===0?<p>暂无报名记录。</p>:<><p>报名记录共 {data.recordsTotal} 条 · 第 {data.page+1} / {Math.ceil(data.recordsTotal/100)} 页</p>{data.submissions.map(row=><article key={row.id} className="registration-review"><h2>{row.college} · {row.cohort} 级 · {row.group_name}</h2><p>组长学号：{row.leader_sid}　成员：{row.members.length} 人　状态：{statusName(row.status)}</p><p>{row.members.map(m=>`${m.name}（${m.sid}）`).join('、')}</p>{row.note&&<p>审核记录：{row.note}</p>}{row.status==='pending'&&!readOnly&&<div className="registration-actions"><button disabled={!!busy} onClick={()=>void act('approve',row.id)}>审核通过并导入名单</button><input maxLength={300} placeholder="退回原因" aria-label={`${row.group_name}退回原因`} value={note[row.id]??''} onChange={e=>setNote({...note,[row.id]:e.target.value})}/><button disabled={!!busy||!note[row.id]?.trim()} onClick={()=>void act('reject',row.id)}>退回</button></div>}</article>)}<div className="registration-pages"><button disabled={page===0} onClick={()=>setPage(page-1)}>上一页</button><button disabled={(page+1)*100>=data.recordsTotal} onClick={()=>setPage(page+1)}>下一页</button></div></>}
 </>}</section></main>;
}
