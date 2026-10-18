export type ImportedStudent={sid:string;name:string;college:string;group:string;cohort:string};

const aliases={
 sid:['学号','学生学号'],
 name:['姓名','学生姓名'],
 college:['院系','学院','所属学院','院系名称'],
 group:['小组名称','小组','活动小组','组别'],
 cohort:['入学年级','入学年份','年级']
} as const;

function headerText(value:unknown){return String(value??'').normalize('NFKC').replace(/\s|[：:]/g,'').trim();}
function cellText(value:unknown){return String(value??'').normalize('NFKC').trim();}
function column(row:unknown[],names:readonly string[]){return row.findIndex(value=>names.includes(headerText(value)));}

export function parseRosterRows(data:unknown[][],rawData?:unknown[][]):ImportedStudent[]{
 const header=data.findIndex(row=>column(row,aliases.sid)>=0&&column(row,aliases.name)>=0&&column(row,aliases.group)>=0);
 if(header<0)throw new Error('第一张工作表须包含学号、姓名、小组名称（或“小组”）列；全校导入还需院系（或“学院”）列');
 const headings=data[header],sidCol=column(headings,aliases.sid),nameCol=column(headings,aliases.name),groupCol=column(headings,aliases.group),collegeCol=column(headings,aliases.college),cohortCol=column(headings,aliases.cohort);
 const students:ImportedStudent[]=[],seen=new Map<string,number>();
 for(let index=header+1;index<data.length;index++){
  const row=data[index],displaySid=cellText(row[sidCol]),rawSid=rawData?.[index]?.[sidCol];
  if(typeof rawSid==='number'&&!Number.isSafeInteger(rawSid))throw new Error(`Excel 第 ${index+1} 行学号数值超出精确范围，请在原始名单中将学号保存为文本`);
  const sid=(typeof rawSid==='number'&&/[eE][+-]?\d+$/.test(displaySid)?String(rawSid):displaySid).replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,''),name=cellText(row[nameCol]),group=cellText(row[groupCol]),college=collegeCol<0?'':cellText(row[collegeCol]),cohort=cohortCol<0?'':cellText(row[cohortCol]);
  // Exported score sheets have a second header row with activity subheadings
  // but no roster fields. It is not a student record.
  if(!sid&&!name&&!group&&!college&&!cohort)continue;
  const number=index+1;
  if(!sid||!name||!group)throw new Error(`Excel 第 ${number} 行缺少${!sid?'学号':!name?'姓名':'小组名称'}，请修正后重新导入`);
  if(seen.has(sid))throw new Error(`Excel 第 ${number} 行学号 ${sid} 重复（首次在第 ${seen.get(sid)} 行）`);
  seen.set(sid,number);students.push({sid,name,college,group,cohort});
 }
 if(!students.length)throw new Error('第一张工作表中没有可导入的学生');
 return students;
}
