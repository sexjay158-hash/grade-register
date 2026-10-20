// Schedule after completion, with jitter and backoff. Slow requests never overlap.
export function scheduleRefresh(work:()=>Promise<boolean>,eligible:()=>boolean,options:{baseMs?:number;maxMs?:number;random?:()=>number}={}){
 const base=options.baseMs??45000,max=options.maxMs??180000,random=options.random??Math.random;
 let stopped=false,running=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
 function schedule(){if(!stopped)timer=setTimeout(()=>void run(),Math.min(max,base*2**failures)*(1+random()/3));}
 async function run(){
  if(stopped||running)return;
  clearTimeout(timer);
  if(!eligible()){schedule();return;}
  running=true;
  try{failures=await work()?0:Math.min(failures+1,3);}catch{failures=Math.min(failures+1,3);}
  finally{running=false;schedule();}
 }
 schedule();
 return {wake(){if(stopped||running)return;clearTimeout(timer);timer=setTimeout(()=>void run(),500+random()*2500);},stop(){stopped=true;clearTimeout(timer);}};
}
