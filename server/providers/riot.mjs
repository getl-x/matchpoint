import {chineseCatalog,applyChineseNames} from './chinese-names.mjs';
import {publicFetch,phaseStatus,clock,team,finish} from './common.mjs';
// Riot's public query manifest: the homeEvents operation used by the official website.
const HOME_EVENTS_QUERY_ID='7246add6f577cf30b304e651bf9e25fc6a41fe49aeafb0754c16b5778060fc0a';
async function riotLiveEvents(game,url){
 const api=new URL('/api/gql',url);
 api.searchParams.set('operationName','homeEvents');
 api.searchParams.set('variables',JSON.stringify({hl:'en-US',sport:game==='lol'?'lol':'val',eventState:['inProgress'],eventType:'match',pageSize:40}));
 api.searchParams.set('extensions',JSON.stringify({persistedQuery:{version:1,sha256Hash:HOME_EVENTS_QUERY_ID}}));
 const payload=await publicFetch(api,true,{'Content-Type':'application/json','apollographql-client-name':'Matchpoint','apollographql-client-version':'1'});
 if(payload.errors?.length||!Array.isArray(payload.data?.esports?.events))throw new Error('Riot 官方进行中赛程暂时无法读取');
 return payload.data.esports.events.filter(e=>e.__typename==='EventMatch'&&e.id);
}
export function extractRiotEvents(html){
 const roots=[...html.matchAll(/ApolloSSRDataTransport"\)\] \?\?= \[\]\)\.push\((.*?)\)<\/script>/gs)].map(m=>JSON.parse(m[1].replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g,t=>t==='undefined'?'null':t)));
 const found=new Map();const visit=o=>{if(!o||typeof o!=='object')return;if(o.__typename==='EventMatch'&&o.id)found.set(o.id,o);else for(const v of Object.values(o))visit(v);};roots.forEach(visit);
 if(!roots.length)throw new Error('官网赛程结构已变更');return [...found.values()];
}
export function normalizeRiot(events,game){
 const teams={},tournaments=new Map();const url=game==='lol'?'https://lolesports.com/en-US':'https://valorantesports.com/en-US';
 const matches=events.map(e=>{
  const eventId=game+':'+(e.tournament?.id||e.league?.id);const eventName=[e.league?.name,e.tournament?.name].filter(Boolean).join(' · ');
  tournaments.set(eventId,{id:eventId,name:eventName,game,sourceUrl:url,topologyPublished:false});
  const ids=(e.matchTeams||[]).map(t=>team(t.id?.split(':').pop(),{...t,id:t.id?.split(':').pop()},game,teams));const status=phaseStatus(e.state);const scored=['live','finished'].includes(status)&&e.matchTeams?.length===2&&e.matchTeams.every(t=>Number.isFinite(t.result?.gameWins));
  return {id:game+':'+e.id,game,eventId,event:eventName,stage:e.blockName||'阶段待公布',format:e.match?.strategy?.count?'BO'+e.match.strategy.count:'赛制待公布',...clock(e.startTime),status,teams:ids,score:scored?e.matchTeams.map(t=>t.result.gameWins):null,winner:status==='finished'?ids[e.matchTeams.findIndex(t=>t.result?.outcome==='win')]||null:null,streams:e.streams||[],sourceUrl:url};
 });return finish(game,game==='lol'?'Riot · LoL Esports':'Riot · VALORANT Esports',url,matches,teams,[...tournaments.values()],{coverage:'Riot 官网近期公开赛事；下一轮对阵以官网公布为准'});
}
export async function riotFeed(game){
 const url=game==='lol'?'https://lolesports.com/en-US':'https://valorantesports.com/en-US';
 // Homepage SSR queries only completed and unstarted events; live matches need a separate read.
 const [html,catalog,live]=await Promise.all([publicFetch(url),chineseCatalog(game),riotLiveEvents(game,url)]);
 const events=[...new Map([...extractRiotEvents(html),...live].map(e=>[e.id,e])).values()];
 return applyChineseNames(normalizeRiot(events,game),catalog);
}
