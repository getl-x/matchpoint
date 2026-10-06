// Diagram structure is separate from official match-to-match advancement.
// Swiss edges describe record-group flow; they never assign a future opponent.
const ROW=56, HEADER=112, WIDTH=320, GAP=76, TOP=120;
const record=name=>{const m=/^(\d+)\s*[:-]\s*(\d+)$/.exec(name);return m?{wins:Number(m[1]),losses:Number(m[2])}:null;};
const ordered=matches=>[...matches].sort((a,b)=>(a.index??0)-(b.index??0)||String(a.startsAt||'').localeCompare(String(b.startsAt||'')));
function outcomeTeams(groups,key){const ids=new Set();for(const group of groups){if(!(group[key]>0)||group[key]!==group.matchIds.length)continue;for(const match of group.matches){if(match.status!=='finished'||!match.winner||!match.teams.includes(match.winner))continue;const id=key==='qualifiedCount'?match.winner:match.teams.find(t=>t&&t!==match.winner);if(id)ids.add(id);}}return [...ids];}
export function layoutSwiss(stage,matches){
 if(!/^swiss-\d+$/.test(stage.format||'')||!stage.groups?.length)return null;
 const byId=new Map(matches.map(m=>[m.id,m]));
 const nodes=stage.groups.map((group,i)=>{const r=record(group.name);if(!r)return null;const list=ordered(group.matchIds.map(id=>byId.get(id)).filter(Boolean));return {...group,...r,id:'group:'+i,kind:'group',matches:list,column:r.wins+r.losses,width:WIDTH,height:HEADER+list.length*ROW};});
 if(nodes.some(n=>!n)||new Set(nodes.map(n=>n.wins+':'+n.losses)).size!==nodes.length)return null;
 const maxRound=Math.max(...nodes.map(n=>n.column));if(maxRound>12)return null;
 const columns=Array.from({length:maxRound+1},(_,i)=>nodes.filter(n=>n.column===i).sort((a,b)=>a.losses-b.losses));
 const span=Math.max(480,...columns.map(c=>c.reduce((s,n)=>s+n.height,0)+Math.max(0,c.length-1)*36));
 for(const column of columns){const size=column.reduce((s,n)=>s+n.height,0)+Math.max(0,column.length-1)*36;let y=TOP+(span-size)/2;for(const node of column){node.x=28+node.column*(WIDTH+GAP);node.y=y;y+=node.height+36;}}
 const edges=[];const byRecord=new Map(nodes.map(n=>[n.wins+':'+n.losses,n]));
 const outcomes=[];for(const [key,kind] of [['qualifiedCount','qualified'],['eliminatedCount','eliminated']]){const count=nodes.reduce((s,n)=>s+(n[key]||0),0);if(!count)continue;const teams=outcomeTeams(nodes,key),height=Math.max(184,116+Math.ceil(teams.length/2)*40);outcomes.push({id:kind,kind,count,teams,column:maxRound+1,x:28+(maxRound+1)*(WIDTH+GAP),y:kind==='qualified'?TOP+30:TOP+span-height-30,width:WIDTH,height});}
 for(const node of nodes){for(const [outcome,wins,losses,key] of [['win',node.wins+1,node.losses,'qualifiedCount'],['loss',node.wins,node.losses+1,'eliminatedCount']]){const target=node[key]>0?outcomes.find(n=>n.kind===(outcome==='win'?'qualified':'eliminated')):byRecord.get(wins+':'+losses);if(target)edges.push({from:node.id,to:target.id,kind:'group-flow',outcome,terminal:target.kind!=='group'});}}
 const all=[...nodes,...outcomes];return {type:'swiss',nodes:all,edges,columns,columnWidth:WIDTH+GAP,width:28+(maxRound+1+(outcomes.length?1:0))*(WIDTH+GAP)-GAP+28,height:TOP+span+76,top:TOP,bottom:TOP+span};
}
// When a source has no next-match links, show official stage membership only.
export function layoutStageMap(event,groups,matches){
 const byId=new Map(matches.map(m=>[m.id,m]));const nodes=groups.map((group,i)=>{const list=ordered(group.matchIds.map(id=>byId.get(id)).filter(Boolean));return {...group,id:'stage:'+i,kind:'group',matches:list,column:1,width:WIDTH,height:HEADER+list.length*ROW};});
 let y=90;for(const node of nodes){node.x=380;node.y=y;y+=node.height+36;}
 const height=Math.max(360,y+20),root={id:'event',kind:'root',name:event.name,column:0,x:28,y:Math.max(90,Math.min(260,height/2-82)),width:260,height:164};
 return {type:'membership',nodes:[root,...nodes],edges:nodes.map(n=>({from:'event',to:n.id,kind:'membership'})),width:740,height};
}

// Riot stages publish no group or round metadata, so the only honest sub-structure is the real
// match day. Each day becomes one compact panel built from the same node kinds the Swiss view
// uses, which keeps membership meaning membership and never asserts advancement.
const PER_COLUMN=10,DAY_STEP=WIDTH+60;
const weekday=date=>{const t=Date.parse(date+'T12:00:00');return Number.isFinite(t)?'周'+'日一二三四五六'[new Date(t).getDay()]:'';};
const dayHeading=key=>key.length>=10?key.slice(5).replace('-','月')+'日':key;
export function layoutStagePanels(name,matches){
 const list=ordered(matches);
 const days=new Map();
 for(const m of list){const key=m.date||'日期待公布';if(!days.has(key))days.set(key,[]);days.get(key).push(m);}
 const order=[...days.keys()],rank=new Map(order.map((key,i)=>[key,i]));
 const columns=[];
 for(const key of order){const day=days.get(key);for(let i=0;i<day.length;i+=PER_COLUMN)columns.push({key,part:i/PER_COLUMN,matches:day.slice(i,i+PER_COLUMN)});}
 const nodes=columns.map((c,i)=>({id:'day:'+i,kind:'group',name:c.key,column:i,
  heading:dayHeading(c.key),sublabel:'第 '+(rank.get(c.key)+1)+' 比赛日'+(c.part?' · 续':''),footerLabel:weekday(c.key),
  matches:c.matches,width:WIDTH,height:HEADER+c.matches.length*ROW}));
 const rootHeight=Math.max(160,110+Math.ceil([...String(name)].length/9)*27);
 const span=Math.max(rootHeight,...nodes.map(n=>n.height));
 for(const node of nodes){node.x=320+node.column*DAY_STEP;node.y=TOP+(span-node.height)/2;}
 const root={id:'stage-root',kind:'root',name,column:-1,x:24,y:TOP+(span-rootHeight)/2,width:220,height:rootHeight};
 return {type:'stage-panels',nodes:[root,...nodes],edges:nodes.map(n=>({from:root.id,to:n.id,kind:'membership'})),columnWidth:DAY_STEP,width:320+columns.length*DAY_STEP-60+30,height:TOP+span+76};
}
