import {studentNumber} from './student-number';
type CandidateGroup={id:string;name:string};
type CandidateStudent={sid:string;student_number?:string;name:string;group_id:string};
export function detectGroup(lines:string[],groups:CandidateGroup[],students:CandidateStudent[],directScoreEntry=true){
 const text=lines.join(' '),flat=text.replace(/\s+/g,''),head=lines.slice(0,5).join('').replace(/\s+/g,'');
 const idHits=new Map<string,Set<string>>(),nameHits=new Map<string,Set<string>>(),scoredNameHits=new Map<string,Set<string>>(),pairHits=new Map<string,Set<string>>();
 const add=(map:Map<string,Set<string>>,group:string,sid:string)=>{if(!map.has(group))map.set(group,new Set());map.get(group)!.add(sid);};
 const nameCounts=new Map<string,number>();for(const s of students)nameCounts.set(s.name,(nameCounts.get(s.name)??0)+1);
 for(const s of students){
  if(/^\d{5,20}$/.test(studentNumber(s))&&new RegExp('(^|\\D)'+studentNumber(s)+'(?!\\d)').test(text))add(idHits,s.group_id,studentNumber(s));
  if(/^\d{5,20}$/.test(studentNumber(s))&&s.name?.length>=2&&lines.some(line=>{const compact=line.replace(/\s+/g,'');return compact.includes(studentNumber(s))&&compact.includes(s.name);}))add(pairHits,s.group_id,studentNumber(s));
  if(s.name?.length>=2&&nameCounts.get(s.name)===1&&flat.includes(s.name)){
   add(nameHits,s.group_id,studentNumber(s));
   if(lines.some(line=>line.replace(/\s+/g,'').includes(s.name)&&/\d+(?:\.\d+)?/.test(line.replaceAll(s.name,' '))))add(scoredNameHits,s.group_id,studentNumber(s));
  }
 }
 const names=groups.filter(g=>{const short=g.name.replace(/^机械工程学院/,'').replace(/\s+/g,'');return head.includes(g.name.replace(/\s+/g,''))||(short.length>=5&&head.includes(short));});
 const signals=groups.map(g=>({groupId:g.id,name:g.name,pairs:pairHits.get(g.id)?.size??0,ids:idHits.get(g.id)?.size??0,scoredNames:scoredNameHits.get(g.id)?.size??0,names:nameHits.get(g.id)?.size??0,header:names.some(n=>n.id===g.id)})).filter(s=>s.pairs||s.ids||s.names||s.header).sort((a,b)=>(b.pairs*8+b.ids*6+b.scoredNames*5+b.names+(b.header?3:0))-(a.pairs*8+a.ids*6+a.scoredNames*5+a.names+(a.header?3:0)));
 const best=signals[0],others=signals.filter(s=>s.groupId!==best?.groupId&&(s.pairs||s.ids||s.scoredNames||s.header));
 const safe=best&&others.length===0&&((directScoreEntry&&(best.pairs>=1||best.ids>=1||best.scoredNames>=1))||(best.names>=2&&best.header));
 return {groupId:safe?best.groupId:null,candidates:signals.slice(0,5),reason:safe?'':!best?'照片中没有足够的名单信息，无法判断小组':'小组证据不足或存在冲突，请核对照片'};
}
