import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractRiotEvents,normalizeRiot} from '../server/providers/riot.mjs';
import {decodeBlast,normalizeBlast} from '../server/providers/blast.mjs';
import {normalizeApex} from '../server/providers/apex.mjs';
import {clock,phaseStatus,safeLink} from '../server/providers/common.mjs';
const fixture=async name=>JSON.parse(await readFile(new URL('./fixtures/'+name,import.meta.url),'utf8'));
test('Riot SSR parser reads embedded official matches without executing scripts',async()=>{const events=await fixture('riot-official.json');const payload=JSON.stringify({data:{events},unused:null}).replace('"unused":null','"unused":undefined');const html='<script>(window[Symbol.for("ApolloSSRDataTransport")] ??= []).push('+payload+')</script><script>throw new Error("must not run");</script>';assert.deepEqual(extractRiotEvents(html),events);});
test('Riot changed markup fails explicitly rather than fabricating matches',()=>assert.throws(()=>extractRiotEvents('<html></html>'),/结构/));
test('Riot official completed scores and outcomes are retained',async()=>{const feed=normalizeRiot(await fixture('riot-official.json'),'valorant');const match=feed.matches.find(m=>m.id==='valorant:115581239610581334');assert.deepEqual(match.score,[3,2]);assert.equal(match.winner,match.teams[0]);assert.match(feed.source.url,/valorantesports/);});
test('Riot official zero-zero unstarted match stays VS without invented winner',async()=>{const feed=normalizeRiot(await fixture('riot-official.json'),'valorant');const match=feed.matches.find(m=>m.status==='upcoming');assert.equal(match.score,null);assert.equal(match.winner,null);assert.ok(match.teams.every(id=>feed.teams[id]));});
test('BLAST turbo-stream resolves deferred data and literal Date timestamps',()=>{const first=[{'_1':2,_4:5},'result',['P',2],'unused','scheduledAt',['D',1791045000000]];const second=[{'_7':8},'label','a \"quoted\" label'];const html='<script>window.__reactRouterContext.streamController.enqueue('+JSON.stringify(JSON.stringify(first))+')</script><script>window.__reactRouterContext.streamController.enqueue('+JSON.stringify('P2:'+JSON.stringify(second)+'\n')+')</script>';assert.deepEqual(decodeBlast(html),{result:{label:'a \"quoted\" label'},scheduledAt:'2026-10-03T16:30:00.000Z'});});
test('BLAST real official Swiss groups and playoff edges are preserved',async()=>{const feed=normalizeBlast([await fixture('cs2-official.json')]);assert.equal(feed.matches.length,41);const playoff=feed.brackets.find(b=>b.name==='Playoffs');assert.equal(playoff.groups[0].matchIds.length,7);const q=feed.matches.find(m=>m.matchName==='Quarter Final 1');assert.equal(q.nextMatch,'cs2:36fcf650-c268-4c7e-a1a4-dc4bc1f732dc');assert.equal(q.nextSlot,0);assert.deepEqual(q.teams,[null,null]);assert.equal(q.score,null);});
test('ALGS keeps official series statuses, dates, maps and independent regions',async()=>{const f=await fixture('apex-official.json');const feed=normalizeApex(f.series,f.season);assert.equal(feed.matches.length,f.series.length);assert.equal(feed.matches[0].score,null);assert.equal(feed.matches[0].completedMaps,6);assert.ok(feed.events[0].phases.length);assert.ok(feed.matches.every(m=>m.teams.length===0));});
test('Beijing conversion correctly crosses midnight and invalid dates remain unpublished',()=>{assert.deepEqual(clock('2026-10-02T18:00:00Z'),{date:'2026-10-03',time:'02:00',startsAt:'2026-10-02T18:00:00.000Z'});assert.equal(clock(undefined).date,null);});
test('Unknown, canceled and postponed source states are not assumed live by wall clock',()=>{assert.equal(phaseStatus('inProgress'),'live');assert.equal(phaseStatus('cancelled'),'cancelled');assert.equal(phaseStatus('postponed'),'postponed');assert.equal(phaseStatus('unexpected'),'unknown');});
test('External source links reject scripts, insecure protocols and embedded credentials',()=>{assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('https://user:password@example.com'),null);assert.equal(safeLink('http://example.com'),null);assert.equal(safeLink('https://www.twitch.tv/eslcs'),'https://www.twitch.tv/eslcs');});

// --- official status staleness -----------------------------------------------------------------
// BLAST's bracket isLive may lag its single-match matchState (covered in blast-live.test.mjs).
// The bracket normalizer preserves its published state and surfaces the tournament flag;
// overdue timestamps describe freshness and never independently promote a match to live.
const blastDetail = (brackets, promised = []) => ({ tournament: { id: 't1', name: 'Official event' }, tournamentBracketsPromise: brackets, tournamentMatchesPromise: promised });
const bracketMatch = (uuid, iso, extra = {}) => ({ uuid, timeOfSeries: iso, type: 'BO3', isLive: false, isCompleted: false, teamA: { name: 'Alpha' }, teamB: { name: 'Bravo' }, ...extra });

test('Official tournament live flag is surfaced on the event and never derived from a match',()=>{
 const detail=blastDetail([{label:'Group',matches:[bracketMatch('m1','2026-10-06T12:00:00.000Z')]}]);
 const live=normalizeBlast([detail],new Set(['t1']),Date.parse('2026-10-06T11:00:00Z'));
 assert.equal(live.events[0].live,true);
 assert.equal(live.matches[0].status,'upcoming');
 const idle=normalizeBlast([detail],new Set(),Date.parse('2026-10-06T11:00:00Z'));
 assert.equal(idle.events[0].live,false);
});

test('A match past its published start is marked stale without changing its official status',()=>{
 const detail=blastDetail([{label:'Group',matches:[
  bracketMatch('past','2026-10-06T12:00:00.000Z'),
  bracketMatch('future','2026-10-06T16:00:00.000Z'),
  bracketMatch('just','2026-10-06T12:29:00.000Z'),
  bracketMatch('done','2026-10-06T09:00:00.000Z',{isCompleted:true,teamAScore:2,teamBScore:0}),
 ]}]);
 const feed=normalizeBlast([detail],new Set(),Date.parse('2026-10-06T12:30:00Z'));
 const by=id=>feed.matches.find(m=>m.id==='cs2:'+id);
 assert.equal(by('past').startOverdue,true);
 assert.equal(by('past').status,'upcoming');
 assert.equal(by('future').startOverdue,false);
 assert.equal(by('just').startOverdue,false,'a match inside the grace period is not reported as stale');
 assert.equal(by('done').startOverdue,false);
 assert.ok(feed.matches.every(m=>m.status!=='live'),'no match may be promoted to live by the wall clock');
});

test('Matches only present in the tournament feed distinguish future from genuinely unknown',async()=>{
 const detail=blastDetail([],[
  {id:'up',scheduledAt:'2026-10-07T12:00:00.000Z',type:'BO3',teamA:{name:'Alpha'},teamB:{name:'Bravo'}},
  {id:'gone',scheduledAt:'2026-10-05T12:00:00.000Z',type:'BO3',teamA:{name:'Charlie'},teamB:{name:'Delta'}},
 ]);
 const feed=normalizeBlast([detail],new Set(),Date.parse('2026-10-06T12:30:00Z'));
 assert.equal(feed.matches.find(m=>m.id==='cs2:up').status,'upcoming','a future match is not "status pending"');
 assert.equal(feed.matches.find(m=>m.id==='cs2:gone').status,'unknown','a past match with no published status stays unknown');
 assert.equal(feed.matches.find(m=>m.id==='cs2:gone').startOverdue,true);
});
