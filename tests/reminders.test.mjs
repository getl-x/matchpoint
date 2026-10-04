import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createECDH} from 'node:crypto';
const token=randomBytes(32).toString('hex');
const endpoint='https://web.push.apple.com/Q-test';
function subscription(suffix=''){const key=createECDH('prime256v1');key.generateKeys();return {endpoint:endpoint+suffix,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'matchpoint-reminders-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const {createReminderService}=await import('../server/reminders.mjs');
 let clock=Date.parse('2026-10-04T12:00:00Z'),feed={game:'valorant',source:{retrievedAt:new Date(clock).toISOString()},teams:{a:{short:'EDG'},b:{short:'PRX'}},events:[{id:'event',name:'冠军赛'}],matches:[{id:'valorant:match',eventId:'event',game:'valorant',teams:['a','b'],startsAt:new Date(clock+15*60000).toISOString(),status:'upcoming'}]};
 const sent=[],options={directory,now:()=>clock,readFeed:async()=>feed,send:async(s,p)=>{sent.push(p);}};
 const service=createReminderService(options);await service.upsert(token,{subscription:subscription(),matchIds:['valorant:match'],minutes:15});t.after(()=>service.close());
 return {service,sent,feed,directory,options,setClock:v=>{clock=v;},getClock:()=>clock,createReminderService};
}
test('Official upcoming match sends at selected threshold and does not repeat after restart',async t=>{
 const {service,sent,directory,options,createReminderService}=await setup(t);await service.tick();await service.tick();assert.equal(sent.length,1);assert.match(sent[0].body,/EDG.*PRX/);await service.close();
 const second=createReminderService(options);await second.tick();assert.equal(sent.length,1);assert.equal((await second.config()).publicKey,(await service.config()).publicKey);await second.close();
 assert.ok((await readFile(join(directory,'state.json'),'utf8')).includes('valorant:match'));
});
test('Changed official start time creates a new threshold; finished, stale and started matches never send',async t=>{
 const {service,sent,feed,setClock,getClock}=await setup(t);
 feed.matches[0].startsAt=new Date(getClock()+60*60000).toISOString();await service.tick();assert.equal(sent.length,0);
 setClock(getClock()+45*60000);feed.source.retrievedAt=new Date(getClock()).toISOString();await service.tick();assert.equal(sent.length,1);
 feed.matches[0].startsAt=new Date(getClock()+15*60000).toISOString();feed.matches[0].status='finished';await service.tick();assert.equal(sent.length,1);
 feed.matches[0].status='upcoming';feed.stale=true;await service.tick();assert.equal(sent.length,1);
 feed.stale=false;feed.matches[0].startsAt=new Date(getClock()-1000).toISOString();await service.tick();assert.equal(sent.length,1);
});
test('Unfollowing and deleting a device prevent later reminders without affecting another device',async t=>{
 const {service,sent}=await setup(t),other=randomBytes(32).toString('hex');
 await service.upsert(other,{subscription:subscription('-other'),matchIds:['valorant:match'],minutes:15});
 await service.upsert(token,{subscription:subscription(),matchIds:[],minutes:15});await service.tick();assert.equal(sent.length,1);
 await service.remove(other);await service.tick();assert.equal(sent.length,1);
});
test('Temporary push errors retry before kickoff and expired subscription is removed',async t=>{
 const {service,options,createReminderService,sent}=await setup(t);await service.close();let attempts=0;
 const second=createReminderService({...options,send:async()=>{attempts++;if(attempts===1)throw Object.assign(new Error('network'),{statusCode:503});sent.push('ok');}});
 await second.tick();await second.tick();assert.equal(sent.length,1);await second.close();
 const third=createReminderService({...options,send:async()=>{throw Object.assign(new Error('expired'),{statusCode:410});}});
 await third.test(token);assert.equal((await third.status(token)).subscribed,false);await third.close();
});
test('Rejects SSRF endpoints, invalid device credentials, invalid keys and out-of-range minutes',async t=>{
 const {service}=await setup(t);
 for(const url of ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.test/x','https://user@web.push.apple.com/x','https://web.push.apple.com:444/x']){
  await assert.rejects(service.upsert(token,{subscription:{...subscription(),endpoint:url},matchIds:[],minutes:15}),/推送/);
 }
 await assert.rejects(service.upsert('bad',{subscription:subscription(),matchIds:[],minutes:15}),/凭证/);
 for(const minutes of [0,1441,1.2])await assert.rejects(service.upsert(token,{subscription:subscription(),matchIds:[],minutes}),/分钟/);
 await assert.rejects(service.upsert(token,{subscription:{...subscription(),keys:{p256dh:'bad',auth:'bad'}},matchIds:[],minutes:15}),/密钥/);
 await assert.rejects(service.upsert(token,{subscription:subscription(),matchIds:['other:fake'],minutes:15}),/比赛/);
});
test('One slow push does not block other subscribed devices',async t=>{
 const {service,options,createReminderService}=await setup(t);await service.close();
 let release,entered,healthy=false;const pending=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const next=createReminderService({...options,send:async subscription=>{if(subscription.endpoint===endpoint){entered();await pending;}else healthy=true;}});
 await next.upsert(randomBytes(32).toString('hex'),{subscription:subscription('-healthy'),matchIds:['valorant:match'],minutes:15});
 const work=next.tick();await started;await new Promise(r=>setImmediate(r));assert.equal(healthy,true);release();await work;await next.close();
});
test('An in-flight notification cannot mark a newly replaced browser subscription as sent',async t=>{
 const {service,options,createReminderService,sent}=await setup(t);await service.close();
 let release,entered;const pending=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const next=createReminderService({...options,send:async subscription=>{if(subscription.endpoint===endpoint){entered();await pending;}sent.push(subscription.endpoint);}});
 const work=next.tick();await started;await next.remove(token);
 await next.upsert(token,{subscription:subscription('-replacement'),matchIds:['valorant:match'],minutes:15});release();await work;await next.tick();
 assert.ok(sent.includes(endpoint+'-replacement'));await next.close();
});
test('An obsolete unsubscribe request cannot delete the current replacement endpoint',async t=>{
 const {service}=await setup(t);await service.upsert(token,{subscription:subscription('-new'),matchIds:[],minutes:15});
 await service.remove(token,endpoint);assert.equal((await service.status(token)).subscribed,true);
 await service.remove(token,endpoint+'-new');assert.equal((await service.status(token)).subscribed,false);
});
test('An unavailable push provider cannot occupy another provider delivery queue',async t=>{
 const {service,options,createReminderService,setClock,getClock,feed}=await setup(t);await service.close();let healthy=false,release;const pending=new Promise(r=>{release=r;});
 const next=createReminderService({...options,send:async sub=>{if(sub.endpoint.includes('fcm.googleapis.com'))await pending;else healthy=true;}});
 await next.remove(token);
 for(let i=0;i<9;i++)await next.upsert(randomBytes(32).toString('hex'),{subscription:{...subscription(),endpoint:'https://fcm.googleapis.com/send/'+i},matchIds:['valorant:match'],minutes:1});
 await next.upsert(token,{subscription:subscription('-apple-last'),matchIds:['valorant:match'],minutes:1});
 setClock(getClock()+14*60000);feed.source.retrievedAt=new Date(getClock()).toISOString();
 const work=next.tick();await new Promise(r=>setTimeout(r,20));
 assert.equal(healthy,true);release();await work;await next.close();
});
