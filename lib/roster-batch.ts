export const ROSTER_BATCH_SIZE=500;

type Result={students:number;groups:number;skipped:number};

export async function uploadRosterBatches<Row>(rows:Row[],upload:(batch:Row[])=>Promise<Result>,onProgress:(done:number,total:number)=>void):Promise<Result>{
 const result:Result={students:0,groups:0,skipped:0};
 for(let start=0;start<rows.length;start+=ROSTER_BATCH_SIZE){
  let part:Result;
  try{part=await upload(rows.slice(start,start+ROSTER_BATCH_SIZE));}
  catch(error){const reason=error instanceof Error?error.message:'导入失败';throw new Error(`名单已处理 ${start}/${rows.length} 人：${reason}。可重新选择同一文件继续，已有学号会跳过`);}
  result.students+=part.students;result.groups+=part.groups;result.skipped+=part.skipped;
  onProgress(Math.min(start+ROSTER_BATCH_SIZE,rows.length),rows.length);
 }
 return result;
}
