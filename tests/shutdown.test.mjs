import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createAppServer,drainServer} from '../server.mjs';
import {createArchiveStore} from '../server/archive.mjs';
import {createLogoCache} from '../server/team-logos.mjs';
import {normalizeNativeLol} from '../server/providers/history.mjs';
async function directory(t){const parent=resolve(tmpdir()),dir=await mkdtemp(join(parent,'matchpoint-shutdown-'));t.after(async()=>{assert.ok(dir.startsWith(join(parent,'matchpoint-shutdown-')));await rm(dir,{recursive:true,force:true});});return dir;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('Shutdown finishes storage writers after closing HTTP connections',async()=>{
 const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let archiveFinished=false,logosFinished=false;
 await drainServer(server,{history:{close:async()=>{await delay(50);archiveFinished=true;}},logos:{close:async()=>{await delay(70);logosFinished=true;}}});
 assert.equal(server.listening,false);assert.equal(archiveFinished,true);assert.equal(logosFinished,true);
});
test('Archive close drains the active official fetch and completes its atomic snapshot and index writes',async t=>{
 const dir=await directory(t),fixture=JSON.parse(await readFile(new URL('./fixtures/native-history.json',import.meta.url),'utf8')),record=fixture.lol.record,feed=normalizeNativeLol(record,fixture.lol.rows,fixture.lol.teams);
 const store=createArchiveStore({directory:dir,discover:async game=>({records:game==='lol'?[record]:[],source:feed.source}),fetchEvent:async()=>{await delay(50);return {feed};}});
 await store.synchronize();await store.close();const index=JSON.parse(await readFile(join(dir,'index.json'),'utf8'));assert.equal(index.records[record.id].archiveStatus,'saved');
 const restarted=createArchiveStore({directory:dir});assert.deepEqual((await restarted.readEvent(record.id)).feed.matches,feed.matches);
});
test('Logo close waits for in-flight image downloads and the manifest write',async t=>{
 const dir=await directory(t),png=await readFile(new URL('../assets/icon-192.png',import.meta.url)),store=createLogoCache({directory:dir,fetcher:async()=>{await delay(50);return new Response(png,{headers:{'content-type':'image/png'}});}});
 const teams={'valorant:shutdown-test':{id:'valorant:shutdown-test',name:'Test',logos:{dark:'https://static.lolesports.com/teams/close-test.png',light:'https://static.lolesports.com/teams/close-test.png'}}};
 const job=store.hydrateTeams(teams);await store.close();await job;const manifest=JSON.parse(await readFile(join(dir,'team-logos.json'),'utf8'));assert.ok(manifest.teams['valorant:shutdown-test'].dark.startsWith('/assets/team-logo-'));
});
