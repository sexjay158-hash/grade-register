import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './sqlite-d1.mjs';
import {storeSession,replacePassword,updateAccountAndRevoke} from '../lib/session-store.ts';
const d=sqliteD1();after(()=>d.sqlite.close());
d.sqlite.exec(`CREATE TABLE local_accounts(id TEXT PRIMARY KEY,username TEXT,active INTEGER,password_hash TEXT,salt TEXT,iterations INTEGER,updated TEXT);
 CREATE TABLE local_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT,created TEXT,expires TEXT);
 INSERT INTO local_accounts VALUES('user','teacher',1,'old','salt',600000,'2026-01-01');`);
const session=tokenHash=>({tokenHash,accountId:'user',created:'2026-10-20',expires:'2026-10-27'});
test('a stale password verification cannot create a session after password reset',async()=>{
 await storeSession(d,session('initial'),{username:'teacher',password_hash:'old'});
 await replacePassword(d,'user',{password_hash:'new',salt:'new-salt',iterations:600000},'2026-10-20','old');
 assert.equal((await d.prepare('SELECT COUNT(*) AS n FROM local_sessions').first()).n,0);
 await assert.rejects(storeSession(d,session('stale'),{username:'teacher',password_hash:'old'}),/状态已变化/);
 await storeSession(d,session('fresh'),{username:'teacher',password_hash:'new'});
 await assert.rejects(replacePassword(d,'user',{password_hash:'wrong',salt:'s',iterations:600000},'2026-10-20','old'),/密码已变化/);
 assert.equal((await d.prepare('SELECT password_hash FROM local_accounts').first()).password_hash,'new');
 assert.equal((await d.prepare('SELECT COUNT(*) AS n FROM local_sessions').first()).n,1,'a losing password reset must not revoke the winning session');
});
test('disabled accounts cannot get sessions, expired sessions are removed and updates revoke atomically',async()=>{
 d.sqlite.exec("INSERT INTO local_sessions VALUES('expired','user','2020-01-01','2020-01-02')");
 await storeSession(d,session('another'));assert.equal(await d.prepare("SELECT * FROM local_sessions WHERE token_hash='expired'").first(),null);
 await updateAccountAndRevoke(d,'user',d.prepare("UPDATE local_accounts SET active=0 WHERE id='user'"));
 assert.equal((await d.prepare('SELECT COUNT(*) AS n FROM local_sessions').first()).n,0);
 await assert.rejects(storeSession(d,session('disabled')),/状态已变化/);
});
