"use client";
import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import type {GroupActivity} from '@/lib/group-activities';

export function DeleteActivityButton({event,groupName,disabled,onDelete}:{event:GroupActivity;groupName:string;disabled:boolean;onDelete:()=>Promise<boolean>}){
 const [open,setOpen]=useState(false);
 return <><Button variant="outline" className="text-destructive" disabled={disabled} aria-label={`删除${groupName}第${event.number}次活动`} onClick={()=>setOpen(true)}><Trash2 size={15}/>删除活动</Button>
 <AlertDialog open={open} onOpenChange={value=>{if(!disabled)setOpen(value);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确定删除这次{event.status==='draft'?'草稿':'已确认'}活动？</AlertDialogTitle><AlertDialogDescription>将永久删除“{groupName} · 第 {event.number} 次活动”（{event.date}）及其成绩、等次和修改记录。当前已记录 {event.recorded} 人、关联 {event.photos} 张照片；只属于本次活动的照片也会删除。共用照片及其他小组的成绩保留。该组后续活动序号会依次前移，总表和导出同步更新。这会删除活动本身。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={disabled}>取消</AlertDialogCancel><AlertDialogAction className="delete-confirm" disabled={disabled} onClick={async e=>{e.preventDefault();if(await onDelete())setOpen(false);}}>{disabled?'正在删除…':'确认删除活动及成绩'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
