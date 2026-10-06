import {publicFetch,clock,team,finish,safeLink,markStartOverdue} from './common.mjs';
export function decodeBlast(html){
 const messages=[...html.matchAll(/streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g)].map(m=>JSON.parse(m[1]));
 if(!messages.length)throw new Error('BLAST 官网数据结构已变更');
 const values=JSON.parse(messages[0].trim()),promises=new Map(),memo=new Map();
 for(const message of messages.slice(1)){for(const line of message.trim().split('\n')){const m=line.match(/^P(\d+):(.*)$/);if(m){const resolved=JSON.parse(m[2]);if(Array.isArray(resolved)){promises.set(+m[1],values.length);values.push(...resolved);}else if(Number.isInteger(resolved)){promises.set(+m[1],resolved);}else throw new Error('BLAST 延迟数据结构已变更');}}}
 function read(i){if(i<0)return null;if(memo.has(i))return memo.get(i);const v=values[i];if(v===null||typeof v!=='object')return v;
  if(Array.isArray(v)&&v[0]==='P')return promises.has(v[1])?read(promises.get(v[1])):null;
  if(Array.isArray(v)&&v[0]==='D')return new Date(v[1]).toISOString();
  const out=Array.isArray(v)?[]:{};memo.set(i,out);
  if(Array.isArray(v)){for(const x of v)out.push(typeof x==='number'?read(x):x);}else{for(const [k,x]of Object.entries(v))out[k.startsWith('_')?read(+k.slice(1)):k]=typeof x==='number'?read(x):x;}
  return out;
 }return read(0);
}
export function normalizeBlast(details,liveTournamentIds=new Set(),now=Date.now()){
 const teams={},matches=new Map(),events=[],brackets=[];
 for(const detail of details){const t=detail.tournament;if(!t?.id)continue;const url='https://blast.tv/cs/tournaments/'+encodeURIComponent(t.id),eventId='cs2:'+t.id;
  events.push({id:eventId,name:t.name,game:'cs2',sourceUrl:url,topologyPublished:true,live:liveTournamentIds.has(t.id)===true});
  for(const b of detail.tournamentBracketsPromise||[]){const groups=b.groups?.length?b.groups:[{id:b.label,matches:b.matches||[]}];const stage={id:b.tournamentUuid,eventId,name:b.label||b.tournamentName,format:b.format,groups:[]};
   for(const group of groups){const ids=[];for(const m of group.matches||[]){const id='cs2:'+m.uuid;ids.push(id);const status=m.isCompleted?'finished':m.isLive?'live':'upcoming';const ts=[team(null,m.teamA,'cs2',teams),team(null,m.teamB,'cs2',teams)];const score=['live','finished'].includes(status)&&Number.isFinite(m.teamAScore)&&Number.isFinite(m.teamBScore)?[m.teamAScore,m.teamBScore]:null;
    matches.set(id,{id,game:'cs2',eventId,event:t.name,stage:stage.name+(b.groups?.length?' · '+group.id:''),matchName:m.name,index:m.index,format:m.type||group.format||'赛制待公布',...clock(m.timeOfSeries),status,teams:ts,score,winner:status==='finished'&&score&&score[0]!==score[1]?ts[score[0]>score[1]?0:1]:null,sourceUrl:url,externalStreamUrl:safeLink(m.metadata?.externalStreamUrl),nextMatch:m.winnerGoesTo?.seriesUUID?'cs2:'+m.winnerGoesTo.seriesUUID:null,nextSlot:m.winnerGoesTo?.bracketPosition==='POSITION_B'?1:0});
   }stage.groups.push({name:group.id,matchIds:ids,qualifiedCount:group.numberQualifiedTeams??null,eliminatedCount:group.numberEliminatedTeams??null});}
   brackets.push(stage);
  }
  for(const m of detail.tournamentMatchesPromise||[]){const id='cs2:'+m.id;if(matches.has(id))continue;matches.set(id,{id,game:'cs2',eventId,event:t.name,stage:m.stage?.name||m.name,format:m.type,...clock(m.scheduledAt),status:Date.parse(m.scheduledAt)>now?'upcoming':'unknown',teams:[team(null,m.teamA,'cs2',teams),team(null,m.teamB,'cs2',teams)],score:null,sourceUrl:url,externalStreamUrl:safeLink(m.metadata?.externalStreamUrl)});}
 }return finish('cs2','BLAST 官网','https://blast.tv/cs/tournaments',[...matches.values()],teams,events,{brackets,coverage:'BLAST 官网收录的当前、相邻赛事；不代表全部 CS2 比赛',now});
}
export async function blastFeed(){
 const data=decodeBlast(await publicFetch('https://blast.tv/cs/tournaments'));const list=data.loaderData?.['routes/$gameId.tournaments._index'];if(!list)throw new Error('BLAST 赛事列表未公布');
 const all=[...Object.values(list.groupedFinishedTournaments||{}),...Object.values(list.groupedUpcomingTournaments||{})].flat().filter(t=>/^[a-z0-9-]+$/.test(t.id)),now=Date.now();
 const selected=selectBlastTournaments(all,now);
 const responses=await Promise.allSettled(selected.map(async t=>{const d=decodeBlast(await publicFetch('https://blast.tv/cs/tournaments/'+t.id));const detail=d.loaderData?.['routes/$gameId.tournaments.$tournamentId'];if(!detail?.tournamentBracketsPromise)throw new Error('赛事对阵尚未公布');return detail;}));
 const details=responses.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!details.length)throw new Error('BLAST 赛事详情暂时无法读取');const feed=normalizeBlast(details,new Set(selected.filter(t=>t.isTournamentLive===true).map(t=>t.id)),now);feed.partial=details.length<selected.length;if(feed.partial)feed.warning='部分相邻赛事暂未读取到；已展示可读取的官方赛事';
 const activeIds=new Set(selected.filter(t=>t.isTournamentLive===true||(Date.parse(t.startDate)<=now&&Date.parse(t.endDate)>=now)).map(t=>'cs2:'+t.id));
 await refreshBlastMatchStates(feed,activeIds,now);return feed;
}

// BLAST's tournament bracket can keep isLive=false while its official match page says live.
// The clock only selects pages to check; only the published matchState changes a match's status.
export async function refreshBlastMatchStates(feed,activeIds,now=Date.now()){
 const candidates=feed.matches.filter(m=>activeIds.has(m.eventId)&&['upcoming','unknown'].includes(m.status)&&m.teams.length===2&&m.teams.every(Boolean)&&Date.parse(m.startsAt)<=now+5*60000);
 let cursor=0,failed=false;
 async function worker(){while(cursor<candidates.length){const match=candidates[cursor++];
  try{
   const uuid=match.id.slice(4),tournamentId=match.eventId.slice(4),url='https://blast.tv/cs/tournaments/'+encodeURIComponent(tournamentId)+'/match/'+encodeURIComponent(uuid.split('-')[0]);
   const page=decodeBlast(await publicFetch(url)).loaderData?.['routes/cs.tournaments.$tournamentId.match.$seriesId.($teams)'];
   if(page?.tournamentMatch?.id!==uuid||page.tournamentMatch.tournament?.id!==tournamentId)throw new Error('BLAST 单场比赛身份不匹配');
   const status={pre:'upcoming',live:'live',post:'finished'}[page.matchState];if(!status)throw new Error('BLAST 单场比赛状态未公布');
   const raw=page.tournamentMatch,publishedClock=clock(raw.scheduledAt),score=[raw.teamAScore,raw.teamBScore];
   if(!publishedClock.startsAt||![raw.teamA,raw.teamB].every(t=>t?.id&&t.name))throw new Error('BLAST 单场赛程数据不完整');
   // External matches may expose default 0:0 with no maps or live scores at all.
   const scored=score.every(s=>Number.isFinite(s)&&s>=0)&&(status==='finished'||status==='live'&&(score.some(s=>s>0)||raw.maps?.length>0||page.matchScores?.length>0));
   const teams=[team(null,raw.teamA,'cs2',feed.teams),team(null,raw.teamB,'cs2',feed.teams)];
   Object.assign(match,{...publishedClock,status,teams,score:scored?score:null,winner:status==='finished'&&scored&&score[0]!==score[1]?teams[score[0]>score[1]?0:1]:null,externalStreamUrl:safeLink(raw.metadata?.externalStreamUrl)||match.externalStreamUrl,sourceUrl:url,statusSource:{name:'BLAST 官方单场比赛页',url,retrievedAt:new Date().toISOString()}});
  }catch{failed=true;}
 }}
 await Promise.all(Array.from({length:Math.min(4,candidates.length)},worker));
 feed.matches=markStartOverdue(feed.matches,now).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 if(failed){feed.partial=true;feed.warning=[feed.warning,'部分官方单场状态暂未读取到，比赛状态可能延迟'].filter(Boolean).join('；');}
 return feed;
}

export function selectBlastTournaments(all,now=Date.now()){const active=all.filter(t=>Date.parse(t.startDate)<=now&&Date.parse(t.endDate)>=now),upcoming=all.filter(t=>Date.parse(t.startDate)>now).sort((a,b)=>Date.parse(a.startDate)-Date.parse(b.startDate)),recent=all.filter(t=>Date.parse(t.endDate)<now).sort((a,b)=>Date.parse(b.endDate)-Date.parse(a.endDate));return [...new Map([...active,...upcoming.slice(0,1),...recent.slice(0,1)].map(t=>[t.id,t])).values()].slice(0,3);}
