import test from 'node:test';
import assert from 'node:assert/strict';
import {isActivityDate} from '../lib/activity-date.ts';
test('calendar dates reject overflow and accept leap days without timezone conversion',()=>{
 for(const date of ['2024-02-29','2026-10-20','2026-12-31'])assert.equal(isActivityDate(date),true,date);
 for(const date of ['2026-02-29','2026-02-31','2026-04-31','2026-00-12','2026-13-01','2026-01-00','2026-1-1','2026-10-20T00:00:00Z',null])assert.equal(isActivityDate(date),false,String(date));
});
