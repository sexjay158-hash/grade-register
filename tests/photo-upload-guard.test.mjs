import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './sqlite-d1.mjs';
import {guardedBatch} from '../lib/guarded-batch.ts';
import {newPhotoHashGuard} from '../lib/photo-upload-guard.ts';
const d=sqliteD1();after(()=>d.sqlite.close());
d.sqlite.exec('CREATE TABLE photos(id TEXT PRIMARY KEY,owner TEXT,hash TEXT);CREATE TABLE intake(id TEXT PRIMARY KEY,owner TEXT,hash TEXT);');

test('uploads reject an existing hash in either table at transaction time and roll back related writes',async()=>{
 for(const table of ['photos','intake']){
  d.sqlite.exec('DELETE FROM photos;DELETE FROM intake;');
  // Simulate a competing upload committing after the initial application lookup.
  d.sqlite.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run('existing','school','hash');
  const other=table==='photos'?'intake':'photos';
  await assert.rejects(guardedBatch(d,[d.prepare(`INSERT INTO ${other} VALUES(?,?,?)`).bind('new','school','hash')],[newPhotoHashGuard('school','hash')]),/数据已变化/);
  assert.equal(d.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${other}`).get().n,0);
  await guardedBatch(d,[d.prepare(`INSERT INTO ${other} VALUES(?,?,?)`).bind('distinct','school','different')],[newPhotoHashGuard('school','different')]);
  assert.equal(d.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${other}`).get().n,1);
 }
});
