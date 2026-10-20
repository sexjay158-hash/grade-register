import {FEATURES} from './flags';

// Cache schema/bootstrap work only. Account permissions and business rows stay live.
const pending=new Map<string,Promise<void>>();
export async function initializeOnce(key:string,work:()=>Promise<unknown>){
 if(!FEATURES.concurrentQueries)return work();
 let task=pending.get(key);
 if(!task){task=work().then(()=>{}).catch(error=>{pending.delete(key);throw error;});pending.set(key,task);}
 await task;
}
