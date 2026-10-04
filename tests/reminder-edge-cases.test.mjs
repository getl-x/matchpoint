import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createECDH} from 'node:crypto';
import {createReminderService} from '../server/reminders.mjs';
function subscription(suffix=''){
 const key=createECDH('prime256v1');key.generateKeys();
 return {endpoint:'https://web.push.apple.com/edge'+suffix,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
}
async function setup(t,overrides={}){
 const directory=await mkdtemp(join(tmpdir(),'matchpoint-reminder-edge-')),token=randomBytes(32).toString('hex');
 assert.ok(directory.startsWith(join(tmpdir(),'matchpoint-reminder-edge-')));
 let clock=Date.parse('2026-10-04T12:00:00Z');
 const feed={game:'valorant',source:{retrievedAt:new Date(clock).toISOString()},matches:[{id:'valorant:official',game:'valorant',teams:[],status:'upcoming',startsAt:new Date(clock+20000).toISOString()}]};
 const options={directory,now:()=>clock,readFeed:async()=>feed,...overrides},service=createReminderService(options),sub=subscription();
 await service.upsert(token,{subscription:sub,minutes:15,matchIds:['valorant:official']});
 t.after(async()=>{await service.close();await rm(directory,{recursive:true,force:true});});
 return {directory,token,feed,options,service,sub,setClock:value=>{clock=value;},clock};
}
test('Expired subscription is removed even if settings change during its in-flight push',async t=>{
 let release,entered;const started=new Promise(r=>{entered=r;}),pending=new Promise(r=>{release=r;});
 const {service,token,sub}=await setup(t,{send:async()=>{entered();await pending;throw Object.assign(new Error('expired'),{statusCode:410});}});
 const sending=service.test(token);await started;
 await service.upsert(token,{subscription:sub,minutes:30,matchIds:[]});release();
 assert.deepEqual(await sending,{delivered:false,subscribed:false});
 assert.equal((await service.status(token)).subscribed,false);
});
test('Expired old subscription cannot remove a genuinely replaced endpoint or encryption keys',async t=>{
 let release,entered;const started=new Promise(r=>{entered=r;}),pending=new Promise(r=>{release=r;});
 const {service,token,sub}=await setup(t,{send:async()=>{entered();await pending;throw Object.assign(new Error('expired'),{statusCode:410});}});
 const sending=service.test(token);await started;
 await service.upsert(token,{subscription:{...subscription(),endpoint:sub.endpoint},minutes:30,matchIds:[]});release();
 assert.deepEqual(await sending,{delivered:false,subscribed:true});
});
test('A healthy game reminder is delivered before another game schedule read finishes',async t=>{
 let release,entered,delivered;const slowStarted=new Promise(r=>{entered=r;}),pending=new Promise(r=>{release=r;}),sent=new Promise(r=>{delivered=r;});
 let feed;
 const {service,token,setClock,clock,feed:official}=await setup(t,{readFeed:async game=>{if(game==='cs2'){entered();await pending;return {source:feed.source,matches:[]};}return feed;},send:async()=>{delivered();}});
 feed=official;
 await service.upsert(randomBytes(32).toString('hex'),{subscription:subscription('-cs'),minutes:15,matchIds:['cs2:official']});
 const ticking=service.tick();await slowStarted;
 const healthy=await Promise.race([sent.then(()=>true),new Promise(r=>setImmediate(()=>r(false)))]);
 setClock(clock+21000);release();await ticking;
 assert.equal(healthy,true,'Healthy reminder waited for unrelated slow feed until after kickoff');
 assert.equal((await service.status(token)).subscribed,true);
});
test('Stalled schedule reads time out and shutdown does not wait on an unresolved source',async t=>{
 let release;const {service}=await setup(t,{feedTimeoutMs:20,readFeed:()=>new Promise(r=>{release=r;}),send:async()=>{}});
 const first=service.tick();
 const completed=await Promise.race([first.then(()=>true),new Promise(r=>setTimeout(()=>r(false),200))]);
 if(!completed){release({matches:[]});await first;}
 assert.equal(completed,true,'Schedule read held the tick indefinitely');
 const ticking=service.tick();
 await new Promise(r=>setImmediate(r));await service.close();await ticking;
});
test('Failed deduplication persistence is retried after recovery without resending',async t=>{
 let sends=0;const {service,directory,options}=await setup(t,{send:async()=>{sends++;}});
 const blocker=join(directory,'state.json.tmp');await mkdir(blocker);
 await assert.rejects(service.tick());
 await rm(blocker,{recursive:true});
 await service.tick();await service.close();
 const saved=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
 assert.equal(Object.keys(Object.values(saved.devices)[0].sent).length,1);
 const restarted=createReminderService(options);await restarted.tick();await restarted.close();
 assert.equal(sends,1);
});
test('Shutdown repairs an outstanding deduplication write after disk recovery',async t=>{
 const {service,directory}=await setup(t,{send:async()=>{}});
 const blocker=join(directory,'state.json.tmp');await mkdir(blocker);
 await assert.rejects(service.tick());await rm(blocker,{recursive:true});await service.close();
 const saved=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
 assert.equal(Object.keys(Object.values(saved.devices)[0].sent).length,1);
});
test('Saving unchanged settings cannot silently discard a queued reminder',async t=>{
 let release,entered,count=0;const started=new Promise(r=>{entered=r;}),pending=new Promise(r=>{release=r;}),sent=[];
 const {service}=await setup(t,{send:async sub=>{sent.push(sub.endpoint);if(++count===8)entered();await pending;}});
 for(let i=0;i<7;i++)await service.upsert(randomBytes(32).toString('hex'),{subscription:subscription('-wait'+i),matchIds:['valorant:official'],minutes:15});
 const token=randomBytes(32).toString('hex'),sub=subscription('-queued');
 await service.upsert(token,{subscription:sub,matchIds:['valorant:official'],minutes:15});
 const ticking=service.tick();await started;
 await service.upsert(token,{subscription:sub,matchIds:['valorant:official'],minutes:15});release();await ticking;
 assert.ok(sent.includes(sub.endpoint));
});
test('Delivery concurrency stays bounded across feeds using the same push provider',async t=>{
 let release,entered,running=0,maximum=0,count=0,feed;const started=new Promise(r=>{entered=r;}),pending=new Promise(r=>{release=r;});
 const {service,feed:official}=await setup(t,{readFeed:async game=>({...feed,game,matches:feed.matches.map(m=>({...m,id:game+':official',game}))}),send:async()=>{running++;maximum=Math.max(maximum,running);if(++count===8)entered();await pending;running--;}});
 feed=official;
 for(let i=0;i<16;i++)await service.upsert(randomBytes(32).toString('hex'),{subscription:subscription('-pool'+i),matchIds:[(i%2?'cs2':'valorant')+':official'],minutes:15});
 const ticking=service.tick();await started;await new Promise(r=>setImmediate(r));release();await ticking;
 assert.ok(maximum<=8);assert.equal(count,17);
});
test('A later game feed is delivered when the shared provider workers retire in the same microtask turn',async t=>{
 let releaseFeed,rejectSends,entered,csFeed,count=0,healthy=0;
 const delayedFeed=new Promise(r=>{releaseFeed=r;}),blockedSends=new Promise((_,reject)=>{rejectSends=reject;}),started=new Promise(r=>{entered=r;});
 const {service,token,sub,feed}=await setup(t,{readFeed:game=>game==='cs2'?csFeed:delayedFeed,send:(_sub,payload)=>{
  if(payload.url.includes('cs2%3A')){if(++count===8)entered();return blockedSends;}healthy++;return Promise.resolve();
 }});
 csFeed={...feed,game:'cs2',matches:Array.from({length:8},(_,i)=>({...feed.matches[0],id:'cs2:m'+i,game:'cs2'}))};
 await service.upsert(token,{subscription:sub,matchIds:[...csFeed.matches.map(m=>m.id),feed.matches[0].id],minutes:15});
 const ticking=service.tick();await started;
 releaseFeed(feed);await Promise.resolve();rejectSends(Object.assign(new Error('temporary'),{statusCode:503}));await ticking;
 assert.equal(healthy,1);
});
