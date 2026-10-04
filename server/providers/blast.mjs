import {publicFetch,clock,team,finish,safeLink} from './common.mjs';
export function decodeBlast(html){
 const messages=[...html.matchAll(/streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g)].map(m=>JSON.parse(m[1]));
 if(!messages.length)throw new Error('BLAST 官网数据结构已变更');
 const values=JSON.parse(messages[0].trim()),promises=new Map(),memo=new Map();
 for(const message of messages.slice(1)){for(const line of message.trim().split('\n')){const m=line.match(/^P(\d+):(.*)$/);if(m){promises.set(+m[1],values.length);values.push(...JSON.parse(m[2]));}}}
 function read(i){if(i<0)return null;if(memo.has(i))return memo.get(i);const v=values[i];if(v===null||typeof v!=='object')return v;
  if(Array.isArray(v)&&v[0]==='P')return promises.has(v[1])?read(promises.get(v[1])):null;
  if(Array.isArray(v)&&v[0]==='D')return new Date(v[1]).toISOString();
  const out=Array.isArray(v)?[]:{};memo.set(i,out);
  if(Array.isArray(v)){for(const x of v)out.push(typeof x==='number'?read(x):x);}else{for(const [k,x]of Object.entries(v))out[k.startsWith('_')?read(+k.slice(1)):k]=typeof x==='number'?read(x):x;}
  return out;
 }return read(0);
}
export function normalizeBlast(details){
 const teams={},matches=new Map(),events=[],brackets=[];
 for(const detail of details){const t=detail.tournament;if(!t?.id)continue;const url='https://blast.tv/cs/tournaments/'+encodeURIComponent(t.id),eventId='cs2:'+t.id;
  events.push({id:eventId,name:t.name,game:'cs2',sourceUrl:url,topologyPublished:true});
  for(const b of detail.tournamentBracketsPromise||[]){const groups=b.groups?.length?b.groups:[{id:b.label,matches:b.matches||[]}];const stage={id:b.tournamentUuid,eventId,name:b.label||b.tournamentName,format:b.format,groups:[]};
   for(const group of groups){const ids=[];for(const m of group.matches||[]){const id='cs2:'+m.uuid;ids.push(id);const status=m.isCompleted?'finished':m.isLive?'live':'upcoming';const ts=[team(null,m.teamA,'cs2',teams),team(null,m.teamB,'cs2',teams)];const score=['live','finished'].includes(status)&&Number.isFinite(m.teamAScore)&&Number.isFinite(m.teamBScore)?[m.teamAScore,m.teamBScore]:null;
    matches.set(id,{id,game:'cs2',eventId,event:t.name,stage:stage.name+(b.groups?.length?' · '+group.id:''),matchName:m.name,index:m.index,format:m.type||group.format||'赛制待公布',...clock(m.timeOfSeries),status,teams:ts,score,winner:status==='finished'&&score&&score[0]!==score[1]?ts[score[0]>score[1]?0:1]:null,sourceUrl:url,externalStreamUrl:safeLink(m.metadata?.externalStreamUrl),nextMatch:m.winnerGoesTo?.seriesUUID?'cs2:'+m.winnerGoesTo.seriesUUID:null,nextSlot:m.winnerGoesTo?.bracketPosition==='POSITION_B'?1:0});
   }stage.groups.push({name:group.id,matchIds:ids,qualifiedCount:group.numberQualifiedTeams??null,eliminatedCount:group.numberEliminatedTeams??null});}
   brackets.push(stage);
  }
  for(const m of detail.tournamentMatchesPromise||[]){const id='cs2:'+m.id;if(matches.has(id))continue;matches.set(id,{id,game:'cs2',eventId,event:t.name,stage:m.stage?.name||m.name,format:m.type,...clock(m.scheduledAt),status:'unknown',teams:[team(null,m.teamA,'cs2',teams),team(null,m.teamB,'cs2',teams)],score:null,sourceUrl:url,externalStreamUrl:safeLink(m.metadata?.externalStreamUrl)});}
 }return finish('cs2','BLAST 官网','https://blast.tv/cs/tournaments',[...matches.values()],teams,events,{brackets,coverage:'BLAST 官网收录的当前、相邻赛事；不代表全部 CS2 比赛'});
}
export async function blastFeed(){
 const data=decodeBlast(await publicFetch('https://blast.tv/cs/tournaments'));const list=data.loaderData?.['routes/$gameId.tournaments._index'];if(!list)throw new Error('BLAST 赛事列表未公布');
 const all=[...Object.values(list.groupedFinishedTournaments||{}),...Object.values(list.groupedUpcomingTournaments||{})].flat().filter(t=>/^[a-z0-9-]+$/.test(t.id)),now=Date.now();
 const selected=selectBlastTournaments(all,now);
 const responses=await Promise.allSettled(selected.map(async t=>{const d=decodeBlast(await publicFetch('https://blast.tv/cs/tournaments/'+t.id));const detail=d.loaderData?.['routes/$gameId.tournaments.$tournamentId'];if(!detail?.tournamentBracketsPromise)throw new Error('赛事对阵尚未公布');return detail;}));
 const details=responses.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!details.length)throw new Error('BLAST 赛事详情暂时无法读取');const feed=normalizeBlast(details);if(details.length<selected.length)feed.warning='部分相邻赛事暂未读取到；已展示可读取的官方赛事';return feed;
}

export function selectBlastTournaments(all,now=Date.now()){const active=all.filter(t=>Date.parse(t.startDate)<=now&&Date.parse(t.endDate)>=now),upcoming=all.filter(t=>Date.parse(t.startDate)>now).sort((a,b)=>Date.parse(a.startDate)-Date.parse(b.startDate)),recent=all.filter(t=>Date.parse(t.endDate)<now).sort((a,b)=>Date.parse(b.endDate)-Date.parse(a.endDate));return [...new Map([...active,...upcoming.slice(0,1),...recent.slice(0,1)].map(t=>[t.id,t])).values()].slice(0,3);}
