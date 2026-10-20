import {FEATURES} from './flags';

// Batch reads within one request; never share business results between requests/users.
export function createReadBatch(database:D1Database){
 const pending:{statement:D1PreparedStatement;resolve:(result:D1Result<unknown>)=>void;reject:(error:unknown)=>void}[]=[];
 return function read<T>(statement:D1PreparedStatement):Promise<D1Result<T>>{
  if(!FEATURES.concurrentQueries)return statement.all<T>();
  return new Promise((resolve,reject)=>{
   pending.push({statement,resolve:result=>resolve(result as D1Result<T>),reject});
   if(pending.length===1)queueMicrotask(async()=>{
    const batch=pending.splice(0);
    try{const results=await database.batch(batch.map(item=>item.statement));batch.forEach((item,index)=>item.resolve(results[index]));}
    catch(error){batch.forEach(item=>item.reject(error));}
   });
  });
 };
}
