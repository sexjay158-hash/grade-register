"use client";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {ALL_COLLEGES} from '@/lib/college-scope';

export function CollegeScopeControls({colleges,value,onChange}:{colleges:string[];value:string;onChange:(college:string)=>void}){
 return <div className="college-scope"><span>查看范围</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label="选择学院" className="filter-select"><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL_COLLEGES}>全校</SelectItem>{colleges.map(college=><SelectItem key={college} value={college}>{college}</SelectItem>)}</SelectContent></Select></div>;
}
