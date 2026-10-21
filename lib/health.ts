type Check=()=>Promise<unknown>;
export async function checkReadiness(checks:Record<string,Check>,timeoutMs=1500){
 const results=await Promise.all(Object.entries(checks).map(async([name,check])=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([Promise.resolve().then(check),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeoutMs);})]);
   return [name,'ok'] as const;
  }catch{return [name,'unavailable'] as const;}
  finally{if(timer)clearTimeout(timer);}
 }));
 const dependencies=Object.fromEntries(results);
 return {status:results.every(([,result])=>result==='ok')?'ok':'unavailable',dependencies};
}
