import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {loadConfig,initializeStorage} from '../server/config.mjs';
import {createAppServer} from '../server.mjs';

async function setup(t){
 const parent=resolve(tmpdir()),directory=await mkdtemp(join(parent,'matchpoint-deploy-'));
 t.after(async()=>{assert.ok(directory.startsWith(join(parent,'matchpoint-deploy-')));await rm(directory,{recursive:true,force:true});});
 const config=loadConfig({MATCHPOINT_DATA_DIR:join(directory,'nested','data'),MATCHPOINT_ARCHIVE_SYNC:'false'});await initializeStorage(config);return config;
}
async function serve(t,config,overrides={}){
 const app=createAppServer({config,...overrides});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));return 'http://127.0.0.1:'+app.address().port;
}
test('Runtime validates ports and booleans, and isolates writable generated files from shipped assets',()=>{
 const config=loadConfig({MATCHPOINT_DATA_DIR:'/tmp/example',PORT:'8080',HOST:'0.0.0.0',MATCHPOINT_ARCHIVE_SYNC:'false'});
 assert.equal(config.port,8080);assert.equal(config.archiveSync,false);assert.equal(config.logoDirectory,join(config.dataDirectory,'logos'));assert.equal(config.archiveDirectory,join(config.dataDirectory,'archive'));
 for(const port of ['0','65536','4177x','-1','1.5'])assert.throws(()=>loadConfig({PORT:port}),/PORT/);
 assert.throws(()=>loadConfig({MATCHPOINT_ARCHIVE_SYNC:'nope'}),/MATCHPOINT_ARCHIVE_SYNC/);
});
test('Startup rejects unusable nested directories used by archive and snapshot writers',async t=>{
 const config=await setup(t);
 for(const path of [join(config.archiveDirectory,'events'),join(config.dataDirectory,'feeds')]){
  await rm(path,{recursive:true,force:true});await writeFile(path,'not a directory');
  await assert.rejects(initializeStorage(config));
  await rm(path);await initializeStorage(config);
 }
});
test('Fresh persistent volumes serve health, PWA assets and an empty logo index without official networking',async t=>{
 const config=await setup(t),base=await serve(t,config,{readFeed:()=>{throw new Error('No official network in health');}});
 const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.equal(health.headers.get('cache-control'),'no-store');assert.equal((await health.json()).status,'ok');
 for(const route of ['/schedule','/archive','/bracket','/src/app.js','/manifest.webmanifest','/assets/icon-192.png'])assert.equal((await fetch(base+route)).status,200,route);
 assert.deepEqual(await (await fetch(base+'/assets/team-logos.json')).json(),{version:1,teams:{},updatedAt:null});
 assert.equal((await fetch(base+'/api/feed?game=unsupported')).status,400);assert.equal((await fetch(base+'/api/archive/event?id=../private')).status,400);
});
test('Persisted logos are served from the data volume after a new server instance; storage files are private',async t=>{
 const config=await setup(t),name='team-logo-aabb.png',bytes=await readFile(new URL('../assets/icon-192.png',import.meta.url));await writeFile(join(config.logoDirectory,name),bytes);await writeFile(join(config.logoDirectory,'team-logos.json'),JSON.stringify({version:1,teams:{},updatedAt:'real-stored-time'}));
 for(let i=0;i<2;i++){const base=await serve(t,config),logo=await fetch(base+'/assets/'+name);assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await logo.arrayBuffer()),bytes);assert.equal((await (await fetch(base+'/assets/team-logos.json')).json()).updatedAt,'real-stored-time');}
 const base=await serve(t,config);for(const path of ['/data/archive/index.json','/.env','/docs/SOURCES.md','/server/config.mjs','/assets/team-logo-nope.png'])assert.equal((await fetch(base+path)).status,404,path);
 const head=await fetch(base+'/assets/'+name,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(base+'/styles.css',{method:'POST'})).status,405);
});
test('Public archive sync is POST-only and globally throttled while preserving the read-only API',async t=>{
 const config=await setup(t);let calls=0,clock=100000;
 const history={list:async()=>({records:[]}),synchronize:async()=>{calls++;},readEvent:async()=>{throw new Error('unknown');}};
 const base=await serve(t,config,{history,now:()=>clock});assert.equal((await fetch(base+'/api/archive/sync')).status,405);
 assert.equal((await fetch(base+'/api/archive/sync',{method:'POST'})).status,200);assert.equal(calls,1);
 const limited=await fetch(base+'/api/archive/sync',{method:'POST'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);assert.equal(calls,1);
 clock+=61000;assert.equal((await fetch(base+'/api/archive/sync',{method:'POST'})).status,200);assert.equal(calls,2);
 assert.equal((await fetch(base+'/api/feed?game=valorant',{method:'POST'})).status,405);
});
test('Encoded traversal cannot expose server source, storage or files outside public asset directories',async t=>{
 const config=await setup(t),base=await serve(t,config);
 for(const path of ['/src/..%2fserver/config.mjs','/src/..%2fdata/archive/index.json','/src/%2e%2e%2fpackage.json','/src/sub/..%2fapp.js','/assets/..%2fserver.mjs','/src/..%5cserver/config.mjs']){
  const response=await fetch(base+path);assert.equal(response.status,404,path);
 }
 assert.equal((await fetch(base+'/src/views/schedule.js')).status,200);
});
