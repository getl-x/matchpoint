import {runtimeConfig} from './config.mjs';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {discoverHistory,fetchHistory} from './providers/history.mjs';
import {archiveDiagrams} from '../src/diagrams.js';
export {archiveDiagrams} from '../src/diagrams.js';
const GAMES=['cs2','valorant','lol','apex'];
const DAY=86400000;
export function snapshotQuality(feed,standings){const matches=feed.matches;if(!matches.length)return 'unavailable';const unresolved=matches.some(m=>!['finished','cancelled'].includes(m.status)||(feed.game!=='apex'&&m.status==='finished'&&(!m.score||m.teams.some(t=>!t))));return unresolved||feed.partial||standings?.partial?'partial':'saved';}
const validPayload=(payload,id)=>payload?.record?.id===id&&payload.feed?.source?.retrievedAt&&Array.isArray(payload.feed.matches)&&payload.feed.events?.some(e=>e.id===id);
function retainedProvenance(ids,field,previous,retrievedAt){
 const old=previous.retained,times=Object.fromEntries(ids.map(id=>[id,old?.[field]?.includes(id)?old.retrievedAtById?.[id]||old.retrievedAt:retrievedAt]));
 return {[field]:ids,retrievedAt:Object.values(times).sort()[0],retrievedAtById:times};
}
export function createArchiveStore({directory=runtimeConfig.archiveDirectory,discover=discoverHistory,fetchEvent=fetchHistory,concurrency=2,now=Date.now}={}){
 const dir=resolve(directory),eventsDir=resolve(dir,'events');let index={version:1,records:{},sources:{},updatedAt:null},initialized=null,writeQueue=Promise.resolve(),syncWork=null,queue=[],active=0,closing=false;const pending=new Map(),refreshQueued=new Set();let observations={};
 async function atomic(file,value){await mkdir(eventsDir,{recursive:true});const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value),'utf8');await rename(tmp,file);}
 async function init(){if(!initialized)initialized=(async()=>{
  await mkdir(eventsDir,{recursive:true});
  try{const saved=JSON.parse(await readFile(resolve(dir,'index.json'),'utf8'));if(saved.version===1&&saved.records&&saved.sources)index=saved;}catch(e){if(e.code!=='ENOENT')console.warn('[Archive] index unavailable:',e.message);}
  try{observations=JSON.parse(await readFile(resolve(dir,'observed.json'),'utf8'));}catch{}
  let repaired=false;
  for(const r of Object.values(index.records))if(r.archiveStatus==='loading'){
   r.archiveStatus='queued';
   try{const saved=JSON.parse(await readFile(pathFor(r.id),'utf8'));if(validPayload(saved,r.id))Object.assign(r,saved.record,{archiveStatus:saved.record.scope==='observed'?'partial':snapshotQuality(saved.feed,saved.standings)});}catch{}
   repaired=true;
  }
  if(repaired)await persist();
 })().catch(error=>{initialized=null;throw error;});return initialized;}
 function persist(){index.updatedAt=new Date(now()).toISOString();const copy=JSON.stringify(index);writeQueue=writeQueue.catch(()=>{}).then(()=>atomic(resolve(dir,'index.json'),JSON.parse(copy)));return writeQueue;}
 const pathFor=id=>resolve(eventsDir,createHash('sha256').update(id).digest('hex')+'.json');
 function list(game='all'){const records=Object.values(index.records).filter(r=>game==='all'||r.game===game).sort((a,b)=>(b.startsAt||b.endsAt||b.year).localeCompare(a.startsAt||a.endsAt||a.year));return {version:1,records,sources:index.sources,updatedAt:index.updatedAt,progress:{discovering:!!syncWork,running:active>0||queue.length>0,pending:queue.length,active,total:records.length,saved:records.filter(r=>['saved','partial'].includes(r.archiveStatus)).length,complete:records.filter(r=>r.archiveStatus==='saved').length,unavailable:records.filter(r=>r.archiveStatus==='unavailable').length}};}
 async function saveEvent(record,result){
  let feed=result.feed,standings=result.standings||null,refreshWarning=null;if(!feed?.source?.retrievedAt||!Array.isArray(feed.matches)||!feed.matches.length||feed.game!==record.game||!feed.events?.some(e=>e.id===record.id))throw new Error('官方历史响应与赛事身份不一致');
  const archivedAt=new Date(now()).toISOString(),status=record.scope==='observed'?'partial':snapshotQuality(feed,result.standings);
  if(record.archivedAt&&status!=='saved'){
   let previous;try{previous=JSON.parse(await readFile(pathFor(record.id),'utf8'));}catch{}
   if(validPayload(previous,record.id)&&previous.record.archiveStatus==='saved'){
    const preserved={...previous,record:{...previous.record,lastAttemptAt:archivedAt,error:null,refreshWarning:'官网本次返回不完整，保留上次完整存档与原始读取时间'}};
    await atomic(pathFor(record.id),preserved);index.records[record.id]={...index.records[record.id],...preserved.record};await persist();return preserved;
   }
   if(validPayload(previous,record.id)){
    if(status==='partial'){
     const currentIds=new Set(feed.matches.map(m=>m.id)),retained=previous.feed.matches.filter(m=>!currentIds.has(m.id));
     if(retained.length){
      feed={...feed,teams:{...previous.feed.teams,...feed.teams},matches:[...new Map([...previous.feed.matches,...feed.matches].map(m=>[m.id,m])).values()].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)),retained:retainedProvenance(retained.map(m=>m.id),'matchIds',previous.feed,previous.feed.source.retrievedAt)};
      refreshWarning='官网本次返回不完整，缺失场次沿用此前读取的官方记录';
     }
    }
    if(previous.standings&&(!standings||standings.partial)){
     const currentIds=new Set((standings?.phases||[]).map(p=>p.id)),retained=previous.standings.phases.filter(p=>!currentIds.has(p.id));
     if(retained.length){standings={...previous.standings,...standings,partial:true,phases:[...new Map([...previous.standings.phases,...(standings?.phases||[])].map(p=>[p.id,p])).values()],retained:retainedProvenance(retained.map(p=>p.id),'phaseIds',previous.standings,previous.standings.retrievedAt||previous.feed.source.retrievedAt)};refreshWarning='官网本次返回不完整，缺失积分沿用此前读取的官方记录';}
    }
   }
  }
  const payload={version:1,record:{...record,archiveStatus:status,archivedAt,matchCount:feed.matches.length,refreshWarning},feed,standings,diagrams:archiveDiagrams(feed),archivedAt};
  await atomic(pathFor(record.id),payload);index.records[record.id]={...index.records[record.id],...payload.record,lastAttemptAt:archivedAt,error:null};await persist();return payload;
 }
 async function readEvent(id,{refresh=false}={}){await init();const record=index.records[id];if(!record)throw new Error('官方历史目录中未找到该赛事');if(record.archivedAt&&!refresh){try{const payload=JSON.parse(await readFile(pathFor(id),'utf8'));if(!validPayload(payload,id))throw new Error('已保存的赛事存档格式无效');if(payload.diagrams?.version!==3){payload.diagrams=archiveDiagrams(payload.feed);await atomic(pathFor(id),payload);}return payload;}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(pending.has(id))return pending.get(id);
 const previousStatus=record.archiveStatus;const work=(async()=>{record.archiveStatus='loading';try{await persist();return await saveEvent(record,await fetchEvent(record));}catch(error){const current=index.records[id];current.lastAttemptAt=new Date(now()).toISOString();current.error=error.message;if(current.archiveStatus==='loading')current.archiveStatus=current.archivedAt?previousStatus:'unavailable';await persist();throw error;}finally{pending.delete(id);}})();pending.set(id,work);return work;
 }
 function drain(){if(closing)return;while(active<concurrency&&queue.length){const id=queue.shift();if(pending.has(id))continue;active++;const refresh=refreshQueued.delete(id);readEvent(id,{refresh}).catch(e=>console.warn('[Archive]',id,e.message)).finally(()=>{active--;drain();});}}
 async function synchronize({retry=false}={}){await init();if(syncWork)return syncWork;const work=(async()=>{await Promise.allSettled(GAMES.map(async game=>{try{const catalog=await discover(game);index.sources[game]={...catalog.source,status:catalog.source.partial?'partial':'ready'};for(const incoming of catalog.records){const old=index.records[incoming.id];index.records[incoming.id]={...old,...incoming,archiveStatus:old?.archiveStatus||'queued'};}}catch(e){index.sources[game]={...index.sources[game],status:'error',error:e.message};}}));await persist();const waiting=Object.values(index.records).filter(r=>{if(r.provider==='observed')return false;const age=r.lastAttemptAt?now()-Date.parse(r.lastAttemptAt):Infinity;if(!r.archivedAt)return retry||age>6*3600000;const recent=r.endsAt&&now()-Date.parse(r.endsAt)<30*DAY,ttl=r.archiveStatus==='partial'?6*3600000:recent?DAY:7*DAY;if(age>=ttl){refreshQueued.add(r.id);return true;}return false;}).sort((a,b)=>(b.endsAt||b.startsAt||'').localeCompare(a.endsAt||a.startsAt||''));queue=[...new Set([...queue,...waiting.map(r=>r.id)])];drain();return list();})();syncWork=work;try{return await work;}finally{syncWork=null;}}
 // Retain real recent-source observations, so a finished event does not vanish when its feed rotates.
 let observationWork=Promise.resolve();
 function remember(feed){observationWork=observationWork.catch(()=>{}).then(async()=>{await init();const previous=observations[feed.game]||{events:{},teams:{}};Object.assign(previous.teams,feed.teams);const present=new Set(feed.events.map(e=>e.id));for(const event of feed.events){const old=previous.events[event.id]||{event,matches:{},source:feed.source};old.event={...old.event,...event};old.source=feed.source;for(const m of feed.matches.filter(m=>m.eventId===event.id))old.matches[m.id]=m;old.brackets=(feed.brackets||[]).filter(b=>b.eventId===event.id);previous.events[event.id]=old;}
 for(const [id,old]of Object.entries(previous.events)){
  const all=Object.values(old.matches),finished=all.filter(m=>['finished','cancelled'].includes(m.status));
  if(present.has(id)||!finished.length)continue;
  const existing=index.records[id];if(existing&&existing.provider!=='observed')continue;
  const matches=finished.sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  if(existing?.archivedAt)try{
   const saved=JSON.parse(await readFile(pathFor(id),'utf8')),teamIds=[...new Set(matches.flatMap(m=>m.teams).filter(Boolean))];
   if(validPayload(saved,id)&&JSON.stringify(saved.feed.matches)===JSON.stringify(matches)&&JSON.stringify(saved.feed.events[0])===JSON.stringify(old.event)&&JSON.stringify(saved.feed.brackets||[])===JSON.stringify(old.brackets||[])&&teamIds.every(id=>JSON.stringify(saved.feed.teams[id])===JSON.stringify(previous.teams[id])))continue;
  }catch{}
  const record={...existing,...old.event,id,game:feed.game,provider:'observed',nativeId:id,name:old.event.name,year:matches[0].date.slice(0,4),startsAt:matches[0].startsAt,endsAt:matches.at(-1).startsAt,scope:'observed',coverage:'保存了实时官方来源曾公布的已结束场次，可能不是赛事全部比赛'};
  const snapshot={game:feed.game,events:[old.event],teams:previous.teams,matches,source:{...old.source,coverage:record.coverage},brackets:old.brackets};
  index.records[id]=record;await saveEvent(record,{feed:snapshot});
 }
 observations[feed.game]=previous;await atomic(resolve(dir,'observed.json'),observations);});return observationWork;}
 async function close(){closing=true;queue=[];await Promise.allSettled([syncWork,observationWork].filter(Boolean));queue=[];refreshQueued.clear();while(active||pending.size){await Promise.allSettled([...pending.values()]);if(active)await new Promise(r=>setTimeout(r,10));}await writeQueue;}
 return {init,readEvent,synchronize,remember,close,list:async(game='all')=>{await init();return list(game);},directory:dir,idle:async()=>{while(syncWork||active||queue.length||pending.size){await new Promise(r=>setTimeout(r,25));}await writeQueue;}};
}
export const archive=createArchiveStore();
let timer=null;
export function startArchiveSync(){if(timer)return;archive.synchronize().catch(e=>console.warn('[Archive] sync:',e.message));timer=setInterval(()=>archive.synchronize().catch(e=>console.warn('[Archive] sync:',e.message)),6*3600000);timer.unref();}

export function stopArchiveSync(){if(timer){clearInterval(timer);timer=null;}}
