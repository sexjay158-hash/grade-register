export function validatedOcrLines(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>300||!value.every(line=>typeof line==='string'&&line.length<=300))throw new Error('识别结果格式错误，请重新识别照片');
 const lines=value.map(line=>line.trim()).filter(Boolean);
 if(lines.join('').length>30000)throw new Error('识别结果过长，请拆分照片后重试');
 return lines;
}
