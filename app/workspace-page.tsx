"use client";
import type {ReactNode} from 'react';
import {Building2,CalendarDays,FileSpreadsheet,Settings2,ShieldCheck,Upload,Users} from 'lucide-react';
import {FEATURES} from '@/lib/flags';

const pages = {
 register: {title:'活动登记',description:'上传成绩照片，核对识别结果；也可以手动补录。',icon:Upload},
 preview: {title:'成绩总表与导出',description:'在总表中查看、修改原始分和折算分，核对后导出 Excel。',icon:FileSpreadsheet},
 roster: {title:'学生名单',description:'按学期保存名单，在这里导入、查找和维护学生信息。',icon:Users},
 archives:{title:'学期归档',description:'保留历史名单、成绩、活动和照片，仅管理员可查。',icon:CalendarDays},
 colleges: {title:'学院管理',description:'维护全校学院档案，查看各学院的名单与活动数量。',icon:Building2},
 history: {title:'活动记录',description:'查找活动、继续草稿，或查看与修改已登记的成绩。',icon:CalendarDays},
 settings: {title:'照片识别设置',description:'选择识别方式并测试效果，设置将保存在当前浏览器。',icon:Settings2},
 members: {title:'账号与权限',description:'为老师开通账号，分配学院和入学年级，管理登录权限。',icon:ShieldCheck},
} as const;

export function WorkspacePage({page,context,children,readOnlyRoster=false,memberDirectory=false}:{page:keyof typeof pages;context?:ReactNode;children:ReactNode;readOnlyRoster?:boolean;memberDirectory?:boolean}){
 if(!FEATURES.independentPages)return <>{children}</>;
 const {title,description,icon:Icon}=pages[page];
 return <main className={`task-page task-page-${page}`} aria-label={memberDirectory?'本院年级负责人':title}>
  <header className="task-heading"><span className="task-icon"><Icon size={24}/></span><div><h1>{memberDirectory?'本院年级负责人':title}</h1><p>{memberDirectory?'查看本院年级负责人的账号、负责年级和使用状态。':readOnlyRoster?'仅查看负责年级的学生；名单由院负责人或管理员维护。':description}</p></div></header>
  {context&&<div className="task-context">{context}</div>}
  <div className="task-content">{children}</div>
 </main>;
}
