// Read-only routes: an official completed result must be followed by an
// officially published participant in a later round. Missing slots stay missing.
const WIDTH=290,HEIGHT=154,STEP=350,ROW=188,TOP=110;
const time=m=>Number.isFinite(Date.parse(m.startsAt))?Date.parse(m.startsAt):null;
const ordered=(a,b)=>(time(a)??Infinity)-(time(b)??Infinity)||(a.index??0)-(b.index??0)||a.id.localeCompare(b.id);
const lower=name=>/败者|loser|lower\s*bracket/i.test(name);
const final=name=>/^(?:(?:总|大)?决赛|(?:grand\s*)?finals?)(?:\s*\d+)?$/i.test(name.trim());
const knockout=text=>/淘汰|季后|单败|双败|playoffs?|knockout|elimination|upper\s*bracket|lower\s*bracket/i.test(text);
const nonKnockout=text=>/瑞士|小组|常规|循环|swiss|group\s*stage|round\s*robin|regular\s*season/i.test(text);
function roundList(name,matches,promotion){
 const ids=new Map(matches.map(m=>[m.id.split(':').at(-1),m]));
 const groups=[];
 if(promotion?.promotionData?.length){
  const covered=new Set();
  for(const [rank,raw]of promotion.promotionData.entries()){
   const list=(raw.sessions||[]).map(s=>ids.get(String(s.bMatchId))).filter(Boolean).sort(ordered);
   for(const match of list){if(covered.has(match.id))return null;covered.add(match.id);}
   if(list.length)groups.push({name:raw.des||'官方轮次',rank,matches:list});
  }
  // Partial or changed promotion metadata must not silently discard a match.
  if(covered.size!==matches.length)return null;
 }else{
  const byName=new Map();
  for(const match of [...matches].sort(ordered)){
   const label=match.roundName||match.matchName?.replace(/\s*(?:#?\d+|第\d+场)$/,'')||name;
   if(!byName.has(label))byName.set(label,{name:label,rank:byName.size,matches:[]});
   byName.get(label).matches.push(match);
  }
  groups.push(...byName.values());
 }
 groups.sort((a,b)=>Number(final(a.name))-Number(final(b.name))||a.rank-b.rank);
 groups.forEach((round,rank)=>round.rank=rank);
 return groups.length>=2?groups:null;
}
export function layoutElimination(name,matches,promotion){
 const description=[name,promotion?.templateName].filter(Boolean).join(' ');
 if(!matches.length||nonKnockout(description)||!knockout(description))return null;
 const rounds=roundList(name,matches,promotion);if(!rounds)return null;
 const byId=new Map(matches.map(m=>[m.id,m])),roundOf=new Map();
 for(const round of rounds)for(const m of round.matches)roundOf.set(m.id,round);
 const edges=[],keys=new Set();
 const push=edge=>{const key=edge.from+':'+edge.to+':'+edge.outcome;if(!keys.has(key)){keys.add(key);edges.push(edge);}};
 for(const match of [...matches].sort(ordered)){
  const source=roundOf.get(match.id),explicit=byId.get(match.nextMatch);
  if(explicit&&roundOf.get(explicit.id).rank>source.rank)push({from:match.id,to:explicit.id,kind:'official-advancement',outcome:'win',teamId:match.winner||null});
  if(match.status!=='finished'||!match.winner||!match.teams.includes(match.winner)||match.teams.filter(Boolean).length!==2||new Set(match.teams).size!==2)continue;
  if(match.score&&(match.score[0]===match.score[1]||match.teams[match.score[0]>match.score[1]?0:1]!==match.winner))continue;
  for(const outcome of ['win','loss']){
   const teamId=outcome==='win'?match.winner:match.teams.find(t=>t!==match.winner);
   const candidates=matches.filter(target=>target.id!==match.id&&roundOf.get(target.id).rank>source.rank&&target.teams.includes(teamId)&&!['cancelled','postponed'].includes(target.status)&&time(match)!==null&&time(target)!==null&&time(target)>time(match)).sort(ordered);
   if(!candidates.length)continue;
   const target=candidates[0];
   // Repeated or conflicting next opponents are not resolved by guessing.
   if(candidates.filter(t=>roundOf.get(t.id)===roundOf.get(target.id)).length!==1)continue;
   if(outcome==='loss'&&!/双败|double/i.test(description)&&!lower(roundOf.get(target.id).name)&&!/季军|third|3rd|bronze/i.test(roundOf.get(target.id).name))continue;
   if(outcome==='win'&&explicit)continue;
   push({from:match.id,to:target.id,kind:'confirmed-advancement',outcome,teamId,provenance:'official-result-and-participant'});
  }
 }
 const lastLaneColumn=new Map();
 for(const round of rounds){
  round.lane=final(round.name)?'final':lower(round.name)?'lower':'upper';
  const incoming=edges.filter(e=>roundOf.get(e.to)===round).map(e=>roundOf.get(e.from).column+1);
  const earliest=incoming.length?Math.max(...incoming):round===rounds[0]?0:rounds[rounds.indexOf(round)-1].column+1;
  round.column=Math.max(earliest,(lastLaneColumn.get(round.lane)??-1)+1);
  lastLaneColumn.set(round.lane,round.column);
 }
 let lastFinalColumn=Math.max(-1,...rounds.filter(r=>r.lane!=='final').map(r=>r.column));
 for(const round of rounds.filter(r=>r.lane==='final')){round.column=Math.max(round.column,lastFinalColumn+1);lastFinalColumn=round.column;}
 const span=lane=>Math.max(HEIGHT,...rounds.filter(r=>r.lane===lane).map(r=>r.matches.length*ROW-(ROW-HEIGHT)));
 const upperSpan=span('upper'),hasLower=rounds.some(r=>r.lane==='lower'),lowerSpan=hasLower?span('lower'):0,lowerTop=TOP+upperSpan+132;
 const positions=new Map(),nodes=[];
 for(const round of rounds){
  const parentY=match=>{const sources=edges.filter(e=>e.to===match.id).map(e=>positions.get(e.from)).filter(n=>n&&n.lane===round.lane);return sources.length?sources.reduce((sum,n)=>sum+n.y,0)/sources.length:Infinity;};
  const list=[...round.matches].sort((a,b)=>parentY(a)-parentY(b)||ordered(a,b));
  const ownSpan=list.length*ROW-(ROW-HEIGHT),base=round.lane==='lower'?lowerTop+(lowerSpan-ownSpan)/2:TOP+(upperSpan-ownSpan)/2;
  list.forEach((match,i)=>{
   let y=base+i*ROW;
   if(round.lane==='final'){
    y=TOP+(upperSpan+(hasLower?132+lowerSpan:0)-ownSpan)/2+i*ROW;
   }
   if(round.lane==='final'&&list.length===1){
    const incoming=edges.filter(e=>e.to===match.id).map(e=>positions.get(e.from)).filter(Boolean);
    y=incoming.length?incoming.reduce((sum,n)=>sum+n.y,0)/incoming.length:TOP+(upperSpan+(hasLower?132+lowerSpan:0)-ownSpan)/2+i*ROW;
   }
   const node={id:match.id,kind:'match',match,column:round.column+1,lane:round.lane,round:round.name,x:320+round.column*STEP,y,width:WIDTH,height:HEIGHT};
   nodes.push(node);positions.set(node.id,node);
  });
 }
 const first=rounds[0],rootHeight=Math.max(180,110+Math.ceil([...name].length/9)*27),root={id:'stage-root',kind:'root',name,column:0,x:24,y:Math.max(54,TOP+(upperSpan-rootHeight)/2),width:220,height:rootHeight};
 for(const match of first.matches)edges.unshift({from:root.id,to:match.id,kind:'stage-entry'});
 const labels=rounds.map(round=>({name:round.name,lane:round.lane,x:320+round.column*STEP,y:round.lane==='lower'?lowerTop-48:round.lane==='final'?nodes.find(n=>n.id===round.matches[0].id).y-48:54}));
 return {type:'elimination',lowerTop,nodes:[root,...nodes],edges,rounds:labels,width:Math.max(...nodes.map(n=>n.x+n.width))+30,height:Math.max(TOP+upperSpan+(hasLower?132+lowerSpan:0),root.y+root.height,...nodes.map(n=>n.y+n.height))+80};
}
