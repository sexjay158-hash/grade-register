export function canDeleteActivity(role:string,status:string,readOnly:boolean,recorderDraftDeletion:boolean){
 if(readOnly||!['draft','committed'].includes(status))return false;
 return role==='admin'||role==='college_lead'||role==='recorder'&&recorderDraftDeletion&&status==='draft';
}
