import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotCache} from '../server/snapshot-cache.mjs';
import {blastFeed} from '../server/providers/blast.mjs';
import {apexStandings} from '../server/providers/apex.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Encode controlled official-shaped data in the same indexed turbo-stream format as BLAST.
function blastPage(value){
 const values=[];
 const add=x=>{const i=values.length;values.push(null);if(Array.isArray(x))values[i]=x.map(add);else if(x&&typeof x==='object')values[i]=Object.fromEntries(Object.entries(x).map(([k,v])=>['_'+add(k),add(v)]));else values[i]=x;return i;};
 add(value);return '<script>streamController.enqueue('+JSON.stringify(JSON.stringify(values))+')</script>';
}
const active={id:'active-event',name:'Active event',startDate:'2026-10-01T00:00:00Z',endDate:'2026-10-10T00:00:00Z'};
const upcoming={id:'next-event',name:'Next event',startDate:'2026-10-11T00:00:00Z',endDate:'2026-10-20T00:00:00Z'};
const detail=t=>({tournament:t,tournamentBracketsPromise:[{tournamentUuid:t.id,label:'Playoffs',matches:[{uuid:t.id+'-match',name:'Final',type:'BO3',index:0,timeOfSeries:t===active?'2026-10-05T08:00:00Z':t.startDate,isLive:t===active,isCompleted:false,teamA:{uuid:'a',name:'Team A'},teamB:{uuid:'b',name:'Team B'},teamAScore:1,teamBScore:0}]}]});
function mockBlast(t,failedEvent){
 t.mock.method(globalThis,'fetch',async input=>{
  const path=new URL(input).pathname;
  if(path==='/cs/tournaments')return new Response(blastPage({loaderData:{'routes/$gameId.tournaments._index':{groupedUpcomingTournaments:{October:[active,upcoming]}}}}));
  if(path.endsWith('/'+failedEvent()))throw new Error('Selected event temporarily unavailable');
  assert.ok(path.endsWith('/active-event')||path.endsWith('/next-event'));
  const tournament=path.endsWith('/active-event')?active:upcoming;
  return new Response(blastPage({loaderData:{'routes/$gameId.tournaments.$tournamentId':detail(tournament)}}));
 });
}

test('A partial BLAST refresh preserves the last complete feed and its official live match',async t=>{
 let time=Date.parse('2026-10-05T08:00:00Z'),failed=false;t.mock.method(Date,'now',()=>time);
 const cache=createSnapshotCache();
 mockBlast(t,()=>failed?'active-event':null);
 const first=await cache.read('blast-partial',blastFeed);assert.equal(first.matches.length,2);assert.equal(first.stale,false);
 time+=61000;failed=true;
 const next=await cache.read('blast-partial',blastFeed);
 assert.equal(next.stale,true);
 assert.equal(next.matches.find(m=>m.id==='cs2:active-event-match')?.status,'live');
 assert.deepEqual(next.matches,first.matches);
 assert.equal(next.source.retrievedAt,first.source.retrievedAt);
});

test('An incomplete ALGS standings refresh retains previously read phases with the original timestamp',async t=>{
 let time=0,failed=false;const cache=createSnapshotCache({now:()=>time});
 const event={id:'apex:event',phases:[{id:'phase-a',name:'Group A'},{id:'phase-b',name:'Group B'}]};
 t.mock.method(globalThis,'fetch',async input=>{
  if(String(input).includes('/phase-a/')&&failed)throw new Error('Group A unavailable');
  return new Response(JSON.stringify({standings:[{teamId:'official-team',name:'Official team',position:1,points:42,kills:10,qualified:true,matchSeriesPlayed:1}]}));
 });
 const first=await cache.read('algs-partial',()=>apexStandings(event));assert.equal(first.phases.length,2);
 time+=61000;failed=true;
 const next=await cache.read('algs-partial',()=>apexStandings(event));
 assert.equal(next.stale,true);
 assert.deepEqual(next.phases,first.phases);
 assert.equal(next.retrievedAt,first.retrievedAt);
 time+=16000;failed=false;
 const recovered=await cache.read('algs-partial',()=>apexStandings(event));
 assert.equal(recovered.stale,false);assert.equal(recovered.partial,false);assert.equal(recovered.phases.length,2);
});

test('Without a previous snapshot, readable partial official data remains available and marked incomplete',async()=>{
 const cache=createSnapshotCache(),partial={source:{retrievedAt:'2026-10-05T08:00:00Z'},matches:[{id:'official-match'}],partial:true};
 const read=await cache.read('partial-first',async()=>partial);
 assert.equal(read.partial,true);assert.equal(read.stale,false);assert.deepEqual(read.matches,[{id:'official-match'}]);
});

for(const restart of [false,true])test('An earlier partial BLAST snapshot retains its live match when a different event fails'+(restart?' after restart':''),async t=>{
 let time=Date.parse('2026-10-05T08:00:00Z'),failedEvent='next-event';t.mock.method(Date,'now',()=>time);
 const directory=restart?await mkdtemp(join(tmpdir(),'matchpoint-partial-recovery-')):null;
 if(directory)t.after(()=>rm(directory,{recursive:true,force:true}));
 let cache=createSnapshotCache({directory});mockBlast(t,()=>failedEvent);
 const first=await cache.read('blast-initial-partial',blastFeed);
 assert.equal(first.partial,true);assert.equal(first.stale,false);assert.equal(first.matches[0].id,'cs2:active-event-match');
 time+=61000;failedEvent='active-event';if(restart)cache=createSnapshotCache({directory});
 const next=await cache.read('blast-initial-partial',blastFeed);
 assert.equal(next.stale,true);assert.equal(next.partial,true);
 assert.deepEqual(next.matches,first.matches);assert.equal(next.source.retrievedAt,first.source.retrievedAt);
});
