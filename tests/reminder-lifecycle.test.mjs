import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createECDH} from 'node:crypto';
import {createReminderService} from '../server/reminders.mjs';
test('Closing a reminder service drains an active push and persists its deduplication record',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'matchpoint-reminder-close-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let release,entered;const sending=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;}),clock=Date.parse('2026-10-04T12:00:00Z'),key=createECDH('prime256v1');key.generateKeys();
 const service=createReminderService({directory,now:()=>clock,readFeed:async()=>({source:{retrievedAt:new Date(clock).toISOString()},matches:[{id:'cs2:real',game:'cs2',startsAt:new Date(clock+600000).toISOString(),status:'upcoming',teams:[]}]}),send:async()=>{entered();await wait;}});
 await service.upsert(randomBytes(32).toString('hex'),{subscription:{endpoint:'https://web.push.apple.com/closing',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},minutes:15,matchIds:['cs2:real']});
 const tick=service.tick();await sending;let closed=false;const close=service.close().then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);release();await tick;await close;
 const state=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));assert.equal(Object.keys(Object.values(state.devices)[0].sent).length,1);assert.equal(closed,true);
});
