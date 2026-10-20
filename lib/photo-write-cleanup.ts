import {MutationRejectedError} from './guarded-batch';
// A lost database response does not prove that the transaction failed. Deleting
// the object then could destroy a photo whose database row has already committed.
export async function cleanupRejectedPhoto(error:unknown,remove:()=>Promise<unknown>,confirmedRejected=false){
 const rolledBack=confirmedRejected||error instanceof MutationRejectedError||/SQLITE_CONSTRAINT|(?:UNIQUE|CHECK|FOREIGN KEY|NOT NULL) constraint failed/i.test(String(error));
 if(!rolledBack)return false;
 try{await remove();return true;}catch{return false;}
}
