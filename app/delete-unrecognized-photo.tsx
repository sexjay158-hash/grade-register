"use client";
import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';

export function DeleteUnrecognizedPhoto({name,disabled,onDelete,recognized=false}:{name:string;disabled:boolean;onDelete:()=>Promise<boolean>;recognized?:boolean}){
 const [open,setOpen]=useState(false);
 return <><Button size="sm" variant="outline" className="text-destructive" disabled={disabled} onClick={()=>setOpen(true)} aria-label={'删除照片 '+name}><Trash2 size={14}/>删除照片</Button>
 <AlertDialog open={open} onOpenChange={value=>{if(!disabled)setOpen(value);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{recognized?'删除这张已识别照片？':'删除这张未识别照片？'}</AlertDialogTitle><AlertDialogDescription>{recognized?`将删除“${name}”的原图与照片识别记录，保留已录入成绩和活动等次。删除后可重新上传照片；新照片不会自动覆盖已有成绩，如需纠正请核对修改。已确认或归档活动的照片不能删除。`:`将永久删除“${name}”及其识别结果，删除后可重新上传。此操作仅适用于未关联活动、未录入成绩的照片。`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={disabled}>取消</AlertDialogCancel><AlertDialogAction className="delete-confirm" disabled={disabled} onClick={async e=>{e.preventDefault();if(await onDelete())setOpen(false);}}>{disabled?'正在删除…':'确认删除照片'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
