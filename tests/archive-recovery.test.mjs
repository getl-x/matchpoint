import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createArchiveStore} from '../server/archive.mjs';
import {normalizeNativeLol,fetchHistory} from '../server/providers/history.mjs';
import {normalizeApex} from '../server/providers/apex.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/native-history.json',import.meta.url),'utf8'));
const record={...raw.lol.record,year:'2014'},feed=normalizeNativeLol(record,raw.lol.rows,raw.lol.teams);
async function setup(t,fetchEvent=async()=>({feed}),ownRecord=record,extra={}){
 const directory=await mkdtemp(join(tmpdir(),'matchpoint-archive-recovery-'));
 assert.ok(directory.startsWith(join(tmpdir(),'matchpoint-archive-recovery-')));
 const options={directory,fetchEvent,discover:async game=>({source:{retrievedAt:feed.source.retrievedAt},records:game===ownRecord.game?[ownRecord]:[]}),...extra};
 const store=createArchiveStore(options);t.after(()=>rm(directory,{recursive:true,force:true}));
 await store.synchronize();await store.idle();return {directory,store,options};
}
test('An incomplete archive refresh retains missing official matches and applies corrections by match ID',async t=>{
 let next={...feed,partial:true};
 const {store,directory,options}=await setup(t,async()=>({feed:next}));
 const first=await store.readEvent(record.id),corrected={...first.feed.matches[0],score:[7,0]};
 next={...feed,matches:[corrected],partial:true};
 const second=await store.readEvent(record.id,{refresh:true});
 assert.equal(second.feed.matches.length,first.feed.matches.length);
 assert.deepEqual(second.feed.matches.find(m=>m.id===corrected.id).score,[7,0]);
 assert.equal(second.record.archiveStatus,'partial');
 const reopened=createArchiveStore({...options,directory});assert.equal((await reopened.readEvent(record.id)).feed.matches.length,first.feed.matches.length);await reopened.close();
});
test('Missing scores make a refresh partial even without a provider flag and cannot erase older matches',async t=>{
 let next={...feed,matches:feed.matches.map(m=>({...m,score:null}))};
 const {store}=await setup(t,async()=>({feed:next}));
 next={...next,matches:next.matches.slice(0,1)};
 const updated=await store.readEvent(record.id,{refresh:true});assert.equal(updated.feed.matches.length,feed.matches.length);assert.equal(updated.record.archiveStatus,'partial');
});
test('Repeated partial refreshes preserve the true last-read time of retained matches and standings phases',async t=>{
 const dates=['2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'];
 let next={...feed,partial:true,source:{...feed.source,retrievedAt:dates[0]}},standings={retrievedAt:dates[0],partial:true,phases:[{id:'phase1',teams:{},rows:[]},{id:'phase2',teams:{},rows:[]}]};
 const {store}=await setup(t,async()=>({feed:next,standings}));
 for(const date of dates.slice(1)){
  next={...feed,partial:true,matches:feed.matches.slice(0,1),source:{...feed.source,retrievedAt:date}};
  standings={...standings,retrievedAt:date,phases:standings.phases.slice(0,1)};await store.readEvent(record.id,{refresh:true});
 }
 const updated=await store.readEvent(record.id);
 assert.equal(updated.feed.retained.retrievedAtById[feed.matches[1].id],dates[0]);
 assert.equal(updated.standings.retained.retrievedAtById.phase2,dates[0]);
});
test('Incomplete standings refresh retains previously saved phases',async t=>{
 const apexRaw=JSON.parse(await readFile(new URL('./fixtures/apex-official.json',import.meta.url),'utf8')),whole=normalizeApex(apexRaw.series,apexRaw.season),event=whole.events[0];
 const ownRecord={...event,provider:'algs',year:'2026'},ownFeed={...whole,events:[event],matches:whole.matches.filter(m=>m.eventId===event.id),partial:true};
 const phase1={id:'official-phase-1',teams:{},rows:[]},phase2={id:'official-phase-2',teams:{},rows:[]};
 let standings={eventId:event.id,phases:[phase1,phase2],partial:true};
 const {store}=await setup(t,async()=>({feed:ownFeed,standings}),ownRecord);
 standings={...standings,phases:[phase2]};
 const refreshed=await store.readEvent(event.id,{refresh:true});assert.deepEqual(refreshed.standings.phases.map(p=>p.id),[phase1.id,phase2.id]);
});
test('Observed archives grow when an event returns with more official results',async t=>{
 const {store}=await setup(t,async()=>({feed}),{...record,game:'none'});
 await store.remember({...feed,matches:feed.matches.slice(0,1)});await store.remember({...feed,events:[],matches:[]});
 assert.equal((await store.readEvent(record.id)).feed.matches.length,1);
 await store.remember(feed);await store.remember({...feed,events:[],matches:[]});
 const updated=await store.readEvent(record.id);assert.equal(updated.feed.matches.length,feed.matches.length);assert.equal(updated.record.archiveStatus,'partial');
});
test('Unchanged observed archives retain their original snapshot time while official corrections are saved',async t=>{
 let time=Date.parse('2026-10-04T00:00:00Z');
 const {store}=await setup(t,async()=>({feed}),{...record,game:'none'},{now:()=>time});
 await store.remember(feed);await store.remember({...feed,events:[],matches:[]});
 const first=await store.readEvent(record.id);time+=60000;
 await store.remember({...feed,events:[],matches:[]});assert.equal((await store.readEvent(record.id)).archivedAt,first.archivedAt);
 const corrected={...feed.matches[0],score:[7,0]};
 await store.remember({...feed,matches:[corrected,...feed.matches.slice(1)]});await store.remember({...feed,events:[],matches:[]});
 const next=await store.readEvent(record.id);assert.notEqual(next.archivedAt,first.archivedAt);assert.deepEqual(next.feed.matches.find(m=>m.id===corrected.id).score,[7,0]);
});
test('An interrupted historical refresh restores saved index status from its valid payload after restart',async t=>{
 const {directory,store,options}=await setup(t);
 const original=await store.readEvent(record.id);await store.close();
 const indexPath=join(directory,'index.json'),index=JSON.parse(await readFile(indexPath,'utf8'));index.records[record.id].archiveStatus='loading';await writeFile(indexPath,JSON.stringify(index));
 const reopened=createArchiveStore({...options,fetchEvent:async()=>{throw new Error('offline');}});
 assert.equal((await reopened.list()).progress.complete,1);assert.deepEqual((await reopened.readEvent(record.id)).feed.matches,original.feed.matches);await reopened.close();
});
test('A transient archive index write failure does not poison subsequent event reads or refreshes',async t=>{
 let calls=0;const {store,directory}=await setup(t,async()=>{calls++;return {feed};});
 const blocker=join(directory,'index.json.tmp');await mkdir(blocker);
 await assert.rejects(store.readEvent(record.id,{refresh:true}));await rm(blocker,{recursive:true});
 const refreshed=await store.readEvent(record.id,{refresh:true});assert.equal(refreshed.feed.matches.length,feed.matches.length);assert.equal(calls,2);
});
test('Ordinary archive reads serve the saved snapshot while an official refresh is pending or fails',async t=>{
 let block=false,entered,release;
 const started=new Promise(r=>{entered=r;}),pending=new Promise(r=>{release=r;});
 const {store}=await setup(t,async()=>{if(block){entered();await pending;throw new Error('temporary');}return {feed};});
 block=true;const refresh=store.readEvent(record.id,{refresh:true}).catch(error=>error);await started;
 const reading=store.readEvent(record.id).catch(error=>error),immediate=await Promise.race([reading.then(result=>!(result instanceof Error)),new Promise(r=>setTimeout(()=>r(false),100))]);
 release();await refresh;const result=await reading;
 assert.equal(immediate,true);assert.deepEqual(result.feed.matches,feed.matches);
});
test('ALGS season snapshots refresh later official matches while retaining concurrent request coalescing',async t=>{
 const apexRaw=JSON.parse(await readFile(new URL('./fixtures/apex-official.json',import.meta.url),'utf8')),series=[structuredClone(apexRaw.series[0])],ownRecord={id:'apex:'+series[0].event.id,provider:'algs',seasonId:'recovery-test-season',seasonName:'Year 6'};
 let time=Date.now(),reads=0;t.mock.method(Date,'now',()=>time);
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url).includes('/series/seasons/')){reads++;return new Response(JSON.stringify({series}));}
  if(String(url).includes('/stats/phases/'))return new Response(JSON.stringify({standings:[]}));
  throw new Error('Unexpected fixture URL');
 });
 await Promise.all([fetchHistory(ownRecord),fetchHistory(ownRecord)]);assert.equal(reads,1);
 series[0].startsAt='2026-10-04T12:00:00.000Z';time+=7*3600000;
 const refreshed=await fetchHistory(ownRecord);assert.equal(reads,2);assert.equal(refreshed.feed.matches[0].startsAt,series[0].startsAt);
});
test('Official history with missing dates is marked incomplete after normalization drops those rows',async t=>{
 const rows=raw.lol.rows.map((m,i)=>({...m,MatchDate:i===0?m.MatchDate:null}));
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url).includes('searchBMatchInfo'))return new Response('var retObj='+JSON.stringify({status:0,msg:{result:rows,total:rows.length,totalpage:1}})+';');
  if(String(url).includes('TEAM_LIST'))return new Response('var TeamList='+JSON.stringify({msg:raw.lol.teams})+';');
  throw new Error('Unexpected fixture URL');
 });
 const result=await fetchHistory({...record,provider:'lol-cn'});
 assert.equal(result.feed.matches.length,1);assert.equal(result.feed.partial,true);assert.equal(result.feed.expectedMatchCount,13);
});
