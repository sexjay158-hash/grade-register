// Reserve CPU time for already signed-in users as well as bounding concurrent work.
// A concurrency counter alone cannot protect a runtime that serializes password computation.
export function createLoginAdmission(clock:()=>number=Date.now){
 let active=0,tokens=3,last=clock();
 return ()=>{
  const now=clock();tokens=Math.min(3,tokens+Math.max(0,now-last)*3/1000);last=now;
  if(active>=6||tokens<1)return null;
  tokens--;active++;let released=false;
  return ()=>{if(!released){released=true;active--;}};
 };
}
