import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:4177';
const request=path=>fetch(base+path,{signal:AbortSignal.timeout(10000)});
let ready=false;for(let attempt=0;attempt<30;attempt++){try{if((await request('/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
assert.ok(ready,'server did not become healthy');
const health=await (await request('/healthz')).json();assert.equal(health.status,'ok');assert.equal(typeof health.version,'string');
for(const path of ['/','/schedule','/bracket','/archive','/following','/styles.css','/src/app.js','/src/reminders.js','/src/calendar.js','/sw.js','/assets/icon-192.png','/assets/icon-512.png'])assert.equal((await request(path)).status,200,path);
const manifest=await (await request('/manifest.webmanifest')).json();for(const icon of manifest.icons)assert.equal((await request(icon.src)).status,200,icon.src);
const logos=await (await request('/assets/team-logos.json')).json();assert.equal(logos.version,1);assert.equal(typeof logos.teams,'object');
const push=await (await request('/api/reminders/config')).json();assert.equal(typeof push.publicKey,'string');assert.equal(push.privateKey,undefined);assert.equal(push.maxMinutes,1440);
for(const path of ['/data/archive/index.json','/data/reminders/keys.json','/data/reminders/state.json','/.env','/server/config.mjs','/docs/SOURCES.md','/assets/missing.js'])assert.equal((await request(path)).status,404,path);
assert.equal((await request('/api/feed?game=unsupported')).status,400);assert.equal((await request('/api/archive/sync')).status,405);
assert.equal((await request('/api/archive')).status,200);
assert.equal((await fetch(base+'/styles.css',{method:'POST'})).status,405);
console.log('PASS production smoke: health '+health.version+', all app routes, PWA assets, persistent logo index, archive storage and API validation');
