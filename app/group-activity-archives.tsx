"use client";
import {useMemo,useState} from 'react';
import {ArrowLeft,Building2,CalendarDays,ChevronRight,FolderOpen,ImagePlus,Search,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ACTIVITY_RATINGS} from '@/lib/activity-rating';
import {FEATURES} from '@/lib/flags';
import {collegeActivityArchives,groupActivityArchives,type ArchiveGroup,type GroupActivity} from '@/lib/group-activities';
import './group-activity-archives.css';

type Props={groups:ArchiveGroup[];events:GroupActivity[];loading:boolean;busy:boolean;error:string;readOnly:boolean;fullCollege?:boolean;onOpen:(id:string)=>void};
export function GroupActivityArchives({groups,events,loading,busy,error,readOnly,fullCollege=false,onOpen}:Props){
 const [selected,setSelected]=useState(''),[selectedCollege,setSelectedCollege]=useState('');
 const [collegeView,setCollegeView]=useState<'activities'|'groups'>('activities');
 const [query,setQuery]=useState(''),[status,setStatus]=useState<'all'|'draft'|'committed'>('all'),[page,setPage]=useState(1);
 const archives=useMemo(()=>groupActivityArchives(groups,events),[groups,events]);
 const colleges=useMemo(()=>collegeActivityArchives(archives),[archives]);
 const college=FEATURES.collegeActivityOverview?colleges.find(row=>row.name===selectedCollege):undefined;
 const current=archives.find(row=>row.group.id===selected);
 const shown=(college?.groups??archives).filter(row=>(row.group.name+' '+row.group.college).toLowerCase().includes(query.trim().toLowerCase()));
 const target=current?{name:current.group.name,...current}:college;
 const showActivities=!!current||!!college&&collegeView==='activities';
 const activities=target?.activities.filter(row=>status==='all'||row.status===status)??[];
 const total=showActivities?activities.length:shown.length,pages=Math.max(1,Math.ceil(total/20)),activePage=Math.min(page,pages);
 const reset=()=>{setStatus('all');setQuery('');setPage(1);};
 const openGroup=(id:string)=>{setSelected(id);reset();};
 const openCollege=(name:string)=>{setSelectedCollege(name);setSelected('');setCollegeView('activities');reset();};
 const collegeLabel=fullCollege?'全院':'负责范围';
 return <section className="group-archives" aria-label="小组活动档案" aria-busy={loading}>
  <div className="group-archive-summary"><FolderOpen/><div><strong>学院汇总与小组活动档案</strong><p>先查看学院汇总，也可以进入小组查找第几次活动及对应成绩、照片。{!fullCollege?'仅显示你负责的小组。':''}{readOnly?'当前为归档学期，只能查看。':''}</p></div></div>
  {!current&&!college&&FEATURES.collegeActivityOverview&&<section className="panel college-archive-directory"><h2>学院总览</h2><p className="muted text-sm">点击学院查看{collegeLabel}活动，小组活动记录分别保留各自序号。</p>
   {error?<p role="status">数据可能不是最新，请先同步。</p>:loading?<p role="status">正在加载学院…</p>:!colleges.length?<p className="group-archive-empty">当前范围还没有小组，导入名单后会显示学院汇总。</p>:<ul className="group-archive-grid college-archive-grid">{colleges.map(row=><li key={row.name}><button type="button" onClick={()=>openCollege(row.name)} aria-label={'查看'+row.name+'的'+collegeLabel+'活动'}><span className="group-folder-icon"><Building2 size={24}/></span><h3>{row.name}</h3><p>{collegeLabel}汇总 · {row.groups.length} 个小组 · {row.members} 名学生</p><div className="college-activity-total"><strong>{row.activities.length}</strong> 条小组活动记录</div><div className="group-archive-bottom"><span>已确认 {row.committed} · 草稿 {row.drafts}</span><span>进入学院<ChevronRight size={15}/></span></div></button></li>)}</ul>}
  </section>}
  {!current&&college&&<section className="panel college-archive-heading"><Button variant="ghost" onClick={()=>{setSelectedCollege('');reset();}}><ArrowLeft size={16}/>返回全部档案</Button><h2>{college.name} · {collegeLabel}汇总</h2><p>{college.groups.length} 个小组 · {college.members} 名学生 · {college.activities.length} 条小组活动记录</p><div className="group-archive-filters" role="group" aria-label="学院档案查看方式">{(['activities','groups'] as const).map(view=><Button key={view} variant={collegeView===view?'default':'outline'} aria-pressed={collegeView===view} onClick={()=>{setCollegeView(view);reset();}}>{view==='activities'?collegeLabel+'活动':'按小组查看'}</Button>)}</div></section>}
  {showActivities&&target?<section className="panel group-archive-detail">
   {current?<div className="group-archive-toolbar"><div><Button variant="ghost" onClick={()=>{setSelected('');setCollegeView('groups');reset();}}><ArrowLeft size={16}/>{college?'返回本院小组':'返回小组'}</Button><h2>{current.group.name}</h2><p>{current.group.college} · {current.group.members} 名学生 · 共 {current.activities.length} 次活动</p></div><span className="group-archive-photo-count"><ImagePlus size={16}/>{current.photos} 张活动照片</span></div>:<div className="group-archive-toolbar"><h2>{collegeLabel}活动记录</h2><p>按日期从新到旧显示；“第几次”是各小组自己的活动序号。</p></div>}
   <div className="group-archive-filters" role="group" aria-label="筛选活动状态">{(['all','committed','draft'] as const).map(value=><Button key={value} variant={status===value?'default':'outline'} aria-pressed={status===value} onClick={()=>{setStatus(value);setPage(1);}}>{value==='all'?'全部活动':value==='committed'?'已确认':'草稿'} · {value==='all'?target.activities.length:value==='committed'?target.committed:target.drafts}</Button>)}</div>
   {error?<p className="group-archive-empty" role="status">当前数据可能不是最新，请先同步。</p>:loading?<p className="group-archive-empty" role="status">正在加载活动…</p>:!activities.length?<div className="group-archive-empty"><CalendarDays/><h3>{target.activities.length?'该状态下暂无活动':'还没有活动记录'}</h3><p>后续登记的活动会自动出现在这里，并标明第几次活动。</p></div>:<ol className="group-activity-list">{activities.slice((activePage-1)*20,activePage*20).map(event=><li key={event.id}><div className="group-activity-number">第 <strong>{event.number}</strong> 次活动</div><div className="group-activity-info">{!current&&<strong className="college-event-group">{'group_name' in event?String(event.group_name):''}</strong>}<div><span className={'pill '+(event.status==='draft'?'draft':'done')}>{event.status==='draft'?'草稿':'已确认'}</span><span>{event.date}</span></div><p>{event.recorded} 人已记录 · {event.photos} 张照片 · {event.rating&&ACTIVITY_RATINGS[event.rating]?ACTIVITY_RATINGS[event.rating].label+' '+ACTIVITY_RATINGS[event.rating].rate*100+'%':'未选评级'}</p></div><Button variant="outline" disabled={busy||!!error||loading} onClick={()=>onOpen(event.id)}>查看成绩与照片<ChevronRight size={16}/></Button></li>)}</ol>}
  </section>:<section className="panel group-archive-directory"><div className="group-archive-toolbar"><h2>{college?'本院小组':'小组目录'} <span className="count">{loading?'—':shown.length}</span></h2><div className="group-archive-search"><Search size={17}/><Input aria-label="搜索小组活动档案" placeholder="搜索小组或学院名称" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></div></div>
   {error?<p className="group-archive-empty" role="status">暂时无法确认最新活动，请先同步。</p>:loading?<p className="group-archive-empty" role="status">正在加载小组…</p>:!shown.length?<div className="group-archive-empty"><FolderOpen/><h3>{groups.length?'没有匹配的小组':'当前范围还没有小组'}</h3><p>{groups.length?'请更换搜索内容。':'导入名单建立小组后，活动会自动按组归档展示。'}</p></div>:<ul className="group-archive-grid">{shown.slice((activePage-1)*20,activePage*20).map(row=><li key={row.group.id}><button type="button" onClick={()=>openGroup(row.group.id)} aria-label={'查看'+row.group.college+' · '+row.group.name+'的活动档案'}><span className="group-folder-icon"><FolderOpen size={24}/></span><h3>{row.group.name}</h3><p>{row.group.college}{row.group.responsible_cohort?' · '+row.group.responsible_cohort+'级':''}</p><div className="group-archive-metrics"><span><Users size={14}/>{row.group.members} 人</span><span><CalendarDays size={14}/>{row.activities.length} 次活动</span></div><div className="group-archive-bottom"><span>已确认 {row.committed} · 草稿 {row.drafts}</span><span>查看活动<ChevronRight size={15}/></span></div></button></li>)}</ul>}
  </section>}
  {!loading&&!error&&pages>1&&<div className="group-archive-pagination"><span>第 {activePage} / {pages} 页 · 每页 20 条</span><div><Button variant="outline" size="sm" disabled={activePage<=1} onClick={()=>setPage(activePage-1)}>上一页</Button><Button variant="outline" size="sm" disabled={activePage>=pages} onClick={()=>setPage(activePage+1)}>下一页</Button></div></div>}
 </section>;
}
