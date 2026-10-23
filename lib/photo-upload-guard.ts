import type {WriteGuard} from './guarded-batch';

// Both upload entry points must check both tables in the write transaction.
export const newPhotoHashGuard=(owner:string,hash:string):WriteGuard=>({
 sql:'NOT EXISTS(SELECT 1 FROM photos WHERE owner=? AND hash=?) AND NOT EXISTS(SELECT 1 FROM intake WHERE owner=? AND hash=?)',
 values:[owner,hash,owner,hash]
});
