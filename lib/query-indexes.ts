import {db} from './server';

export async function initializeQueryIndexes(){
 const d=db();
 await d.batch([
  d.prepare('CREATE INDEX IF NOT EXISTS roster_scope_position ON roster_students(owner,year_id,college,active,position)'),
  d.prepare('CREATE INDEX IF NOT EXISTS events_group_status ON events(owner,group_id,status)'),
  d.prepare('CREATE INDEX IF NOT EXISTS intake_owner_batch ON intake(owner,batch_id)'),
  d.prepare('CREATE INDEX IF NOT EXISTS photos_event ON photos(event_id)'),
  d.prepare('CREATE INDEX IF NOT EXISTS intake_links_event ON intake_event_links(event_id)'),
  d.prepare('CREATE INDEX IF NOT EXISTS intake_links_photo ON intake_event_links(owner,intake_id)'),
  d.prepare('CREATE INDEX IF NOT EXISTS photo_actors_owner ON photo_actors(owner,account_id)'),
  d.prepare('CREATE TABLE IF NOT EXISTS group_cohort_versions(owner TEXT NOT NULL,year_id TEXT NOT NULL,revision INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,year_id))'),
  d.prepare('INSERT OR IGNORE INTO group_cohort_versions(owner,year_id,revision,applied) SELECT owner,id,1,0 FROM roster_years')
 ]);
 // Persist invalidations in SQLite so separate Worker isolates cannot serve stale cohort scopes.
 for(const table of ['roster_students','student_numbers'])for(const action of ['INSERT','UPDATE','DELETE']){
  const refs=action==='UPDATE'?['OLD','NEW']:[action==='DELETE'?'OLD':'NEW'];
  const statements=refs.map(ref=>`INSERT INTO group_cohort_versions(owner,year_id,revision,applied) VALUES(${ref}.owner,${ref}.year_id,1,0) ON CONFLICT(owner,year_id) DO UPDATE SET revision=revision+1;`).join(' ');
  await d.prepare(`CREATE TRIGGER IF NOT EXISTS ${table}_cohort_revision_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN ${statements} END`).run();
 }
}
