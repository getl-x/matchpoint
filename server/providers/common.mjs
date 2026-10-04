import {teamLogoSources} from '../../src/logo-sources.js';
export async function publicFetch(url, json=false) {
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
 try {
  const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'Matchpoint/0.2 (public esports schedule reader)','Accept':json?'application/json':'text/html'}});
  if(!response.ok)throw new Error('官方来源返回 '+response.status);
  const reader=response.body.getReader();const parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>14*1024*1024){await reader.cancel();throw new Error('官方响应超出读取限制');}parts.push(Buffer.from(value));}
  const text=Buffer.concat(parts).toString('utf8');return json?JSON.parse(text):text;
 } finally {clearTimeout(timer);}
}
export const phaseStatus=s=>({completed:'finished',finished:'finished',inProgress:'live',in_progress:'live',ongoing:'live',live:'live',pending:'upcoming',unstarted:'upcoming',scheduled:'upcoming',cancelled:'cancelled',canceled:'cancelled',postponed:'postponed'}[s]||'unknown');
export function clock(iso){const d=iso?new Date(iso):new Date(NaN);if(!Number.isFinite(+d))return {date:null,time:'待公布',startsAt:null};const x=new Date(+d+8*3600000).toISOString();return {date:x.slice(0,10),time:x.slice(11,16),startsAt:d.toISOString()};}
export function team(id,t,game,teams){if(!t||!(t.id||t.uuid||id)||!t.name)return null;const key=game+':'+(t.id||t.uuid||id);teams[key]={id:key,name:t.name,short:t.code||t.shortName||t.shorthand||t.name,mark:(t.code||t.shortName||t.shorthand||t.name).slice(0,3).toUpperCase(),color:game==='cs2'?'#c99b54':game==='apex'?'#d96c69':game==='lol'?'#59a9aa':'#e56e87',logos:teamLogoSources(t,game)};return key;}
export function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function finish(game,name,url,matches,teams,events,extra={}){return {game,source:{name,url,coverage:extra.coverage||'官网公开的近期赛程',retrievedAt:new Date().toISOString()},matches:matches.filter(m=>m.date).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)),teams,events,...extra};}
