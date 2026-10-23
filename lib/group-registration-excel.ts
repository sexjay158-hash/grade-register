export type ExportedGroup={college:string;cohort:string;group_name:string;leader_sid:string;members:{sid:string;name:string}[];status:string;created:string;reviewed?:string|null;reviewer?:string|null;note?:string|null};
const statusName:Record<string,string>={pending:'待审核',reviewing:'处理中',approved:'已通过',rejected:'已退回'};
export async function downloadGroupRegistrationWorkbook(year:string,groups:ExportedGroup[]){
 const XLSX=await import('xlsx');
 const heading=['学期','学院','入学年级','小组名称','组长学号','组长姓名','人数','报名状态','提交时间','审核时间','审核人','退回原因'];
 const groupRows=groups.map(group=>[year,group.college,group.cohort,group.group_name,group.leader_sid,group.members.find(member=>member.sid===group.leader_sid)?.name??'',group.members.length,statusName[group.status]??group.status,group.created,group.reviewed??'',group.reviewer??'',group.note??'']);
 const memberRows=groups.flatMap(group=>group.members.map(member=>[year,group.college,group.cohort,group.group_name,group.leader_sid,member.sid,member.name,member.sid===group.leader_sid?'是':'否',statusName[group.status]??group.status]));
 const count=new Map<string,{college:string;cohort:string;status:string;groups:number;members:number}>();
 for(const group of groups){const key=JSON.stringify([group.college,group.cohort,group.status]);const row=count.get(key)??{college:group.college,cohort:group.cohort,status:group.status,groups:0,members:0};row.groups++;row.members+=group.members.length;count.set(key,row);}
 const summaryRows=[...count.values()].sort((a,b)=>a.college.localeCompare(b.college,'zh-CN')||a.cohort.localeCompare(b.cohort)||a.status.localeCompare(b.status)).map(row=>[year,row.college,row.cohort,statusName[row.status]??row.status,row.groups,row.members]);
 const wb=XLSX.utils.book_new();
 for(const [name,rows,widths] of [
  ['报名小组',[heading,...groupRows],[25,24,12,30,18,14,8,12,23,23,18,32]],
  ['成员明细',[['学期','学院','入学年级','小组名称','组长学号','成员学号','成员姓名','是否组长','报名状态'],...memberRows],[25,24,12,30,18,18,14,10,12]],
  ['学院年级统计',[['学期','学院','入学年级','报名状态','小组数','人数'],...summaryRows],[25,24,12,12,10,10]]
 ] as [string,(string|number)[][],number[]][]) {const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=widths.map(wch=>({wch}));XLSX.utils.book_append_sheet(wb,sheet,name);}
 XLSX.writeFile(wb,`${year.replace(/[\\/:*?"<>|]/g,'_')}_小组报名_${new Date().toISOString().slice(0,10)}.xlsx`);
}
