import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig,initializeStorage} from '../server/config.mjs';
import {createAppServer} from '../server.mjs';

async function setup(t){
 const root=await mkdtemp(join(tmpdir(),'matchpoint-version-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of ['index.html','styles.css','sw.js','manifest.webmanifest','package.json','src','assets'])await cp(new URL('../'+name,import.meta.url),join(root,name),{recursive:true});
 const config={...loadConfig({MATCHPOINT_DATA_DIR:join(root,'data'),MATCHPOINT_ARCHIVE_SYNC:'false'}),root};await initializeStorage(config);return config;
}
async function serve(t,config){
 const app=createAppServer({config,readFeed:()=>{throw new Error('Version checks must not read official sources');}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));
 return 'http://127.0.0.1:'+app.address().port;
}
test('Loaded HTML identifies its exact frontend build and the update API cannot be cached',async t=>{
 const config=await setup(t),base=await serve(t,config),response=await fetch(base+'/api/app-version');
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const version=await response.json();assert.match(version.build,/^[a-f0-9]{64}$/);assert.match(version.version,/^\d+\.\d+\.\d+$/);
 for(const route of ['/schedule','/following','/index.html']){
  const html=await (await fetch(base+route)).text();assert.equal(/name="matchpoint-build" content="([^"]+)"/.exec(html)?.[1],version.build);
 }
 assert.equal((await fetch(base+'/api/app-version',{method:'POST'})).status,405);
});
test('Frontend changes produce a new build without a version bump; generated logos do not',async t=>{
 const config=await setup(t),readBuild=async()=>await (await fetch(await serve(t,config)+'/api/app-version')).json();
 const first=await readBuild();
 await writeFile(join(config.logoDirectory,'team-logos.json'),JSON.stringify({version:1,teams:{},updatedAt:'changed'}));
 await writeFile(join(config.root,'assets','team-logo-aabb.svg'),'<svg/>');
 await writeFile(join(config.root,'assets','team-logos.json.tmp'),JSON.stringify({version:1,teams:{},updatedAt:'writing'}));
 assert.deepEqual(await readBuild(),first);
 await appendFile(join(config.root,'src','views','schedule.js'),'\n// New schedule deployment\n');
 const second=await readBuild();assert.equal(second.version,first.version);assert.notEqual(second.build,first.build);
 await appendFile(join(config.root,'styles.css'),'\n/* New styles deployment */\n');
 assert.notEqual((await readBuild()).build,second.build);
});
