import {db,bucket,access,requireEditor,json,failure,getEvent,type Access} from '@/lib/server';
import {readBody} from '@/lib/server';
import {matchLines} from '@/lib/domain';
import {arrangeBaiduOcr,baiduAccessToken,baiduOcrError} from '@/lib/baidu-ocr-response';
import {FEATURES} from '@/lib/flags';
import {validatedOcrLines} from '@/lib/ocr-lines';
import {assertEventScope,assertPhotoScope,scopeCohortExpr,cohortJoin} from '@/lib/role-scope';
async function membersFor(a:Access,groupId:string){const rows=await db().prepare(`SELECT s.sid,COALESCE(sn.number,s.sid) AS student_number,s.name,s.college,${scopeCohortExpr()} AS cohort FROM roster_students s ${cohortJoin()} WHERE s.owner=? AND s.group_id=? AND s.active=1`).bind(a.owner,groupId).all<{sid:string;name:string;college:string;cohort:string}>();return rows.results.filter(s=>a.role==='admin'||s.college===a.college&&(a.groupId?groupId===a.groupId:a.role!=='recorder'||s.cohort===a.cohort));}
export async function POST(req:Request){try{
 const a=await access(req);requireEditor(a);const u=a.owner;if(!FEATURES.photoRecognition)throw new Error('照片识别功能已关闭');
 const {apiKey,secretKey,eventId,photoId,action,recognizedLines,recognizedRatingText}=await readBody(req);
 if(FEATURES.adminRecognitionSettings&&a.role!=='admin'&&(action==='test'||recognizedLines===undefined))throw new Error('无权限：识别服务设置仅管理员可操作');
 if(action!=='test'){await assertEventScope(a,String(eventId),true);await assertPhotoScope(req,'photo',String(photoId));}
 if(FEATURES.localRapidOcr&&recognizedLines!==undefined){
  const event=await getEvent(eventId,u);if(event.status!=='draft')throw new Error('请先撤回登记，再重新识别');
  const photo=await db().prepare('SELECT id FROM photos WHERE id=? AND event_id=? AND owner=?').bind(photoId,eventId,u).first();if(!photo)throw new Error('照片不属于本次活动');
  const lines=validatedOcrLines(recognizedLines);
  const members=await membersFor(a,event.group_id);
  return json({...matchLines(lines,members),lines,ratingText:typeof recognizedRatingText==='string'?recognizedRatingText:''});
 }
 if(typeof apiKey!=='string'||!apiKey.trim()||typeof secretKey!=='string'||!secretKey.trim())throw new Error('请先在识别设置中填写百度 OCR API Key 和 Secret Key');
 const tokenResponse=await fetch('https://aip.baidubce.com/oauth/2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:apiKey.trim(),client_secret:secretKey.trim()}),signal:AbortSignal.timeout(30000)});
 const token=baiduAccessToken(await tokenResponse.json());if(!tokenResponse.ok||!token)throw new Error('识别服务连接失败，请检查 API Key、Secret Key 和服务权限');
 if(action==='test')return json({ok:true});
 const event=await getEvent(eventId,u);if(event.status!=='draft')throw new Error('请先撤回登记，再重新识别');
 const p=await db().prepare('SELECT id FROM photos WHERE id=? AND event_id=? AND owner=?').bind(photoId,eventId,u).first();if(!p)throw new Error('照片不属于本次活动');
 const f=await bucket().get(`${u}/${photoId}`);if(!f)throw new Error('照片暂不可用');
 const bytes=new Uint8Array(await f.arrayBuffer());if(bytes.length>3*1024*1024)throw new Error('这张照片过大，请压缩到 3 MB 以下后上传识别');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const response=await fetch('https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({image:btoa(binary),probability:'true',recognize_granularity:'big'}),signal:AbortSignal.timeout(60000)});
 const result:unknown=await response.json(),error=baiduOcrError(result);if(!response.ok||error)throw new Error(`识别服务返回错误（${error??response.status}），请检查额度、权限或照片格式`);
 const {lines,ratingText}=arrangeBaiduOcr(result);
 const members=await membersFor(a,event.group_id);
 return json({...matchLines(lines,members),lines,ratingText});
}catch(e){return failure(e);}}
