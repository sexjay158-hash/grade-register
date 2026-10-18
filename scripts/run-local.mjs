import {existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {readExecutionProfile} from './execution-profile.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const mode=process.argv[2];
if(!['dev','rapidocr'].includes(mode))throw new Error('Expected dev or rapidocr.');
const python=path.join(root,'.venv-rapidocr',process.platform==='win32'?'Scripts/python.exe':'bin/python');

function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:false});if(result.error)throw result.error;if(result.status!==0)throw new Error(`${command} failed (${result.status})`);}
function start(command,args){return spawn(command,args,{cwd:root,stdio:'inherit',shell:false,windowsHide:true});}
function portOpen(port,host='127.0.0.1'){return new Promise(resolve=>{const socket=net.connect({host,port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.setTimeout(1500,()=>{socket.destroy();resolve(false);});});}

if(mode==='dev'&&readExecutionProfile()==='managed-linux'){
 const child=start(process.execPath,['scripts/run-framework.mjs','dev',...process.argv.slice(3)]);
 child.on('exit',code=>process.exit(code??1));
}else{
 if(!existsSync(python)){
  console.log('首次使用：创建本地 RapidOCR 环境…');
  run(process.platform==='win32'?'python':'python3',['-m','venv','.venv-rapidocr']);
 }
 const check=spawnSync(python,['-c','import rapidocr, onnxruntime'],{cwd:root,stdio:'ignore'});
 if(check.status!==0){console.log('首次使用：安装免费 RapidOCR 模型与运行依赖…');run(python,['-m','pip','install','--disable-pip-version-check','-r','requirements-rapidocr.txt']);}
 const existingService=await portOpen(8765);
 const service=existingService?null:start(python,['scripts/rapidocr-server.py']);
 if(existingService)console.log('本机 8765 端口已有识别服务；继续使用现有进程。');
 let app=null;
 let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;if(app)app.kill();if(service)service.kill();};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 service?.on('error',error=>{console.error('RapidOCR 启动失败：',error);stop();process.exitCode=1;});
 service?.on('exit',code=>{if(!stopping){console.error(`RapidOCR 服务停止（${code??'未知原因'}）`);if(app)app.kill();process.exitCode=1;}});
 if(mode==='dev'){
  if(await portOpen(5173)||await portOpen(5173,'::1'))console.log('本机 5173 端口已有网站；保持现有网站运行，仅启动 RapidOCR。');
  else{
   app=start(process.execPath,['scripts/run-framework.mjs','dev',...process.argv.slice(3)]);
   app.on('error',error=>{console.error('网站启动失败：',error);stop();process.exitCode=1;});
   app.on('exit',code=>{if(!stopping){process.exitCode=code??1;stop();}});
  }
 }
}
