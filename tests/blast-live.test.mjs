import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeBlast,normalizeBlast,refreshBlastMatchStates,blastFeed} from '../server/providers/blast.mjs';
import {createSnapshotCache} from '../server/snapshot-cache.mjs';

const official=JSON.parse(await readFile(new URL('./fixtures/cs2-live-official.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-06T12:40:00Z'),eventId='cs2:'+official.detail.tournament.id;
function blastPage(value){
 const values=[];
 const add=x=>{const i=values.length;values.push(null);if(Array.isArray(x))values[i]=x.map(add);else if(x&&typeof x==='object')values[i]=Object.fromEntries(Object.entries(x).map(([k,v])=>['_'+add(k),add(v)]));else values[i]=x;return i;};
 add(value);return '<script>streamController.enqueue('+JSON.stringify(JSON.stringify(values))+')</script>';
}
function mockPages(t,select=page=>page){
 t.mock.method(globalThis,'fetch',async input=>{
  const url=new URL(input);assert.equal(url.origin,'https://blast.tv');
  const page=official.pages.find(p=>url.pathname.endsWith('/match/'+p.tournamentMatch.id.split('-')[0]));
  assert.ok(page,'Only due matches with official IDs are read');
  const selected=select(structuredClone(page));if(selected instanceof Error)throw selected;
  return new Response(blastPage({loaderData:{'routes/cs.tournaments.$tournamentId.match.$seriesId.($teams)':selected}}));
 });
}
const fresh=()=>normalizeBlast([structuredClone(official.detail)],new Set([official.detail.tournament.id]),now);
const refresh=feed=>refreshBlastMatchStates(feed,new Set([eventId]),now);

test('BLAST single-match pages correct real Spirit–1win and G2–Parivision stale bracket states',async t=>{
 mockPages(t);const feed=fresh(),brackets=structuredClone(feed.brackets),ids=feed.matches.map(m=>m.id);
 assert.ok(feed.matches.every(m=>m.status==='upcoming'&&m.startOverdue));
 await refresh(feed);
 assert.deepEqual(feed.matches.map(m=>m.id),ids);assert.deepEqual(feed.brackets,brackets);
 assert.ok(feed.matches.every(m=>m.status==='live'&&!m.startOverdue&&m.winner===null));
 assert.ok(feed.matches.every(m=>m.score===null),'Absent external scores remain VS instead of default 0:0');
 assert.ok(feed.matches.every(m=>m.statusSource.url===m.sourceUrl&&m.statusSource.retrievedAt));
 assert.ok(!feed.partial);
});

test('BLAST overdue matches still reported pre by their match page never become live',async t=>{
 mockPages(t,p=>({...p,matchState:'pre'}));const feed=await refresh(fresh());
 assert.ok(feed.matches.every(m=>m.status==='upcoming'&&m.startOverdue&&m.score===null));
});

test('Huya, Douyu and Bilibili room links never trigger status requests or imply a live match',async t=>{
 for(const url of ['https://www.huya.com/483917','https://www.douyu.com/288016','https://live.bilibili.com/6']){
  mockPages(t,p=>({...p,matchState:'pre',tournamentMatch:{...p.tournamentMatch,metadata:{_t:'cs_match',externalStreamUrl:url}}}));
  const feed=await refresh(fresh());
  assert.ok(feed.matches.every(m=>m.status==='upcoming'&&m.score===null));
  assert.ok(feed.matches.every(m=>m.externalStreamUrl===url),'Room links are retained as links only');
 }
});

test('BLAST official page keeps one match ID from upcoming through live and finished',async t=>{
 const expected=[['pre','upcoming',null],['live','live',[1,0]],['post','finished',[2,0]]];
 for(const [state,status,score] of expected){
  mockPages(t,p=>({...p,matchState:state,tournamentMatch:{...p.tournamentMatch,teamAScore:score?.[0]||0,teamBScore:0}}));
  const feed=await refresh(fresh());
  for(const m of feed.matches){assert.equal(m.status,status);assert.deepEqual(m.score,score);assert.equal(m.winner,status==='finished'?m.teams[0]:null);}
 }
});

test('BLAST wrong match identity, missing status and unknown states are incomplete reads',async t=>{
 for(const change of [p=>({...p,tournamentMatch:{...p.tournamentMatch,id:'wrong-id'}}),p=>({...p,tournamentMatch:{...p.tournamentMatch,tournament:{id:'wrong-event'}}}),p=>({...p,matchState:undefined}),p=>({...p,matchState:'unexpected'}),p=>({...p,tournamentMatch:{...p.tournamentMatch,scheduledAt:'invalid'}}),p=>({...p,tournamentMatch:{...p.tournamentMatch,teamA:null}})]){
  mockPages(t,change);const feed=await refresh(fresh());assert.equal(feed.partial,true);assert.match(feed.warning,/单场状态/);
  assert.ok(feed.matches.every(m=>m.status==='upcoming'&&m.score===null));
 }
});

test('A BLAST single-match request failure retains the previous live snapshot and timestamp',async t=>{
 let time=0;const cache=createSnapshotCache({now:()=>time});mockPages(t);
 const first=await cache.read('cs2-live',()=>refresh(fresh()));time+=61000;
 mockPages(t,()=>new Error('Official page unavailable'));
 const next=await cache.read('cs2-live',()=>refresh(fresh()));
 assert.equal(next.stale,true);assert.deepEqual(next.matches,first.matches);assert.equal(next.source.retrievedAt,first.source.retrievedAt);
});

test('BLAST first read exposes incomplete status data while retaining readable matches',async t=>{
 mockPages(t,()=>new Error('Official page unavailable'));const feed=await refresh(fresh());
 assert.equal(feed.partial,true);assert.equal(feed.matches.length,2);assert.ok(feed.matches.every(m=>m.status==='upcoming'));
});

test('BLAST avoids requests for future, finished, already live, unassigned and inactive matches',async t=>{
 const feed=fresh(),m=feed.matches[0];
 feed.matches=[{...m,id:'cs2:future',startsAt:'2026-10-06T14:30:00Z'},{...m,id:'cs2:done',status:'finished'},{...m,id:'cs2:live',status:'live'},{...m,id:'cs2:tbd',teams:[null,null]},{...m,id:'cs2:inactive',eventId:'cs2:other'}];
 t.mock.method(globalThis,'fetch',()=>assert.fail('No official page should be requested'));
 const result=await refresh(feed);assert.equal(result.matches.length,5);assert.ok(!result.partial);
});

test('BLAST match pages accept deferred null, undefined and shared values without crashing',()=>{
 const table=[{_1:2,_3:4,_5:6},'roster',['P',20],'stats',['P',21],'shared',['P',22],'retained'];
 const html=[JSON.stringify(table),'P20:-7\nP21:-5\nP22:7\n'].map(s=>'<script>streamController.enqueue('+JSON.stringify(s)+')</script>').join('');
 assert.deepEqual(decodeBlast(html),{roster:null,stats:null,shared:'retained'});
});

test('BLAST feed integrates official match states after reading the tournament bracket',async t=>{
 t.mock.method(Date,'now',()=>now);
 t.mock.method(globalThis,'fetch',async input=>{
  const path=new URL(input).pathname;
  if(path==='/cs/tournaments')return new Response(blastPage({loaderData:{'routes/$gameId.tournaments._index':{groupedUpcomingTournaments:{October:[{...official.detail.tournament,startDate:'2026-10-03T12:00:00Z',endDate:'2026-10-11T12:00:00Z',isTournamentLive:true}]}}}}));
  if(path==='/cs/tournaments/'+official.detail.tournament.id)return new Response(blastPage({loaderData:{'routes/$gameId.tournaments.$tournamentId':official.detail}}));
  const page=official.pages.find(p=>path.endsWith('/match/'+p.tournamentMatch.id.split('-')[0]));assert.ok(page);
  return new Response(blastPage({loaderData:{'routes/cs.tournaments.$tournamentId.match.$seriesId.($teams)':page}}));
 });
 const feed=await blastFeed();assert.equal(feed.partial,false);assert.equal(feed.matches.length,2);assert.ok(feed.matches.every(m=>m.status==='live'));
});
