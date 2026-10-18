"use client";
import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';

export function DeleteUnrecognizedPhoto({name,disabled,onDelete}:{name:string;disabled:boolean;onDelete:()=>Promise<boolean>}){
 const [open,setOpen]=useState(false);
 return <><Button size="sm" variant="outline" className="text-destructive" disabled={disabled} onClick={()=>setOpen(true)} aria-label={'删除照片 '+name}><Trash2 size={14}/>删除照片</Button>
 <AlertDialog open={open} onOpenChange={value=>{if(!disabled)setOpen(value);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这张未识别照片？</AlertDialogTitle><AlertDialogDescription>将永久删除“{name}”及其识别结果，删除后可重新上传。此操作仅适用于未关联活动、未录入成绩的照片。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={disabled}>取消</AlertDialogCancel><AlertDialogAction className="delete-confirm" disabled={disabled} onClick={async e=>{e.preventDefault();if(await onDelete())setOpen(false);}}>{disabled?'正在删除…':'确认删除照片'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
