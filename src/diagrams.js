import {layoutBracket} from './bracket.js';
import {layoutElimination} from './elimination.js';
import {layoutSwiss,layoutStageCards} from './mindmap.js';

export function archiveDiagrams(feed){
 if(feed.game==='apex')return {version:3,type:'official-standings',events:feed.events.map(e=>e.id)};
 return {version:3,events:feed.events.map(event=>{const matches=feed.matches.filter(m=>m.eventId===event.id),stages=(feed.brackets||[]).filter(s=>s.eventId===event.id);if(stages.length)return {eventId:event.id,stages:stages.map(s=>{const ids=new Set(s.groups.flatMap(g=>g.matchIds)),list=matches.filter(m=>ids.has(m.id));return {name:s.name,layout:layoutSwiss(s,list)||(list.some(m=>ids.has(m.nextMatch))?{type:'official-advancement',...layoutBracket(list)}:layoutStageCards(s.name,list))};})};const grouped=new Map();for(const m of matches)(grouped.get(m.stage)||grouped.set(m.stage,[]).get(m.stage)).push(m);return {eventId:event.id,stages:[...grouped].map(([name,list])=>({name,layout:layoutElimination(name,list,(feed.promotions||[]).find(p=>p.promotionName===name))||layoutStageCards(name,list)}))};})};
}
