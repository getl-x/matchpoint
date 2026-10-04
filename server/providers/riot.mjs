import {chineseCatalog,applyChineseNames} from './chinese-names.mjs';
import {publicFetch,phaseStatus,clock,team,finish} from './common.mjs';
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
export async function riotFeed(game){const url=game==='lol'?'https://lolesports.com/en-US':'https://valorantesports.com/en-US';const [html,catalog]=await Promise.all([publicFetch(url),chineseCatalog(game)]);return applyChineseNames(normalizeRiot(extractRiotEvents(html),game),catalog);}
