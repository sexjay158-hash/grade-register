"use client";
import {useMemo,useState} from 'react';
import {AlertCircle,CheckCircle2,ChevronRight,ClipboardList,ImagePlus,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import type {WorkspaceTodo,TodoRole} from '@/lib/workspace/todos';
import './todo-dashboard.css';

const filters=[{id:'all',label:'全部待办'},{id:'photo',label:'照片需核对'},{id:'complete',label:'活动待完善'},{id:'confirm',label:'活动待确认'}] as const;
const labels={photo_pending:'待识别',photo_review:'待核对',photo_conflict:'存在冲突',scores_missing:'待录入',rating_missing:'未选评级',awaiting_confirmation:'待确认'};
export function TodoDashboard({items,role,loading,busy,error,archived,onOpen,onRefresh}:{items:WorkspaceTodo[];role:TodoRole;loading:boolean;busy:boolean;error:string;archived:boolean;onOpen:(todo:WorkspaceTodo)=>void;onRefresh:()=>void}){
 const [filter,setFilter]=useState<(typeof filters)[number]['id']>('all'),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const counts=useMemo(()=>({all:items.length,photo:items.filter(row=>row.kind==='photo').length,complete:items.filter(row=>row.kind==='complete').length,confirm:items.filter(row=>row.kind==='confirm').length}),[items]);
 const shown=useMemo(()=>items.filter(row=>(filter==='all'||row.kind===filter)&&(!query.trim()||[row.title,...row.groupNames,...row.colleges].join(' ').toLowerCase().includes(query.trim().toLowerCase()))),[items,filter,query]);
 const pages=Math.max(1,Math.ceil(shown.length/20)),currentPage=Math.min(page,pages),rows=shown.slice((currentPage-1)*20,currentPage*20);
 return <section className="todo-dashboard" aria-label="当前范围待办" aria-busy={loading}>
  <div className="todo-intro"><div><h2>今天从这里开始</h2><p>照片、评级和活动确认集中查看；完成后会随数据更新自动移出清单。</p></div><Button variant="outline" disabled={loading||busy} onClick={onRefresh}><RefreshCw size={16}/>刷新待办</Button></div>
  <div className="todo-counts" role="group" aria-label="筛选待办类别">{filters.map(option=><button type="button" key={option.id} aria-pressed={filter===option.id} disabled={loading||busy} onClick={()=>{setFilter(option.id);setPage(1);}}><span>{option.label}</span><strong>{loading?'—':counts[option.id]}</strong></button>)}</div>
  <div className="panel todo-panel"><div className="todo-toolbar"><h2><ClipboardList size={19}/>待办清单 <span className="count">{loading?'—':shown.length}</span></h2><Input aria-label="搜索待办" placeholder="搜索小组、学院或照片名称" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></div>
   {error?<div className="todo-empty" role="status"><AlertCircle/><strong>待办可能不是最新</strong><p>请先刷新数据，再继续处理。</p></div>:loading?<div className="todo-empty" role="status"><ClipboardList/><p>正在加载待办…</p></div>:archived?<div className="todo-empty"><CheckCircle2/><strong>归档学期只读，不生成待办</strong><p>历史记录可在活动记录和导出预览中查看。</p></div>:!shown.length?<div className="todo-empty"><CheckCircle2/><strong>{items.length?'没有符合筛选条件的待办':'当前范围暂无待办'}</strong><p>{items.length?'试试其他类别，或清空搜索内容。':'后续上传照片或开始登记活动后，需要处理的事项会显示在这里。'}</p></div>:<ul className="todo-list">{rows.map(todo=><li key={todo.id}><div className={'todo-item-icon '+todo.kind}>{todo.kind==='photo'?<ImagePlus size={20}/>:<ClipboardList size={20}/>}</div><div className="todo-item-content"><div className="todo-item-title"><strong>{todo.title}</strong><span className={'todo-badge '+(todo.reason==='photo_conflict'?'conflict':'')}>{labels[todo.reason]}</span></div><p className="todo-meta">{[todo.date,...todo.colleges].filter(Boolean).join(' · ')}{todo.kind==='photo'?' · '+(todo.groupNames.join('、')||'尚未匹配小组'):''}</p><p>{todo.detail}</p></div><Button variant="outline" disabled={busy} onClick={()=>onOpen(todo)}>{todo.kind==='photo'?'核对照片':todo.kind==='confirm'?(role==='recorder'?'查看活动':'核对并确认'):todo.reason==='rating_missing'?'填写评级':'继续录入'}<ChevronRight size={16}/></Button></li>)}</ul>}
   {!error&&!loading&&pages>1&&<div className="todo-pagination"><span>第 {currentPage} / {pages} 页 · 每页 20 条</span><div><Button size="sm" variant="outline" disabled={currentPage<=1||busy} onClick={()=>setPage(currentPage-1)}>上一页</Button><Button size="sm" variant="outline" disabled={currentPage>=pages||busy} onClick={()=>setPage(currentPage+1)}>下一页</Button></div></div>}
  </div><p className="todo-help">仅显示当前学期、当前范围的事项。照片核对提示会在关联活动确认后移除；未出现成绩的学生不会自动补零或记缺席。</p>
 </section>;
}
