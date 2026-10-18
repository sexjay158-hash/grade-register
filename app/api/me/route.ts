import {access,json,failure} from '@/lib/server';
export async function GET(req:Request){try{const a=await access(req);return json({role:a.role,college:a.college,cohort:a.cohort,email:a.email});}catch(e){return failure(e);}}
