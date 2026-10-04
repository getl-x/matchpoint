import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createLogoCache} from '../server/team-logos.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function folder(t){const root=resolve(tmpdir()),dir=await mkdtemp(join(root,'matchpoint-logo-test-'));t.after(async()=>{assert.ok(dir.startsWith(join(root,'matchpoint-logo-test-')));await rm(dir,{recursive:true,force:true});});return dir;}
const feed=()=>({game:'valorant',matches:[{id:'real-match',score:[2,1]}],teams:{'valorant:logo':{id:'valorant:logo',name:'Team',short:'TM',logos:{dark:'https://static.lolesports.com/teams/team.png',light:'https://static.lolesports.com/teams/team.png'}}}});
test('Concurrent repeated official assets download once, persist, and do not change scores or raw team metadata',async t=>{
 const directory=await folder(t);let requests=0;const store=createLogoCache({directory,resolveMetadata:async()=>null,fetcher:async()=>{requests++;await new Promise(r=>setTimeout(r,10));return new Response(png,{headers:{'content-type':'image/png'}});}}),raw=feed(),before=JSON.stringify(raw);
 await Promise.all([store.hydrateTeams(raw.teams),store.hydrateTeams(raw.teams)]);const result=await store.decorateFeed(raw);assert.equal(requests,1);assert.ok(result.teams['valorant:logo'].logos.dark.startsWith('/assets/team-logo-'));assert.equal(result.teams['valorant:logo'].logos.dark,result.teams['valorant:logo'].logos.light);assert.equal(JSON.stringify(raw),before);assert.deepEqual(result.matches,raw.matches);
 const saved=JSON.parse(await readFile(join(directory,'team-logos.json'),'utf8'));assert.equal(saved.teams['valorant:logo'].sources.dark,raw.teams['valorant:logo'].logos.dark);
 const restarted=createLogoCache({directory,fetcher:async()=>{throw new Error('Must remain cached');}});await restarted.hydrateTeams(raw.teams);assert.equal((await restarted.decorateFeed(raw)).teams['valorant:logo'].logos.dark,result.teams['valorant:logo'].logos.dark);
});
test('Failed or non-image responses leave initials available, retain prior valid logos and never fail a feed',async t=>{
 const directory=await folder(t);let fail=false;const store=createLogoCache({directory,resolveMetadata:async()=>null,fetcher:async()=>fail?new Response('<html>blocked</html>',{headers:{'content-type':'text/html'}}):new Response(png,{headers:{'content-type':'image/png'}})}),raw=feed();await store.hydrateTeams(raw.teams);const previous=(await store.decorateFeed(raw)).teams['valorant:logo'].logos.dark;
 fail=true;raw.teams['valorant:logo'].logos={dark:'https://static.lolesports.com/teams/new.png'};await store.hydrateTeams(raw.teams);assert.equal((await store.decorateFeed(raw)).teams['valorant:logo'].logos.dark,previous);
 const noSource={teams:{'valorant:missing':{id:'valorant:missing',name:'Missing'}}};assert.deepEqual((await store.decorateFeed(noSource)).teams,noSource.teams);
});
test('Asset requests reject unapproved sources before making a network request',async t=>{
 const directory=await folder(t);let requests=0;const store=createLogoCache({directory,resolveMetadata:async()=>null,fetcher:async()=>{requests++;return new Response(png);}});
 await store.hydrateTeams({'valorant:unknown':{id:'valorant:unknown',name:'Unknown',logos:{dark:'http://localhost/private'}}});assert.equal(requests,0);
});
