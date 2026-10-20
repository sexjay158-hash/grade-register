"use client";
import {useEffect,useRef,useState} from 'react';
import {Trash2,Upload,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';
import {FEATURES} from '@/lib/flags';
import './photo-upload-review.css';

// Keep selections in the browser until the user explicitly confirms them.
export function usePhotoUploadReview(scope:string,upload:(files:File[])=>Promise<File[]>,disabled:boolean){
 const [files,setFiles]=useState<File[]>([]),[confirming,setConfirming]=useState(false),inFlight=useRef(false),currentScope=useRef(scope);
 currentScope.current=scope;
 useEffect(()=>{setFiles([]);},[scope]);
 function selectPhotos(selected:FileList|null){
  if(!selected?.length||disabled||inFlight.current)return;
  const incoming=Array.from(selected);
  if(incoming.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type))){toast.error('请选择 JPG、PNG 或 WebP 图片');return;}
  if(!FEATURES.photoUploadReview){void upload(incoming).catch(e=>toast.error((e as Error).message));return;}
  if(files.length+incoming.length>30){toast.error('一次最多选择 30 张照片，请先移除多余照片或分批上传');return;}
  setFiles(previous=>[...previous,...incoming]);
 }
 async function confirm(){
  if(!files.length||disabled||inFlight.current)return;
  const startedScope=scope;inFlight.current=true;setConfirming(true);
  try{const remaining=await upload(files);if(currentScope.current===startedScope)setFiles(remaining);}catch(e){toast.error((e as Error).message);}finally{inFlight.current=false;setConfirming(false);}
 }
 return {selectPhotos,busy:confirming,review:FEATURES.photoUploadReview&&files.length>0?<PhotoUploadReview files={files} busy={disabled||confirming} onChange={setFiles} onConfirm={confirm}/>:null};
}

function PhotoUploadReview({files,busy,onChange,onConfirm}:{files:File[];busy:boolean;onChange:(files:File[])=>void;onConfirm:()=>void}){
 const [previews,setPreviews]=useState<{file:File;url:string}[]>([]);
 useEffect(()=>{const next=files.map(file=>({file,url:URL.createObjectURL(file)}));setPreviews(next);return()=>next.forEach(item=>URL.revokeObjectURL(item.url));},[files]);
 return <section className="photo-upload-review" aria-label="待上传照片确认">
  <div className="photo-review-heading"><strong>待上传照片 · {files.length} 张</strong><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>onChange([])}>取消全部</Button></div>
  <p>请核对照片和活动日期。可移除选错的照片，也可继续选择；点击确认后才上传并识别。</p>
  <div className="photo-review-grid">{previews.map(({file,url},index)=><article className="photo-review-item" key={url}>
   <a href={url} target="_blank" rel="noreferrer" aria-label={`放大第 ${index+1} 张待上传照片`}><img src={url} loading="lazy" decoding="async" alt={`待上传第 ${index+1} 张：${file.name}`}/></a>
   <span title={file.name}>{index+1}. {file.name}</span>
   <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`移除第 ${index+1} 张待上传照片`} onClick={()=>onChange(files.filter((_,i)=>i!==index))}><Trash2 size={14}/>移除</Button>
  </article>)}</div>
  <Button type="button" className="photo-review-confirm" disabled={busy} onClick={onConfirm}>{busy?<Loader2 className="spin" size={16}/>:<Upload size={16}/>} {busy?'正在上传和识别…':`确认上传 ${files.length} 张照片`}</Button>
 </section>;
}
