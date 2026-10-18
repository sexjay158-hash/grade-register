"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';

export type Semester={id:string;label:string;created:string;archived_at?:string;students?:number;events?:number};
export function SemesterArchives({current,active,onChanged,onOpen}:{current?:Semester;active:Semester[];onChanged:()=>Promise<void>;onOpen:(year:Semester,tab:string)=>Promise<void>}){
 const [archives,setArchives]=useState<Semester[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{const r=await fetch('/api/years?archived=1');const data:any=await r.json();if(!r.ok)throw new Error(data.error);setArchives(data);setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function change(id:string,action:string){if(busy)return;if(!window.confirm(action==='archive'?'归档此学期？名单、成绩、活动和照片会保留，仅管理员可查看；归档后只读。':'恢复此学期？院和年级负责人将重新看到该学期，并按原权限操作。'))return;setBusy(true);try{const r=await fetch('/api/years',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});const data:any=await r.json();if(!r.ok)throw new Error(data.error);await load();await onChanged();toast.success(action==='archive'?'学期已归档，历史数据保留':'学期已恢复');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel"><div className="table-toolbar"><div><h2>学期归档</h2><p className="muted text-sm">仅管理员可查看和导出归档学期。归档保留名单、成绩、活动和照片，不删除数据。</p></div><Button variant="outline" disabled={busy} onClick={()=>load()}>重新加载</Button></div>
 {current&&!current.archived_at&&<div className="notice"><p>当前学期：{current.label}</p><Button disabled={busy||active.length<2} onClick={()=>change(current.id,'archive')}>归档当前学期</Button>{active.length<2&&<p>请先在学生名单中创建新学期。</p>}</div>}
 {error&&<p role="alert" className="form-error">{error}</p>}
 {!archives.length&&!error?<div className="empty"><h3>暂无归档学期</h3><p>新建学期时可同时归档当前学期，也可在这里单独归档。</p></div>:<div className="intake-list">{archives.map(year=><article key={year.id} className="intake-card"><div className="intake-info"><strong>{year.label}</strong><span>{year.students??0} 名学生 · {year.events??0} 次活动</span><small>归档时间：{year.archived_at?new Date(year.archived_at).toLocaleString('zh-CN'):'—'}</small></div><div className="intake-actions"><Button variant="outline" disabled={busy} onClick={()=>onOpen(year,'roster')}>查看名单</Button><Button variant="outline" disabled={busy} onClick={()=>onOpen(year,'preview')}>查看成绩 / 导出</Button><Button variant="outline" disabled={busy} onClick={()=>onOpen(year,'history')}>查看活动与照片</Button><Button variant="ghost" disabled={busy} onClick={()=>change(year.id,'restore')}>恢复学期</Button></div></article>)}</div>}
 </section>;
}
