import {backupBeforeStart} from './data-backup.mjs';
import {spawn} from 'node:child_process';
await backupBeforeStart();
const child = spawn(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--inspector-port', '0', ...process.argv.slice(2)], {stdio:'inherit', windowsHide:true});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => {console.error(error.message); process.exitCode = 1;});
child.on('exit', code => {process.exitCode = code ?? 1;});
