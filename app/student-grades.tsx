"use client";
import {requestJson} from '@/lib/browser-request';
import {studentNumber} from '@/lib/student-number';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import type {Student} from '@/lib/domain';
import './student-grades.css';

type Activity={id:string;number:number;date:string;status:string;version:number;score:number|null;state:string;editable:boolean};
const labels:Record<string,string>={scored:'有成绩',absent:'缺席',excused:'请假',unrecorded:'未录入'};
async function request(path:string,value?:unknown,method='POST'):Promise<any>{return requestJson('/api/'+path,value?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:undefined);}

export function StudentGrades({student,yearId,readOnly,onClose,onChanged}:{student:Student;yearId:string;readOnly:boolean;onClose:()=>void;onChanged:()=>Promise<void>}){
 const scope=yearId+'|'+student.sid,currentScope=useRef(scope),generation=useRef(0);currentScope.current=scope;
 const [events,setEvents]=useState<Activity[]>([]),[canCreate,setCanCreate]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState<Activity|'new'|null>(null),[state,setState]=useState('scored'),[score,setScore]=useState(''),[date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA'));
 async function load(signal?:AbortSignal){
  const own=++generation.current;setLoading(true);
  const current=()=>own===generation.current&&scope===currentScope.current&&!signal?.aborted;
  try{const data:any=await requestJson('/api/student-grades?yearId='+encodeURIComponent(yearId)+'&sid='+encodeURIComponent(student.sid),{signal});if(!current())return;setEvents(data.events);setCanCreate(data.canCreate);setError('');}
  catch(e){if(current()){setError((e as Error).message);setEvents([]);setCanCreate(false);}}
  finally{if(current())setLoading(false);}
 }
 useEffect(()=>{const controller=new AbortController();setEditing(null);setEvents([]);setCanCreate(false);void load(controller.signal);return()=>controller.abort();},[student.sid,yearId]);

 function edit(event:Activity|'new'){setEditing(event);setState(event==='new'?'scored':event.state==='unrecorded'?'scored':event.state);setScore(event==='new'?'':String(event.score??''));}
 async function save(){if(!editing||busy)return;setBusy(true);try{
  let target:Activity|{id:string;version:number};
  if(editing==='new'){const created=await request('events',{groupId:student.group_id,date});const detail=await request('event/'+created.id);if(detail.scores.some((row:{sid:string;state:string})=>row.sid===student.sid&&row.state!=='unrecorded'))throw new Error('该同学已有本次成绩，请刷新后使用修改入口');target=detail.event;}else target=editing;
  await request('event/'+target.id,{version:target.version,sid:student.sid,state,score:state==='scored'?Number(score):null},'PATCH');
  setEditing(null);await load();await onChanged();toast.success('个人成绩已保存，院负责人可查看更新');
 }catch(e){toast.error((e as Error).message);await load();}finally{setBusy(false);}}
 async function clear(event:Activity){if(busy||!window.confirm(`清除 ${student.name} 第 ${event.number} 次活动的成绩？该同学会恢复为未录入，其他学生成绩和整组活动保留。`))return;setBusy(true);try{await request('event/'+event.id,{version:event.version,sid:student.sid,action:'clear'},'PATCH');setEditing(null);await load();await onChanged();toast.success('该同学本次成绩已清除');}catch(e){toast.error((e as Error).message);await load();}finally{setBusy(false);}}
 const draft=events.find(event=>event.status==='draft');
 const valid=state!=='scored'||score.trim()!==''&&Number.isFinite(Number(score))&&Number(score)>=0&&Number(score)<=10000;
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="student-grades-dialog"><DialogHeader><DialogTitle>{student.name} · 个人成绩</DialogTitle><DialogDescription>{studentNumber(student)} · 只显示该同学的成绩。年级负责人可维护未确认成绩；院负责人确认后锁定。清除个人成绩保留活动和其他学生的数据。</DialogDescription></DialogHeader>
 <div className="student-grades-toolbar"><Button variant="outline" disabled={busy||loading} onClick={()=>load()}>刷新成绩</Button>{!readOnly&&canCreate&&(!draft||draft.state==='unrecorded')&&<Button disabled={busy||loading} onClick={()=>edit(draft??'new')}>{draft?'补录本次成绩':'新增活动成绩'}</Button>}</div>
 {error&&<p role="alert" className="form-error">{error}</p>}
 {loading?<p className="muted">正在读取成绩…</p>:<div className="student-grades-list">{events.map(event=><article key={event.id} className="student-grade-card"><div><strong>第 {event.number} 次活动</strong><p>{event.date} · {event.status==='committed'?'已确认':'待确认'}</p></div><span>{event.state==='scored'?event.score:labels[event.state]??event.state}</span><div className="student-grade-actions">{!readOnly&&event.editable?<><Button size="sm" variant="outline" disabled={busy} onClick={()=>edit(event)}>{event.state==='unrecorded'?'录入':'修改'}</Button>{event.state!=='unrecorded'&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>clear(event)}>删除成绩</Button>}</>:<small className="muted">只读</small>}</div></article>)}{!events.length&&!error&&<p className="muted">暂无活动成绩，可新增后录入。</p>}</div>}
 {editing&&<form className="student-grade-form" onSubmit={e=>{e.preventDefault();void save();}}><h3>{editing==='new'?'新增活动成绩':`第 ${editing.number} 次活动 · ${student.name}`}</h3>{editing==='new'&&<><p className="muted text-sm">活动按小组计次，仅录入这位同学；其他同学保持未录入。同组已有草稿时会复用。</p><label>活动日期<Input type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label></>}
 <label>成绩状态<select aria-label="个人成绩状态" value={state} disabled={busy} onChange={e=>setState(e.target.value)}>{['scored','absent','excused'].map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
 {state==='scored'&&<label>原始成绩<Input aria-label={`${student.name}的原始成绩`} type="number" min="0" max="10000" step="any" value={score} disabled={busy} onChange={e=>setScore(e.target.value)}/></label>}
 <div className="student-grade-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(null)}>取消</Button><Button type="submit" disabled={busy||!valid||(editing==='new'&&!date)}>{busy?'保存中…':'保存个人成绩'}</Button></div></form>}
 </DialogContent></Dialog>;
}
