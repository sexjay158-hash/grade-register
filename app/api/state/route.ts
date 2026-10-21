import {access,json,failure} from '@/lib/server';
import {requireAccessibleYear} from '@/lib/semester-access';
import {readWorkspaceState} from '@/lib/workspace/read-state';

export async function GET(req:Request){
 try{
  const account=await access(req);
  const yearId=await requireAccessibleYear(account,new URL(req.url).searchParams.get('yearId'));
  return json(await readWorkspaceState(account,yearId));
 }catch(error){return failure(error);}
}
