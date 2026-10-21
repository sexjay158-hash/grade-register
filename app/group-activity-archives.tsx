"use client";
import {useMemo,useState} from 'react';
import {ArrowLeft,CalendarDays,ChevronRight,FolderOpen,ImagePlus,Search,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ACTIVITY_RATINGS} from '@/lib/activity-rating';
import {groupActivityArchives,type ArchiveGroup,type GroupActivity} from '@/lib/group-activities';
import './group-activity-archives.css';

export function GroupActivityArchives({groups,events,loading,busy,error,readOnly,onOpen}:{groups:ArchiveGroup[];events:GroupActivity[];loading:boolean;busy:boolean;error:string;readOnly:boolean;onOpen:(id:string)=>void}){
 const [selected,setSelected]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState<'all'|'draft'|'committed'>('all'),[page,setPage]=useState(1);
 const archives=useMemo(()=>groupActivityArchives(groups,events),[groups,events]);
 const current=archives.find(row=>row.group.id===selected);
 const shown=archives.filter(row=>(row.group.name+' '+row.group.college).toLowerCase().includes(query.trim().toLowerCase()));
 const activities=current?.activities.filter(row=>status==='all'||row.status===status)??[];
 const total=current?activities.length:shown.length,pages=Math.max(1,Math.ceil(total/20)),activePage=Math.min(page,pages);
 const rows=current?[]:shown.slice((activePage-1)*20,activePage*20);
 const openGroup=(id:string)=>{setSelected(id);setStatus('all');setPage(1);};
 return <section className="group-archives" aria-label="小组活动档案" aria-busy={loading}>
  <div className="group-archive-summary"><FolderOpen/><div><strong>每个小组，一份活动档案</strong><p>活动会自动归入所属小组，保留活动序号、日期、成绩和照片，无需重复上传。{readOnly?'当前为归档学期，只能查看。':''}</p></div></div>
  {current?<section className="panel group-archive-detail"><div className="group-archive-toolbar"><div><Button variant="ghost" onClick={()=>{setSelected('');setPage(1);}}><ArrowLeft size={16}/>返回小组</Button><h2>{current.group.name}</h2><p>{current.group.college} · {current.group.members} 名学生 · 共 {current.activities.length} 次活动</p></div><span className="group-archive-photo-count"><ImagePlus size={16}/>{current.photos} 张活动照片</span></div>
   <div className="group-archive-filters" role="group" aria-label="筛选小组活动状态">{(['all','committed','draft'] as const).map(value=><Button key={value} variant={status===value?'default':'outline'} aria-pressed={status===value} onClick={()=>{setStatus(value);setPage(1);}}>{value==='all'?'全部活动':value==='committed'?'已确认':'草稿'} · {value==='all'?current.activities.length:value==='committed'?current.committed:current.drafts}</Button>)}</div>
   {error?<p className="group-archive-empty" role="status">当前数据可能不是最新，请先重新加载。</p>:loading?<p className="group-archive-empty" role="status">正在加载活动…</p>:!activities.length?<div className="group-archive-empty"><CalendarDays/><h3>{current.activities.length?'该状态下暂无活动':'本组还没有活动记录'}</h3><p>后续登记的活动会自动出现在这里，并标明第几次活动。</p></div>:<ol className="group-activity-list">{activities.slice((activePage-1)*20,activePage*20).map(event=><li key={event.id}><div className="group-activity-number">第 <strong>{event.number}</strong> 次活动</div><div className="group-activity-info"><div><span className={'pill '+(event.status==='draft'?'draft':'done')}>{event.status==='draft'?'草稿':'已确认'}</span><span>{event.date}</span></div><p>{event.recorded} 人已记录 · {event.photos} 张照片 · {event.rating&&ACTIVITY_RATINGS[event.rating]?ACTIVITY_RATINGS[event.rating].label+' '+ACTIVITY_RATINGS[event.rating].rate*100+'%':'未选评级'}</p></div><Button variant="outline" disabled={busy||!!error||loading} onClick={()=>onOpen(event.id)}>查看成绩与照片<ChevronRight size={16}/></Button></li>)}</ol>}
  </section>:<section className="panel group-archive-directory"><div className="group-archive-toolbar"><h2>小组目录 <span className="count">{loading?'—':shown.length}</span></h2><div className="group-archive-search"><Search size={17}/><Input aria-label="搜索小组活动档案" placeholder="搜索小组或学院名称" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></div></div>
   {error?<p className="group-archive-empty" role="status">暂时无法确认最新活动，请先重新加载。</p>:loading?<p className="group-archive-empty" role="status">正在加载小组…</p>:!shown.length?<div className="group-archive-empty"><FolderOpen/><h3>{groups.length?'没有匹配的小组':'当前范围还没有小组'}</h3><p>{groups.length?'请更换搜索内容。':'导入名单建立小组后，活动会自动按组归档展示。'}</p></div>:<ul className="group-archive-grid">{rows.map(row=><li key={row.group.id}><button type="button" onClick={()=>openGroup(row.group.id)} aria-label={'查看'+row.group.college+' · '+row.group.name+'的活动档案'}><span className="group-folder-icon"><FolderOpen size={24}/></span><h3>{row.group.name}</h3><p>{row.group.college}{row.group.responsible_cohort?' · '+row.group.responsible_cohort+'级':''}</p><div className="group-archive-metrics"><span><Users size={14}/>{row.group.members} 人</span><span><CalendarDays size={14}/>{row.activities.length} 次活动</span></div><div className="group-archive-bottom"><span>已确认 {row.committed} · 草稿 {row.drafts}</span><span>查看活动<ChevronRight size={15}/></span></div></button></li>)}</ul>}
  </section>}
  {!loading&&!error&&pages>1&&<div className="group-archive-pagination"><span>第 {activePage} / {pages} 页 · 每页 20 条</span><div><Button variant="outline" size="sm" disabled={activePage<=1} onClick={()=>setPage(activePage-1)}>上一页</Button><Button variant="outline" size="sm" disabled={activePage>=pages} onClick={()=>setPage(activePage+1)}>下一页</Button></div></div>}
 </section>;
}
