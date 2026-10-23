"use client";
import {requestJson} from '@/lib/browser-request';
import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';

export function GroupCohortManager({groups,yearId,onClose,onChanged}:{groups:{id:string;name:string;college?:string;responsible_cohort?:string|null}[];yearId:string;onClose:()=>void;onChanged:()=>Promise<void>}){
 const [values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState('');
 async function save(id:string){setBusy(id);try{const data=await requestJson<{cohort:string}>('/api/group-cohorts',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({yearId,groupId:id,cohort:values[id]})});await onChanged();toast.success('整组已分配给'+data.cohort+'级负责人');setValues(previous=>({...previous,[id]:data.cohort}));}catch(e){toast.error((e as Error).message);}finally{setBusy('');}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent><DialogHeader><DialogTitle>小组负责年级</DialogTitle><DialogDescription>默认按组内人数最多的入学年级分配，个别其他年级学生随组管理。人数并列时请指定；手动分配后不会因名单增删而自动改变。</DialogDescription></DialogHeader><div className="intake-list">{groups.map(group=><div key={group.id} className="intake-card"><div className="intake-info"><strong>{group.name}</strong><small>{group.college} · {group.responsible_cohort?group.responsible_cohort+'级负责':'待分配'}</small></div><Input aria-label={group.name+'负责年级'} value={values[group.id]??group.responsible_cohort??''} placeholder="例如25级" onChange={e=>setValues(previous=>({...previous,[group.id]:e.target.value}))}/><Button disabled={!!busy||!values[group.id]} onClick={()=>save(group.id)}>保存</Button></div>)}</div></DialogContent></Dialog>;
}
