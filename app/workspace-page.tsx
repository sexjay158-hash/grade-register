"use client";
import type {ReactNode} from 'react';
import {Building2,CalendarDays,ClipboardList,FileSpreadsheet,Settings2,ShieldCheck,Upload,Users} from 'lucide-react';
import {FEATURES} from '@/lib/flags';

const pages = {
 todos: {title:'我的待办',description:'查看照片核对、评级和活动确认，按负责范围逐项处理。',icon:ClipboardList},
 register: {title:'活动登记',description:'上传成绩照片，核对识别结果；也可以手动补录。',icon:Upload},
 preview: {title:'成绩总表与导出',description:'在总表中查看、修改原始分和折算分，核对后导出 Excel。',icon:FileSpreadsheet},
 roster: {title:'学生名单',description:'按学期保存名单，在这里导入、查找和维护学生信息。',icon:Users},
 signups: {title:'小组线上报名',description:'组长注册并申报新小组；按学院和年级查看、审核与导出报名名单。',icon:ClipboardList},
 archives:{title:'学期归档',description:'保留历史名单、成绩、活动和照片，仅管理员可查。',icon:CalendarDays},
 colleges: {title:'学院管理',description:'维护全校学院档案，查看各学院的名单与活动数量。',icon:Building2},
 history: {title:FEATURES.groupActivityArchives?'小组活动档案':'活动记录',description:FEATURES.groupActivityArchives?'按小组集中查看本学期的全部活动，清楚找到第几次活动及对应成绩和照片。':'查找活动、继续草稿，或查看与修改已登记的成绩。',icon:CalendarDays},
 settings: {title:'照片识别设置',description:'选择识别方式并测试效果，设置将保存在当前浏览器。',icon:Settings2},
 members: {title:'账号与权限',description:'管理院负责人和年级负责人，按审核名单批量开通小组账号。',icon:ShieldCheck},
} as const;

export function WorkspacePage({page,context,children,readOnlyRoster=false,memberDirectory=false}:{page:keyof typeof pages;context?:ReactNode;children:ReactNode;readOnlyRoster?:boolean;memberDirectory?:boolean}){
 if(!FEATURES.independentPages)return <>{children}</>;
 const {title,description,icon:Icon}=pages[page];
 return <main className={`task-page task-page-${page}`} aria-label={memberDirectory?'本院账号':title}>
  <header className="task-heading"><span className="task-icon"><Icon size={24}/></span><div><h1>{memberDirectory?'本院账号':title}</h1><p>{memberDirectory?'批量开通本院小组账号，发放激活码、停用和办理交接。':readOnlyRoster?'仅查看负责范围的学生；名单由院负责人或管理员维护。':description}</p></div></header>
  {context&&<div className="task-context">{context}</div>}
  <div className="task-content">{children}</div>
 </main>;
}
