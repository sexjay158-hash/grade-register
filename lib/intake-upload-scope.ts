import {db} from './server';
import {initializeOnce} from './query-initialization';

// Immutable college ID from upload time; never derive historical ownership from
// the uploader's current account assignment or a client-supplied college name.
export async function ensureIntakeUploadScopes(){
 await initializeOnce('intake-upload-scopes',()=>db().prepare('CREATE TABLE IF NOT EXISTS intake_upload_scopes(owner TEXT NOT NULL,intake_id TEXT NOT NULL,college_id TEXT NOT NULL,PRIMARY KEY(owner,intake_id))').run());
}
export async function intakeUploadCollege(owner:string,id:string){
 await ensureIntakeUploadScopes();
 const row=await db().prepare('SELECT c.name FROM intake_upload_scopes s JOIN colleges c ON c.owner=s.owner AND c.id=s.college_id WHERE s.owner=? AND s.intake_id=?').bind(owner,id).first<{name:string}>();
 return row?.name??null;
}
