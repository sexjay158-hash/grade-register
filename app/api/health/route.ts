import {access,requireAdmin,db,bucket,json,failure} from '@/lib/server';
import {HttpError} from '@/lib/http';
import {checkReadiness} from '@/lib/health';
import {FEATURES} from '@/lib/flags';

export async function GET(req:Request){
 try{
  if(!FEATURES.operationalSafety)throw new HttpError(404,'NOT_FOUND','此功能未启用');
  // Public liveness is cheap and deliberately does not claim dependencies are ready.
  if(new URL(req.url).searchParams.get('ready')!=='1')return json({status:'ok'});
  requireAdmin(await access(req));
  const result=await checkReadiness({
   database:async()=>{await db().prepare('SELECT 1 AS ok').first();},
   storage:async()=>{await bucket().head('__health__/readiness');},
  });
  return json(result,result.status==='ok'?200:503);
 }catch(error){return failure(error);}
}
