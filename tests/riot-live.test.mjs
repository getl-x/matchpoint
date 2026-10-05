import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {riotFeed} from '../server/providers/riot.mjs';
import {createSnapshotCache} from '../server/snapshot-cache.mjs';

const official=JSON.parse(await readFile(new URL('./fixtures/riot-official.json',import.meta.url),'utf8'));
const finished=official.find(e=>e.state==='completed'),upcoming=official.find(e=>e.state==='unstarted');
const live={...structuredClone(upcoming),id:'live-only',state:'inProgress',startTime:'2026-10-04T15:30:00Z'};
live.matchTeams[0].result={gameWins:1,outcome:null};
live.matchTeams[1].result={gameWins:0,outcome:null};

function mockOfficial(t,game,homeEvents,liveResponse){
 const origin=game==='lol'?'https://lolesports.com':'https://valorantesports.com';
 t.mock.method(globalThis,'fetch',async(input,options)=>{
  const url=new URL(input);
  if(url.origin===origin&&url.pathname==='/en-US'){
   return new Response('<script>(window[Symbol.for("ApolloSSRDataTransport")] ??= []).push('+JSON.stringify({data:{events:homeEvents}})+')</script>');
  }
  if(url.origin===origin&&url.pathname==='/api/gql'){
   const variables=JSON.parse(url.searchParams.get('variables'));
   assert.equal(url.searchParams.get('operationName'),'homeEvents');
   assert.deepEqual(variables.eventState,['inProgress']);
   assert.equal(variables.sport,game==='lol'?'lol':'val');
   assert.equal(variables.eventType,'match');
   // Live matches can have started before midnight; do not apply today's start-date window.
   assert.equal(variables.eventDateStart,undefined);
   assert.equal(variables.eventDateEnd,undefined);
   assert.equal(JSON.parse(url.searchParams.get('extensions')).persistedQuery.sha256Hash,'7246add6f577cf30b304e651bf9e25fc6a41fe49aeafb0754c16b5778060fc0a');
   const headers=new Headers(options.headers);
   assert.equal(headers.get('content-type'),'application/json');
   assert.ok(headers.get('apollographql-client-name'));
   assert.ok(headers.get('apollographql-client-version'));
   if(liveResponse instanceof Error)throw liveResponse;
   return new Response(JSON.stringify(liveResponse));
  }
  if(url.hostname==='val.native.game.qq.com')return new Response(JSON.stringify({msg:[]}));
  if(url.hostname==='lpl.qq.com')return new Response('var GameList='+JSON.stringify({msg:{sGameList:{}}})+';');
  assert.fail('Unexpected official request: '+url);
 });
}

for(const game of ['valorant','lol']){
 test(game+' retains live matches omitted from homepage SSR with official scores and streams',async t=>{
  mockOfficial(t,game,[finished,upcoming],{data:{esports:{events:[live]}}});
  const feed=await riotFeed(game),match=feed.matches.find(m=>m.id===game+':live-only');
  assert.ok(match,'The live-only official match must appear in the feed');
  assert.equal(match.status,'live');
  assert.deepEqual(match.score,[1,0]);
  assert.equal(match.winner,null);
  assert.equal(match.date,'2026-10-04');
  assert.deepEqual(match.streams,live.streams);
  assert.ok(match.teams.every(id=>feed.teams[id]));
  assert.equal(feed.matches.find(m=>m.id===game+':'+finished.id).status,'finished');
  assert.equal(feed.matches.find(m=>m.id===game+':'+upcoming.id).status,'upcoming');
 });
}

test('A Riot match stays present under the same ID through upcoming, live and finished refreshes',async t=>{
 const cache=createSnapshotCache();let time=0;t.mock.method(Date,'now',()=>time);
 const phases=[
  {home:[upcoming],current:[],status:'upcoming',score:null},
  {home:[],current:[{...live,id:upcoming.id}],status:'live',score:[1,0]},
  {home:[{...finished,id:upcoming.id}],current:[],status:'finished',score:[3,2]}
 ];
 for(const phase of phases){
  mockOfficial(t,'valorant',phase.home,{data:{esports:{events:phase.current}}});
  const feed=await cache.read('riot-lifecycle',()=>riotFeed('valorant'));
  assert.equal(feed.matches.length,1,'A refresh must not drop the match during play');
  assert.equal(feed.matches[0].id,'valorant:'+upcoming.id);
  assert.equal(feed.matches[0].status,phase.status);
  assert.deepEqual(feed.matches[0].score,phase.score);
  time+=61000;
 }
});

test('Live API data replaces an older SSR copy without duplicating the Riot match',async t=>{
 mockOfficial(t,'valorant',[finished,upcoming],{data:{esports:{events:[{...live,id:upcoming.id}]}}});
 const feed=await riotFeed('valorant'),copies=feed.matches.filter(m=>m.id==='valorant:'+upcoming.id);
 assert.equal(copies.length,1);
 assert.equal(copies[0].status,'live');
 assert.deepEqual(copies[0].score,[1,0]);
});

test('A Riot live endpoint failure keeps the previous snapshot explicitly stale',async t=>{
 const cache=createSnapshotCache();let time=0;t.mock.method(Date,'now',()=>time);
 mockOfficial(t,'valorant',[finished,upcoming],{data:{esports:{events:[live]}}});
 const first=await cache.read('riot-failure',()=>riotFeed('valorant'));time+=61000;
 mockOfficial(t,'valorant',[finished,upcoming],new Error('live endpoint unavailable'));
 const next=await cache.read('riot-failure',()=>riotFeed('valorant'));
 assert.equal(next.stale,true);
 assert.deepEqual(next.matches,first.matches);
 assert.equal(next.source.retrievedAt,first.source.retrievedAt);
});

test('Riot GraphQL errors or malformed live results cannot silently claim a complete feed',async t=>{
 for(const payload of [
  {errors:[{message:'PersistedQueryNotFound'}]},
  {data:{esports:{events:null}}},
  {data:{esports:{events:[]}},errors:[{message:'partial response'}]}
 ]){
  mockOfficial(t,'valorant',[finished,upcoming],payload);
  await assert.rejects(riotFeed('valorant'),/进行中/);
 }
});
