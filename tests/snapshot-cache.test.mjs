import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createSnapshotCache} from '../server/snapshot-cache.mjs';
async function folder(t){const root=resolve(tmpdir()),dir=await mkdtemp(join(root,'matchpoint-snapshot-'));t.after(async()=>{assert.ok(dir.startsWith(join(root,'matchpoint-snapshot-')));await rm(dir,{recursive:true,force:true});});return dir;}
const value=()=>({game:'valorant',source:{retrievedAt:'2026-10-04T00:00:00.000Z'},matches:[{id:'official-id',score:[2,1]}],teams:{},events:[]});
test('A restarted server can return its real persistent snapshot when the official source is unavailable',async t=>{
 const directory=await folder(t),first=createSnapshotCache({directory}),raw=value();await first.read('feed:valorant',async()=>raw);
 const restarted=createSnapshotCache({directory});const result=await restarted.read('feed:valorant',async()=>{throw new Error('offline');});assert.equal(result.stale,true);assert.equal(result.source.retrievedAt,raw.source.retrievedAt);assert.deepEqual(result.matches,raw.matches);
});
test('Snapshot recovery coalesces refreshes, saves official corrections and does not fabricate an empty source',async t=>{
 const directory=await folder(t),store=createSnapshotCache({directory});let calls=0;
 const load=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return value();};await Promise.all([store.read('feed:lol',load),store.read('feed:lol',load)]);assert.equal(calls,1);
 const restarted=createSnapshotCache({directory});const corrected=await restarted.read('feed:lol',async()=>({...value(),matches:[{id:'official-id',score:[2,0]}]}));assert.equal(corrected.stale,false);assert.deepEqual(corrected.matches[0].score,[2,0]);
 await assert.rejects(store.read('feed:cs2',async()=>{throw new Error('No source');}),/官方来源/);
});
test('Corrupt stored JSON is ignored and never executed or returned as official data',async t=>{
 const directory=await folder(t);await createSnapshotCache({directory}).read('feed:apex',async()=>value());const [name]=await readdir(directory);await writeFile(join(directory,name),'globalThis.privateValue=1');const store=createSnapshotCache({directory});await assert.rejects(store.read('feed:apex',async()=>{throw new Error('offline');}),/官方来源/);assert.equal(globalThis.privateValue,undefined);
});
