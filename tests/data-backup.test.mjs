import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createBackup, verifyBackup, restoreBackup} from '../scripts/data-backup.mjs';

async function fixture(run) {
 const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'grade-backup-test-'));
 try {
  const source = path.join(temp, 'source');
  for (const kind of ['d1', 'r2']) {
   const dir = path.join(source, 'v3', kind); await fs.mkdir(dir, {recursive:true});
   const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
   db.exec('CREATE TABLE records(value TEXT); INSERT INTO records VALUES (\'sample\')'); db.close();
  }
  await fs.writeFile(path.join(source, 'v3', 'r2', 'photo.bin'), Buffer.from([0,1,255,3]));
  const options = {source, destinationRoot:path.join(temp, 'backups'), copy:(src,dst) => fs.cp(src,dst,{recursive:true})};
  await run({temp, source, options});
 } finally { await fs.rm(temp, {recursive:true,force:true}); }
}
test('snapshot verifies and restores database and binary photos to an isolated directory', () => fixture(async ({temp, options}) => {
 const backup = await createBackup(options); const manifest = await verifyBackup(backup);
 assert.equal(manifest.files.length, 3);
 const restored = await restoreBackup(backup, path.join(temp,'restored'));
 assert.deepEqual(await fs.readFile(path.join(restored,'state/v3/r2/photo.bin')), Buffer.from([0,1,255,3]));
 const db = new DatabaseSync(path.join(restored,'state/v3/d1/test.sqlite'),{readOnly:true});
 try { assert.equal(db.prepare('SELECT value FROM records').get().value,'sample'); } finally { db.close(); }
 await assert.rejects(restoreBackup(backup, restored), /EEXIST/);
}));
test('tampering, missing and extra files fail verification', () => fixture(async ({options}) => {
 const backup = await createBackup(options); const photo = path.join(backup,'state/v3/r2/photo.bin');
 await fs.writeFile(photo, Buffer.from([0,1,255,4]));
 await assert.rejects(verifyBackup(backup), /checksum/);
 await fs.rm(photo); await assert.rejects(verifyBackup(backup), /file list/);
 await fs.writeFile(photo, Buffer.from([0,1,255,3]));
 await fs.writeFile(path.join(backup,'state/extra'), 'unexpected');
 await assert.rejects(verifyBackup(backup), /file list/);
}));
test('corrupt database cannot be published; failure removes staging and lock', () => fixture(async ({source, options}) => {
 await fs.writeFile(path.join(source,'v3/d1/test.sqlite'), 'not a database');
 await assert.rejects(createBackup(options));
 assert.deepEqual(await fs.readdir(options.destinationRoot), []);
}));
test('copy failure is cleaned up and cannot publish a backup', () => fixture(async ({options}) => {
 await assert.rejects(createBackup({...options, copy:async () => {throw new Error('busy');}}), /busy/);
 assert.deepEqual(await fs.readdir(options.destinationRoot), []);
}));
test('nested backup paths and restoring over source backups are refused', () => fixture(async ({source, options}) => {
 await assert.rejects(createBackup({...options,destinationRoot:path.join(source,'backup')}), /separate/);
 const backup = await createBackup(options);
 await assert.rejects(restoreBackup(backup,path.join(backup,'restore')), /isolated/);
}));
test('Windows offline copier handles real SQLite and binary files', {skip:process.platform !== 'win32'}, () => fixture(async ({options}) => {
 const {copy, ...offline} = options;
 await verifyBackup(await createBackup(offline));
}));
test('Windows refuses an open database without publishing partial state', {skip:process.platform !== 'win32'}, () => fixture(async ({source, options}) => {
 const db = new DatabaseSync(path.join(source,'v3/d1/test.sqlite'));
 const {copy, ...offline} = options;
 try {
  await assert.rejects(createBackup(offline), /offline snapshot/);
  assert.deepEqual(await fs.readdir(options.destinationRoot), []);
 } finally { db.close(); }
}));
