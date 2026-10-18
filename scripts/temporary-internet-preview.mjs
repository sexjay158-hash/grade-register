import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {TEMPORARY_INTERNET_PREVIEW} from '../lib/temporary-preview-config.mjs';
import {createPreviewProxy} from './temporary-preview-proxy.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const runtime=path.join(root,'.sites-runtime');
const statePath=path.join(runtime,'internet-preview.json');
async function readState(){try{return JSON.parse(await readFile(statePath,'utf8'));}catch{return null;}}
async function stopExisting(){const state=await readState();if(!state)return false;try{const response=await fetch(`http://127.0.0.1:${state.port}/__preview_control__/stop`,{method:'POST',headers:{'x-preview-stop':state.stopToken},signal:AbortSignal.timeout(3000)});return response.ok;}catch{return false;}}
if(process.argv[2]==='stop'){
 console.log(await stopExisting()?'临时外网连接已关闭；原来运行的网站和成绩数据保留。':'没有正在运行的临时外网连接。');
 process.exit(0);
}
if(!TEMPORARY_INTERNET_PREVIEW)throw new Error('临时外网验收已关闭，请检查 lib/temporary-preview-config.mjs。');
if(await readState()){
 const old=await readState();
 try {const result=await fetch(`http://127.0.0.1:${old.port}/`,{signal:AbortSignal.timeout(1000)});if(result.status===403){console.log('临时验收已经在运行：'+(old.url??'正在连接，请稍候'));process.exit(0);}}catch{}
 await rm(statePath,{force:true});
}

let app=null,tunnel=null,proxy=null,stopping=false,publicOrigin=null;
let stateWrite=Promise.resolve();
const stopToken=randomBytes(24).toString('hex');
async function stop(code=0){if(stopping)return;stopping=true;tunnel?.kill();if(app){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(app.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else app.kill();}proxy?.closeAllConnections();proxy?.close();await stateWrite.catch(()=>{});const state=await readState();if(state?.pid===process.pid)await rm(statePath,{force:true});process.exit(code);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
function child(command,args,options={}){const value=spawn(command,args,{cwd:root,windowsHide:true,shell:false,...options});value.on('error',error=>{console.error(error.message);void stop(1);});return value;}
async function ready(){try{return (await fetch('http://localhost:5173/login',{signal:AbortSignal.timeout(2500),redirect:'manual'})).status<500;}catch{return false;}}
try {
 if(!await ready()){
  console.log('正在启动本机网站和 RapidOCR…');
  app=child(process.execPath,['scripts/run-local.mjs','dev'],{stdio:'inherit'});
  app.on('exit',code=>{if(!stopping){console.error('本机网站停止，临时外网连接随之关闭。');void stop(code??1);}});
  const deadline=Date.now()+180000;
  while(!await ready()){if(Date.now()>deadline)throw new Error('本机网站启动超时。先运行 npm run dev 查看具体错误。');await new Promise(resolve=>setTimeout(resolve,1000));}
 }
 const tools=path.join(runtime,'tools');await mkdir(tools,{recursive:true});
 const executable=path.join(tools,process.platform==='win32'?'cloudflared.exe':'cloudflared');
 const toolVersion='2026.10.0';
 const expectedHash='86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c';
 if(existsSync(executable)&&process.platform==='win32'&&createHash('sha256').update(await readFile(executable)).digest('hex')!==expectedHash)await rm(executable);
 if(!existsSync(executable)){
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('此自动下载入口目前仅支持 Windows x64。');
  console.log('首次使用：下载 Cloudflare 官方临时连接工具…');
  const download=executable+'.download';
  try{
   const size=55365048,segmentSize=1024*1024;
   const releaseUrl=`https://github.com/cloudflare/cloudflared/releases/download/${toolVersion}/cloudflared-windows-amd64.exe`;
   const initial=await fetch(releaseUrl,{headers:{Range:'bytes=0-0'},signal:AbortSignal.timeout(30000)});
   if(initial.status!==206)throw new Error('连接工具下载失败：'+initial.status);
   const assetUrl=initial.url;await initial.arrayBuffer();
   const segments=new Array(Math.ceil(size/segmentSize));let next=0,done=0;
   await Promise.all(Array.from({length:6},async()=>{while(next<segments.length){const index=next++,first=index*segmentSize,last=Math.min(size-1,first+segmentSize-1);
    for(let attempt=0;attempt<3;attempt++)try{
     const response=await fetch(assetUrl,{headers:{Range:`bytes=${first}-${last}`},signal:AbortSignal.timeout(20000)});
     if(response.status!==206)throw new Error('连接工具下载失败：'+response.status);
     const content=Buffer.from(await response.arrayBuffer());if(content.length!==last-first+1)throw new Error('连接工具下载不完整');segments[index]=content;break;
    }catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
    if(++done%10===0)console.log(`连接工具已下载 ${done}/${segments.length} 段…`);
   }}));
   const content=Buffer.concat(segments);if(createHash('sha256').update(content).digest('hex')!==expectedHash)throw new Error('连接工具校验失败，请稍后重试');await writeFile(download,content);await rename(download,executable);
  }finally{await rm(download,{force:true});}
 }
 proxy=createPreviewProxy({getPublicOrigin:()=>publicOrigin,stopToken,onStop:()=>void stop()});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
 const port=proxy.address().port;
 await writeFile(statePath,JSON.stringify({pid:process.pid,port,stopToken,url:null}));
 console.log('正在建立临时外网连接，电脑需保持联网…');
 tunnel=child(executable,['tunnel','--no-autoupdate','--url',`http://127.0.0.1:${port}`,'--protocol','http2','--edge-ip-version','4'],{stdio:['ignore','pipe','pipe']});
 let buffer='';
 const connected=setTimeout(()=>{console.error('临时连接未能就绪，请检查当前网络能否连接 Cloudflare。');void stop(1);},90000);
 function output(chunk){buffer=(buffer+chunk.toString()).slice(-12000);const found=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(found&&!publicOrigin){publicOrigin=found[0];stateWrite=writeFile(statePath,JSON.stringify({pid:process.pid,port,stopToken,url:publicOrigin}));console.log('\n手机验收网址：'+publicOrigin+'\n仍使用你分配的账号密码登录；数据保存到本机。\n重新启动后网址会变化。结束验收运行 npm run preview:stop，或在本终端按 Ctrl+C。\n');}if(buffer.includes('Registered tunnel connection'))clearTimeout(connected);}
 tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);
 tunnel.on('exit',code=>{clearTimeout(connected);if(!stopping){console.error('临时连接停止。'+buffer.slice(-1800));void stop(code??1);}});
}catch(error){console.error(error.message);await stop(1);}
