import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const tests=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
if(!tests.length)throw new Error('No unit tests found');
const child=spawnSync(process.execPath,['--experimental-strip-types','--import','./scripts/register-test-loader.mjs','--test',...tests],{cwd:root,stdio:'inherit',windowsHide:true});
if(child.error)throw child.error;
process.exitCode=child.status??1;
