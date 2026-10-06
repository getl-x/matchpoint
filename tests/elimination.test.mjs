import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {layoutElimination} from '../src/elimination.js';
import {archiveDiagrams,DIAGRAM_VERSION} from '../server/archive.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/london-official-bracket.json',import.meta.url)));
const promotion=raw.feed.promotions.find(p=>p.templateName==='八支队伍双败淘汰赛');
const matches=raw.feed.matches.filter(m=>m.stage===promotion.promotionName);
const model=()=>layoutElimination(promotion.promotionName,matches,promotion);
const id=n=>'valorant:cn:'+n;
test('Official London final is rightmost and receives the two real winners-bracket and losers-bracket finalists',()=>{
 const layout=model(),final=layout.nodes.find(n=>n.id===id(1002186));assert.ok(final);
 assert.equal(layout.nodes.filter(n=>n.kind==='match').length,14);
 assert.ok(layout.nodes.filter(n=>n.kind==='match'&&n!==final).every(n=>n.x<final.x));
 assert.deepEqual(layout.edges.filter(e=>e.to===final.id).map(e=>e.from).sort(),[id(1002183),id(1002185)]);
 assert.ok(layout.edges.filter(e=>e.to===final.id).every(e=>e.outcome==='win'&&e.kind==='confirmed-advancement'));
 assert.deepEqual(layout.edges.filter(e=>e.kind==='stage-entry').map(e=>e.to).sort(),[2167,2168,2169,2170].map(n=>id(1000000+n)));
});
test('All reconstructed routes are supported by the official completed result and the next officially published participant',()=>{
 const layout=model(),lookup=new Map(matches.map(m=>[m.id,m]));const edges=layout.edges.filter(e=>e.kind==='confirmed-advancement');assert.equal(edges.length,20);
 for(const edge of edges){const from=lookup.get(edge.from),to=lookup.get(edge.to);assert.equal(from.status,'finished');assert.ok(to.teams.includes(edge.teamId));assert.equal(edge.teamId,edge.outcome==='win'?from.winner:from.teams.find(t=>t!==from.winner));assert.ok(Date.parse(to.startsAt)>Date.parse(from.startsAt));}
 const loser=edges.find(e=>e.from===id(1002167)&&e.outcome==='loss');assert.equal(loser.to,id(1002171));assert.equal(loser.teamId,matches.find(m=>m.id===id(1002167)).teams[1]);
});
test('Missing future opponents and unfinished outcomes never create a path or fill a team slot',()=>{
 const future=matches.map((m,i)=>i<4?m:{...m,status:'upcoming',teams:[null,null],winner:null,score:null});const before=JSON.stringify(future),layout=layoutElimination(promotion.promotionName,future,promotion);
 assert.ok(layout);assert.equal(layout.edges.filter(e=>e.kind==='confirmed-advancement').length,0);assert.equal(JSON.stringify(future),before);
 const final=layout.nodes.find(n=>n.id===id(1002186));assert.ok(layout.nodes.filter(n=>n.kind==='match'&&n!==final).every(n=>n.x<final.x));assert.deepEqual(final.match.teams,[null,null]);
});
test('Group or Swiss rematches never masquerade as elimination progression',()=>{
 assert.equal(layoutElimination('小组赛',matches.map(m=>({...m,stage:'小组赛'}))),null);
 const swiss=raw.feed.promotions.find(p=>p.templateName.includes('瑞士'));assert.equal(layoutElimination(swiss.promotionName,raw.feed.matches.filter(m=>m.stage===swiss.promotionName),swiss),null);
});
test('Cancelled targets and conflicting or ambiguous official results produce no inferred edge',()=>{
 const altered=matches.map(m=>m.id===id(1002171)?{...m,status:'cancelled'}:m.id===id(1002167)?{...m,winner:'not-a-participant'}:m),layout=layoutElimination(promotion.promotionName,altered,promotion);
 assert.ok(!layout.edges.some(e=>e.kind==='confirmed-advancement'&&(e.to===id(1002171)||e.from===id(1002167))));
 const target=matches.find(m=>m.id===id(1002180)),duplicate={...target,id:'valorant:cn:ambiguous'},ambiguous=layoutElimination(promotion.promotionName,[...matches,duplicate]);
 assert.ok(!ambiguous.edges.some(e=>e.from===id(1002167)&&e.outcome==='win'));
});
test('Nodes and paths stay within the diagram, never overlap, preserve official values and do not depend on response ordering',()=>{
 const before=JSON.stringify(matches),layout=model(),reverse=layoutElimination(promotion.promotionName,[...matches].reverse(),promotion);assert.equal(JSON.stringify(matches),before);
 assert.deepEqual(layout.nodes.map(n=>[n.id,n.x,n.y]),reverse.nodes.map(n=>[n.id,n.x,n.y]));
 const byId=new Map(layout.nodes.map(n=>[n.id,n]));for(const a of layout.nodes){assert.ok(a.x>=0&&a.y>=0&&a.x+a.width<=layout.width&&a.y+a.height<=layout.height);for(const b of layout.nodes){if(a===b)continue;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}}
 for(const e of layout.edges){assert.ok(byId.get(e.from).x<byId.get(e.to).x);}
 for(const node of layout.nodes.filter(n=>n.kind==='match'))assert.deepEqual(node.match,matches.find(m=>m.id===node.id));
});

test('Saved diagram exports use the same progressive finals layout without rewriting official matches',()=>{
 const before=JSON.stringify(raw.feed),diagrams=archiveDiagrams(raw.feed),stages=diagrams.events[0].stages;
 assert.equal(diagrams.version,DIAGRAM_VERSION);const stage=stages.find(s=>s.name===promotion.promotionName);assert.equal(stage.layout.type,'elimination');
 assert.equal(stage.layout.edges.filter(e=>e.to===id(1002186)).length,2);assert.equal(JSON.stringify(raw.feed),before);
});

test('Older official promotions with incomplete paths keep separate rounds from overlapping',async()=>{
 const older=JSON.parse(await readFile(new URL('./fixtures/older-elimination-official.json',import.meta.url))),list=older.feed.matches.filter(m=>m.stage==='淘汰赛'),promotion=older.feed.promotions.find(p=>p.promotionName==='淘汰赛');
 const layout=layoutElimination('淘汰赛',list,promotion);assert.ok(layout);
 for(const a of layout.nodes)for(const b of layout.nodes){if(a===b)continue;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,a.id+' overlaps '+b.id);}
});

test('Official historic final date errors and multiple finals never cause reversed paths or overlapping final cards',async()=>{
 const records=JSON.parse(await readFile(new URL('./fixtures/historical-finals-official.json',import.meta.url)));
 for(const record of records){const list=record.feed.matches.filter(m=>/淘汰赛|夏季赛季后赛/.test(m.stage)),layout=layoutElimination(list[0].stage,list);assert.ok(layout);
  const nodes=new Map(layout.nodes.map(n=>[n.id,n]));for(const edge of layout.edges)assert.ok(nodes.get(edge.from).x<nodes.get(edge.to).x,'Backward historical route');
  const entries=layout.edges.filter(e=>e.kind==='stage-entry');assert.ok(entries.every(e=>nodes.get(e.to).lane!=='final'),'Final is not a first-round match');
  for(const a of layout.nodes)for(const b of layout.nodes){if(a===b)continue;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Historical final cards overlap');}
 }
});
