import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const reportDir=process.env.STABILITY_REPORT_DIR??path.resolve(root,'..','reports',`quality-${new Date().toISOString().slice(0,10)}`);
const steps=[
 ['TypeScript',['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']],
 ['Unit tests',['scripts/test.mjs']],
 ...(process.argv.includes('--quick')?[]:[
  ['Production build',['scripts/run-framework.mjs','build']],
  ['Role integration',['scripts/verify-roles.mjs','--skip-build']],
  ['Concurrent write integration',['scripts/verify-roles.mjs','--skip-build','--races']],
 ]),
];
for(const [name,args] of steps){
 console.log(`\nChecking ${name}…`);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,STABILITY_REPORT_DIR:reportDir},stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>resolve(code??1));
 });
 if(code!==0){console.error(`Stopped: ${name} did not pass.`);process.exitCode=code;break;}
}
if(!process.exitCode)console.log(process.argv.includes('--quick')?'Quick checks passed. Full integration was not run.':`All checks passed. Integration reports: ${reportDir}`);
