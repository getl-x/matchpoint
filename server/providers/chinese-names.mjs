import {publicFetch} from './common.mjs';
const VAL_URL='https://val.native.game.qq.com/esports/v1/data/VAL_SGameList_display.json';
const LOL_URL='https://lpl.qq.com/web201612/data/LOL_MATCH2_GAME_LIST_BRIEF.js';
const snapshots=new Map(),inflight=new Map();
export function parseLolCatalog(script){const match=String(script).match(/^\s*(?:var\s+)?GameList\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);if(!match)throw new Error('英雄联盟中文目录格式已变更');const data=JSON.parse(match[1]);if(!data.msg?.sGameList||typeof data.msg.sGameList!=='object')throw new Error('英雄联盟中文目录尚未公布');return Object.values(data.msg.sGameList).flat().filter(e=>e.GameId&&e.GameName).map(e=>({id:String(e.GameId),parentId:String(e.bGameId),name:e.GameName,year:String(e.GameYear||''),startsAt:e.sDate,endsAt:e.eDate}));}
export function parseValorantCatalog(data){if(!Array.isArray(data.msg))throw new Error('无畏契约中文目录格式已变更');return data.msg.filter(e=>e.secondLevelGameId&&e.secondLevelGameName&&e.display?.officialSite!==false).map(e=>({id:String(e.secondLevelGameId),parentId:String(e.firstLevelGameId),name:e.secondLevelGameName,englishName:e.secondLevelGameEnName||'',year:String(e.gameYear||''),startsAt:e.sDate,endsAt:e.eDate}));}
export async function chineseCatalog(game){const old=snapshots.get(game);if(old&&Date.now()-old.checkedAt<3600000)return old.value;if(inflight.has(game))return inflight.get(game);const work=(async()=>{try{const url=game==='valorant'?VAL_URL:LOL_URL;const raw=await publicFetch(url,game==='valorant');const value={game,url,name:game==='valorant'?'无畏契约中国赛事官网':'英雄联盟中国赛事官网',retrievedAt:new Date().toISOString(),entries:game==='valorant'?parseValorantCatalog(raw):parseLolCatalog(raw),status:'ready'};snapshots.set(game,{value,checkedAt:Date.now()});return value;}catch{if(old)return {...old.value,status:'cached'};return {game,status:'unavailable',entries:[]};}finally{inflight.delete(game);}})();inflight.set(game,work);return work;}
export function applyChineseNames(feed,catalog){const events=feed.events.map(event=>{const originalName=event.originalName||event.name;const own=feed.matches.filter(m=>m.eventId===event.id);const years=[...new Set(own.map(m=>m.date?.slice(0,4)).filter(Boolean))];const year=originalName.match(/\b20\d{2}\b/)?.[0]||(years.length===1?years[0]:'');const candidates=(catalog.entries||[]).filter(e=>e.year===year);let matches=[];
 if(feed.game==='valorant'){
  const [league,tournament]=originalName.split(/\s*·\s*/);
  if(league==='Champions')matches=candidates.filter(e=>e.parentId==='10005'&&/CHAMPIONS/i.test(e.englishName));
  else if(league==='Masters')matches=candidates.filter(e=>e.englishName.toLowerCase()===String(tournament).toLowerCase());
  else matches=candidates.filter(e=>e.englishName.toLowerCase()===originalName.toLowerCase());
 }else if(feed.game==='lol'){
  const league=originalName.split(/\s*·\s*/)[0];const rule={DCGI:e=>e.parentId==='4',WSCI:e=>e.parentId==='178'&&/全球挑战者之星邀请赛/.test(e.name),Worlds:e=>e.parentId==='1',MSI:e=>e.parentId==='8','First Stand':e=>e.parentId==='220'}[league];if(rule)matches=candidates.filter(rule);
 }
 if(matches.length!==1)return {...event,originalName,year};const official=matches[0];return {...event,originalName,year,nameZh:official.name,nameSource:{name:catalog.name,url:catalog.url,recordId:official.id,retrievedAt:catalog.retrievedAt,status:catalog.status}};
 });return {...feed,events,namingCatalog:{name:catalog.name,url:catalog.url,retrievedAt:catalog.retrievedAt,status:catalog.status,matchedEvents:events.filter(e=>e.nameZh).length}};}
