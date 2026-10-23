import test from 'node:test';
import assert from 'node:assert/strict';
import {canDeleteActivity} from '../lib/activity-deletion.ts';
test('recorders can remove drafts only; managers retain confirmed activity deletion',()=>{
 for(const role of ['admin','college_lead'])for(const status of ['draft','committed'])assert.equal(canDeleteActivity(role,status,false,true),true);
 assert.equal(canDeleteActivity('recorder','draft',false,true),true);
 assert.equal(canDeleteActivity('recorder','committed',false,true),false);
 assert.equal(canDeleteActivity('recorder','draft',false,false),false);
 for(const role of ['admin','college_lead','recorder'])assert.equal(canDeleteActivity(role,'draft',true,true),false,'archives are read-only');
 assert.equal(canDeleteActivity('viewer','draft',false,true),false);
 assert.equal(canDeleteActivity('admin','unknown',false,true),false);
});
