const text=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const timestamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function fold(line){
 const encoder=new TextEncoder();let result='',bytes=0;
 for(const char of line){const size=encoder.encode(char).length;if(bytes+size>75){result+='\r\n ';bytes=1;}result+=char;bytes+=size;}return result;
}
export function createCalendar(match,{minutes=15,teams={},now=new Date()}={}){
 if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('提前分钟数必须为 1～1440 的整数');
 const start=Date.parse(match.startsAt);if(!Number.isFinite(start))throw new Error('官方尚未公布开赛时间');
 if(match.status!=='upcoming'||start<=Number(now))throw new Error('只能为未开始的比赛添加日历');
 const opponents=match.game==='apex'?'多队积分赛':(match.teams||[]).map(id=>teams[id]?.short||teams[id]?.name||'待官方公布').join(' VS ');
 const summary=opponents+' · '+(match.event||'官方赛事');
 const description=[match.event,match.stage,'官方页面：'+(match.sourceUrl||''),'以官方最新赛程为准。比赛改期后，请重新导入或修改日历事件。'].filter(Boolean).join('\n');
 const uid=encodeURIComponent(match.id)+'@matchpoint';
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Matchpoint//Official Match Reminder//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+timestamp(now),'DTSTART:'+timestamp(start),'SUMMARY:'+text(summary),'DESCRIPTION:'+text(description),'STATUS:CONFIRMED','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-PT'+minutes+'M','DESCRIPTION:'+text('比赛即将开始：'+summary),'END:VALARM','END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export function downloadCalendar(match,options){
 const content=createCalendar(match,options),url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=('赛点-'+(match.event||'比赛')+'.ics').replace(/[\\/:*?"<>|]/g,'_');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
