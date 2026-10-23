"use client";
import {useEffect,useRef,useState} from 'react';
import {PenLine} from 'lucide-react';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';

export function EditableGradeCell({name,number,value,draft,onSave}:{name:string;number:number;value:number|string|null;draft:boolean;onSave:(score:number)=>Promise<void>}){
 const [editing,setEditing]=useState(false),[input,setInput]=useState(''),[saving,setSaving]=useState(false);
 const field=useRef<HTMLInputElement>(null),cancelled=useRef(false),submitting=useRef(false);
 useEffect(()=>{if(editing)field.current?.focus();},[editing]);
 async function finish(){
  if(cancelled.current){cancelled.current=false;setEditing(false);return;}
  if(submitting.current)return;
  const score=Number(input.trim());
  if(!input.trim()||!Number.isFinite(score)||score<0||score>100){toast.error('成绩须为 0～100 的数字');field.current?.focus();return;}
  if(typeof value==='number'&&score===value){setEditing(false);return;}
  submitting.current=true;setSaving(true);
  try{await onSave(score);setEditing(false);}
  catch(error){toast.error((error as Error).message);field.current?.focus();}
  finally{setSaving(false);submitting.current=false;}
 }
 if(editing)return <Input ref={field} aria-label={name+'第'+number+'次活动成绩'} className="inline-grade-input" type="number" min="0" max="100" step="any" value={input} disabled={saving} onChange={event=>setInput(event.target.value)} onBlur={finish} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){cancelled.current=true;event.currentTarget.blur();}}}/>;
 return <button className={'editable-grade '+(draft?'grade-draft':'')} onClick={()=>{setInput(typeof value==='number'?String(value):'');setEditing(true);}} aria-label={name+'第'+number+'次活动成绩，点击修改'} title="点击直接修改分数">
  <span>{value??'—'}</span><PenLine size={12}/>{draft&&<small>待确认</small>}
 </button>;
}
