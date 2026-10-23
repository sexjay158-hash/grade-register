import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
export const backupRoot = path.resolve(root, '..', 'backups', 'business-data');
export const stateRoot = path.join(root, '.wrangler', 'state');
const format = 'grade-register-local-state-v1';

async function filesIn(directory, prefix = '') {
 const result = [];
 for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
  const name = prefix + entry.name;
  if (entry.isSymbolicLink()) throw new Error('Links are not supported');
  if (entry.isDirectory()) result.push(...await filesIn(path.join(directory, entry.name), name + '/'));
  else if (entry.isFile()) result.push(name);
  else throw new Error('Unsupported file type');
 }
 return result.sort();
}
async function digest(file) {
 const hash = createHash('sha256');
 for await (const chunk of createReadStream(file)) hash.update(chunk);
 return hash.digest('hex');
}
function inside(parent, child) {
 const rel = path.relative(parent, child);
 return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
async function checkSqlite(directory, names) {
 const {DatabaseSync} = await import('node:sqlite');
 for (const name of names.filter(name => name.endsWith('.sqlite'))) {
  const db = new DatabaseSync(path.join(directory, name), {readOnly:true});
  try {
   const rows = db.prepare('PRAGMA integrity_check').all();
   if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') throw new Error(`SQLite integrity check failed: ${name}`);
  } finally { db.close(); }
 }
}
export async function verifyBackup(directory) {
 const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
 if (manifest.format !== format || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid backup manifest');
 const state = path.join(directory, 'state');
 const actual = await filesIn(state);
 const expected = manifest.files.map(entry => entry.path);
 if (new Set(expected).size !== expected.length || JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error('Backup file list mismatch');
 for (const entry of manifest.files) {
  if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.split('/').some(p => !p || p === '.' || p === '..') || !inside(state, path.resolve(state, entry.path))) throw new Error('Unsafe backup path');
  const file = path.join(state, entry.path);
  if ((await fs.stat(file)).size !== entry.size || await digest(file) !== entry.sha256) throw new Error(`Backup checksum mismatch: ${entry.path}`);
 }
 // Check a disposable copy: SQLite may create sidecars even for read-only connections.
 const scratch = await fs.mkdtemp(path.join(path.dirname(directory), '.verify-'));
 try { await fs.cp(state, path.join(scratch, 'state'), {recursive:true}); await checkSqlite(path.join(scratch, 'state'), actual); }
 finally { await fs.rm(scratch, {recursive:true, force:true}); }
 return manifest;
}
export async function createBackup({source = stateRoot, destinationRoot = backupRoot, copy} = {}) {
 source = path.resolve(source); destinationRoot = path.resolve(destinationRoot);
 if (inside(source, destinationRoot) || inside(destinationRoot, source)) throw new Error('Backup and source directories must be separate');
 await fs.mkdir(destinationRoot, {recursive:true});
 const lock = path.join(destinationRoot, '.backup-lock');
 await fs.mkdir(lock); // Concurrent backup attempts must fail closed.
 let staging;
 try {
  staging = await fs.mkdtemp(path.join(destinationRoot, '.pending-'));
  const state = path.join(staging, 'state');
  if (copy) await copy(source, state);
  else {
   if (process.platform !== 'win32') throw new Error('Offline backup currently supports Windows only');
   const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./copy-offline-state.ps1', import.meta.url)), '-Source', source, '-Destination', state], {encoding:'utf8', windowsHide:true});
   if (result.error || result.status !== 0) throw new Error('Cannot take an offline snapshot. Stop the website before backing up. ' + (result.error?.message ?? result.stderr?.trim() ?? ''));
  }
  const names = await filesIn(state);
  if (!names.some(n => n.startsWith('v3/d1/') && n.endsWith('.sqlite')) || !names.some(n => n.startsWith('v3/r2/') && n.endsWith('.sqlite'))) throw new Error('Missing D1 or R2 state');
  const files = [];
  for (const name of names) files.push({path:name, size:(await fs.stat(path.join(state, name))).size, sha256:await digest(path.join(state, name))});
  await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({format, createdAt:new Date().toISOString(), node:process.version, files}, null, 2), {flag:'wx'});
  await verifyBackup(staging);
  const destination = path.join(destinationRoot, `state-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`);
  await fs.rename(staging, destination); staging = null;
  return destination;
 } finally {
  if (staging) await fs.rm(staging, {recursive:true, force:true});
  await fs.rm(lock, {recursive:true, force:true});
 }
}
export async function restoreBackup(backup, destination) {
 backup = path.resolve(backup); destination = path.resolve(destination);
 if (inside(stateRoot, destination) || inside(destination, stateRoot) || inside(backup, destination) || inside(destination, backup)) throw new Error('Restore must use an isolated new directory');
 await verifyBackup(backup);
 await fs.mkdir(destination); // Never overwrite an existing destination.
 try {
  await fs.cp(path.join(backup, 'state'), path.join(destination, 'state'), {recursive:true});
  await fs.copyFile(path.join(backup, 'manifest.json'), path.join(destination, 'manifest.json'));
  await verifyBackup(destination);
 } catch (error) { await fs.rm(destination, {recursive:true, force:true}); throw error; }
 return destination;
}
export async function backupBeforeStart() {
 if (process.env.LOCAL_DATA_BACKUP === '0') return;
 if (!await fs.stat(stateRoot).catch(() => null)) return;
 try { console.log('启动前业务数据备份：' + await createBackup()); }
 catch { console.warn('业务数据未备份：数据可能正在使用、被锁定或磁盘不可写。请停服后执行 npm run data:backup 查看错误。网站继续启动。'); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'create' && !args.length) console.log(await createBackup());
  else if (command === 'verify' && args.length === 1) console.log('Verified:', (await verifyBackup(path.resolve(args[0]))).createdAt);
  else if (command === 'restore' && args.length === 2) console.log(await restoreBackup(...args));
  else throw new Error('Usage: data-backup.mjs create | verify BACKUP | restore BACKUP NEW_DIRECTORY');
 } catch (error) { console.error(error.message); process.exitCode = 1; }
}
