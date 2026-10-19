"use client";
import {useCallback,useEffect,useState} from 'react';
import {RefreshCw,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';

type Recorder={username:string;college:string;cohort:string|null;active:number};
export function CollegeRecorders({college}:{college:string}){
 const [members,setMembers]=useState<Recorder[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{
  const response=await fetch('/api/members'),data=await response.json() as Recorder[]&{error?:string};
  if(!response.ok)throw new Error(data.error??'读取年级负责人失败');setMembers(data);
 }catch(e){setMembers([]);setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[college,load]);
 const filtered=members.filter(item=>[item.username,item.cohort??'',item.active?'可登录':'已停用'].some(value=>value.toLowerCase().includes(query.trim().toLowerCase())));
 return <section className="panel member-manager"><div className="section-head"><span className="large-icon small"><Users/></span><div><h2>{college} · 年级负责人</h2><p>查看本院各年级的负责人；账号和密码由管理员维护。</p></div></div>
  <div className="table-toolbar"><Input aria-label="查询本院年级负责人" placeholder="搜索账号、年级或状态" value={query} onChange={e=>setQuery(e.target.value)}/><Button variant="outline" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/>刷新</Button></div>
  {error?<p role="alert">{error}</p>:loading?<p role="status">正在读取年级负责人…</p>:!filtered.length?<p>{members.length?'没有符合搜索条件的负责人':'本院暂未分配年级负责人'}</p>:<Table><TableHeader><TableRow><TableHead>账号</TableHead><TableHead>负责学院</TableHead><TableHead>负责年级</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{filtered.map(item=><TableRow key={item.username}><TableCell>{item.username}</TableCell><TableCell>{item.college}</TableCell><TableCell>{item.cohort?item.cohort+'级':'未分配'}</TableCell><TableCell>{item.active?'可登录':'已停用'}</TableCell></TableRow>)}</TableBody></Table>}
 </section>;
}
