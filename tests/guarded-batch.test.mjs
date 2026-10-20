import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './sqlite-d1.mjs';
import {guardedBatch,writableGroupGuard,accountWriteGuard,writableYearGuard} from '../lib/guarded-batch.ts';
const d=sqliteD1();after(()=>d.sqlite.close());
d.sqlite.exec(`CREATE TABLE records(id TEXT PRIMARY KEY,value INTEGER);INSERT INTO records VALUES('score',80);
 CREATE TABLE roster_years(id TEXT,owner TEXT);INSERT INTO roster_years VALUES('year','school');
 CREATE TABLE roster_groups(id TEXT,owner TEXT,year_id TEXT,college TEXT);INSERT INTO roster_groups VALUES('group','school','year','college');
 CREATE TABLE colleges(owner TEXT,name TEXT,active INTEGER);INSERT INTO colleges VALUES('school','college',1);
 CREATE TABLE semester_archives(owner TEXT,year_id TEXT);
 CREATE TABLE group_cohorts(owner TEXT,group_id TEXT,cohort TEXT);INSERT INTO group_cohorts VALUES('school','group','2024');
 CREATE TABLE local_accounts(id TEXT,active INTEGER,role TEXT,college TEXT,cohort TEXT);INSERT INTO local_accounts VALUES('user',1,'recorder','college','2024');`);
const a={userId:'user',owner:'school',role:'recorder',college:'college',cohort:'2024'};
const update=()=>d.prepare("UPDATE records SET value=90 WHERE id='score'");
test('a failed precondition rolls back every write and leaves no guard rows',async()=>{
 await assert.rejects(guardedBatch(d,[update()],[{sql:'0',values:[]}],'版本变化'),/版本变化/);
 assert.equal((await d.prepare('SELECT value FROM records').first()).value,80);
 assert.equal((await d.prepare('SELECT COUNT(*) AS n FROM mutation_guards').first()).n,0);
});
test('a mid-batch constraint failure rolls back earlier statements too',async()=>{
 await assert.rejects(guardedBatch(d,[update(),d.prepare("INSERT INTO records VALUES('score',99)")],[{sql:'1',values:[]}]));
 assert.equal((await d.prepare('SELECT value FROM records').first()).value,80);
 assert.equal((await d.prepare('SELECT COUNT(*) AS n FROM mutation_guards').first()).n,0);
});
test('archive, account revocation and group reassignment are checked inside the write transaction',async()=>{
 const checks=()=>[writableYearGuard('school','year'),writableGroupGuard('school','group',a),accountWriteGuard(a)];
 d.sqlite.exec("INSERT INTO semester_archives VALUES('school','year')");await assert.rejects(guardedBatch(d,[update()],checks()));d.sqlite.exec('DELETE FROM semester_archives');
 d.sqlite.exec('UPDATE local_accounts SET active=0');await assert.rejects(guardedBatch(d,[update()],checks()));d.sqlite.exec('UPDATE local_accounts SET active=1');
 d.sqlite.exec("UPDATE group_cohorts SET cohort='2025'");await assert.rejects(guardedBatch(d,[update()],checks()));d.sqlite.exec("UPDATE group_cohorts SET cohort='2024'");
 assert.equal((await d.prepare('SELECT value FROM records').first()).value,80);
 const result=await guardedBatch(d,[update()],checks());assert.equal(result.length,1);assert.equal(result[0].meta.changes,1);
 assert.equal((await d.prepare('SELECT value FROM records').first()).value,90);
 assert.equal((await d.prepare('SELECT COUNT(*) AS n FROM mutation_guards').first()).n,0);
});
