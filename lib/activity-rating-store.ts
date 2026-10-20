import {initializeOnce} from './query-initialization';
import {db} from '@/lib/server';

export async function ensureActivityRatings(){
 await initializeOnce('rating-schema',async()=>{await db().prepare('CREATE TABLE IF NOT EXISTS event_ratings(event_id TEXT PRIMARY KEY,owner TEXT NOT NULL,rating TEXT NOT NULL,updated TEXT NOT NULL)').run();});
}
