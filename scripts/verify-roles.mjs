import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const stateDir=mkdtempSync(path.join(root,'.tmp-role-verify-'));
const token=randomBytes(32).toString('hex');
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
let worker;
let workerOutput='';

function run(args,env=process.env){
 const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${args.join(' ')} failed\n${(result.stderr||result.stdout).slice(-4000)}`);
 return result.stdout.trim();
}
function runWithWorker(args,env){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='',errors='';
  child.stdout.on('data',chunk=>{output+=chunk.toString();});
  child.stderr.on('data',chunk=>{errors+=chunk.toString();});
  child.once('error',reject);
  child.once('exit',code=>code===0?resolve(output.trim()):reject(new Error(`${args.join(' ')} failed\n${(errors||output).slice(-4000)}`)));
 });
}
async function freePort(){
 const server=net.createServer();
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}
async function waitForWorker(url){
 const end=Date.now()+30000;
 while(Date.now()<end){
  if(worker.exitCode!==null)throw new Error(`Worker stopped before ready\n${workerOutput.slice(-4000)}`);
  try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});if(response.ok)return;}catch{}
  await pause(250);
 }
 throw new Error(`Worker did not become ready\n${workerOutput.slice(-4000)}`);
}
async function stopWorker(){
 if(!worker||worker.exitCode!==null)return;
 const exited=new Promise(resolve=>worker.once('exit',resolve));
 worker.kill('SIGINT');
 await Promise.race([exited,pause(3000)]);
 if(worker.exitCode===null){worker.kill('SIGTERM');await Promise.race([exited,pause(3000)]);}
}
async function cleanState(){
 if(path.dirname(stateDir)!==root)throw new Error('Unexpected test data directory');
 for(let attempt=0;attempt<8;attempt++){
  try{if(existsSync(stateDir))rmSync(stateDir,{recursive:true});return;}
  catch(error){if(attempt===7)throw error;await pause(300);}
 }
}

try{
 console.log(process.argv.includes('--skip-build')?'Using the already verified build…':'Building current source…');
 if(!process.argv.includes('--skip-build'))run(['scripts/run-framework.mjs','build']);
 console.log('Applying migrations to an isolated database…');
 const migrations=readdirSync(path.join(root,'drizzle')).filter(name=>name.endsWith('.sql')).sort();
 for(const file of migrations)run([...wrangler,'d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',stateDir,'--file',path.join(root,'drizzle',file)]);
 const port=await freePort();
 const base=`http://127.0.0.1:${port}/api/`;
 worker=spawn(process.execPath,[...wrangler,'dev','--config','dist/server/wrangler.json','--local','--persist-to',stateDir,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--var',`ADMIN_SETUP_TOKEN:${token}`],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
 for(const stream of [worker.stdout,worker.stderr])stream.on('data',chunk=>{workerOutput=(workerOutput+chunk.toString()).slice(-10000);});
 await waitForWorker(`http://127.0.0.1:${port}/login`);
 console.log('Checking account setup, three roles, rosters, grades, photos and exports…');
 console.log(await runWithWorker([process.argv.includes('--races')?'tests/stability-races.integration.mjs':'tests/roles.integration.mjs'],{...process.env,TEST_BASE_URL:base,TEST_BOOTSTRAP_TOKEN:token,STABILITY_REPORT_DIR:process.env.STABILITY_REPORT_DIR??path.resolve(root,'..','reports','full-stability-20261020')}));
}catch(error){
 console.error(workerOutput.slice(-4000).replaceAll(token,'[test token]'));
 throw error;
}finally{
 await stopWorker();
 await cleanState();
}
