"use client";
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import type {College} from '@/lib/colleges';

export function CollegeOverview({colleges,onOpen}:{colleges:College[];onOpen:(college:string)=>void}){
 if(!colleges.length)return null;
 return <section className="panel college-overview"><div className="table-toolbar"><div><h2>各学院核对进度</h2><p className="muted text-sm">逐院查看草稿与已确认活动，再导出学院或全校成绩。</p></div></div><Table><TableHeader><TableRow><TableHead>学院</TableHead><TableHead>学生</TableHead><TableHead>小组</TableHead><TableHead>已确认活动</TableHead><TableHead>待核对草稿</TableHead><TableHead/></TableRow></TableHeader><TableBody>{colleges.map(college=><TableRow key={college.id}><TableCell><strong>{college.name}</strong></TableCell><TableCell>{college.students}</TableCell><TableCell>{college.groups}</TableCell><TableCell>{college.events}</TableCell><TableCell><span className={college.drafts?'amber':''}>{college.drafts}</span></TableCell><TableCell><Button size="sm" variant="outline" onClick={()=>onOpen(college.name)}>查看成绩</Button></TableCell></TableRow>)}</TableBody></Table></section>;
}
