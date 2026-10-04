import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
async function setup(){
 const {createReminderController}=await import('../src/reminders.js');
 const storage=new Map(),calls=[],state={follows:new Set(['valorant:official']),reminders:{enabled:false,minutes:15,calendar:false}},sub={toJSON:()=>({endpoint:'https://web.push.apple.com/client',keys:{p256dh:'key',auth:'auth'}}),unsubscribe:async()=>true};
 let permission='default',requestCount=0,liveSubscription=null;
 const registration={pushManager:{getSubscription:async()=>liveSubscription,subscribe:async()=>{liveSubscription=sub;return sub;}}};
 const env={isSecureContext:true,crypto:webcrypto,PushManager:function(){},Notification:{get permission(){return permission;},requestPermission:()=>{requestCount++;permission='granted';return Promise.resolve(permission);}},navigator:{userAgent:'test',serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},matchMedia:()=>({matches:false}),localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
 let fail=false;const fetcher=async(url,options)=>{calls.push({url,options});if(fail)throw new Error('offline');return new Response(JSON.stringify(url.endsWith('/config')?{publicKey:Buffer.alloc(65).toString('base64url')}:{subscribed:true,delivered:true}),{status:200});};
 const save=()=>{storage.set('matchpoint:preferences:v2',JSON.stringify({follows:[...state.follows],reminders:state.reminders}));return true;};
 const controller=createReminderController({state,save,env,fetcher});
 return {controller,state,env,calls,save,getRequestCount:()=>requestCount,setFail:value=>{fail=value;}};
}
test('Preparing notifications never requests permission; explicit enable requests immediately and syncs official IDs',async()=>{
 const {controller,state,calls,save,getRequestCount}=await setup();await controller.prepare();assert.equal(getRequestCount(),0);assert.equal(state.reminders.calendar,false);
 const work=controller.enable();assert.equal(getRequestCount(),1);await work;assert.equal(state.reminders.enabled,true);
 const update=calls.find(c=>c.options?.method==='PUT'),body=JSON.parse(update.options.body);assert.deepEqual(body.matchIds,['valorant:official']);assert.equal(body.minutes,15);assert.equal(body.startsAt,undefined);
 state.follows.clear();save();await controller.sync();assert.deepEqual(JSON.parse(calls.at(-1).options.body).matchIds,[]);
});
test('Failed registration does not mark reminders enabled and stopping deletes the server subscription',async()=>{
 const {controller,state,setFail,calls}=await setup();await controller.prepare();setFail(true);await assert.rejects(controller.enable());assert.equal(state.reminders.enabled,false);
 setFail(false);await controller.enable();await controller.disable();assert.equal(state.reminders.enabled,false);assert.ok(calls.some(c=>c.options?.method==='DELETE'));
});
test('Unsupported and non-installed iOS displays instructions without requesting permission',async()=>{
 const {controller,env,getRequestCount}=await setup();env.navigator.userAgent='iPhone';assert.match(controller.support().reason,/主屏幕/);await assert.rejects(controller.enable(),/主屏幕/);assert.equal(getRequestCount(),0);
 env.navigator.userAgent='test';env.isSecureContext=false;assert.match(controller.support().reason,/HTTPS/);
});
test('Reconnected cancellation clears the synchronization error',async()=>{
 const {controller,state,setFail}=await setup();await controller.enable();setFail(true);await assert.rejects(controller.disable());assert.equal(state.reminders.pendingRemoval,true);assert.ok(state.reminders.syncError);
 setFail(false);await controller.sync();assert.equal(state.reminders.pendingRemoval,false);assert.equal(state.reminders.syncError,'');
});
test('Synchronizing reconciles current persisted preferences rather than uploading a stale tab state',async()=>{
 const {controller,state,env,calls}=await setup();await controller.enable();
 env.localStorage.setItem('matchpoint:preferences:v2',JSON.stringify({follows:[],reminders:{enabled:true,minutes:30,calendar:false}}));
 await controller.sync();const upload=JSON.parse(calls.at(-1).options.body);assert.deepEqual(upload.matchIds,[]);assert.equal(upload.minutes,30);assert.equal(state.follows.size,0);
});
test('Failed subscription rollback completes while its device lock is still held',async()=>{
 const {createReminderController}=await import('../src/reminders.js'),{state,env}=await setup();let locked=false,rollbackLocked=false;
 env.navigator.locks={request:async(name,work)=>{locked=true;try{return await work();}finally{locked=false;}}};
 const sub={toJSON:()=>({endpoint:'https://web.push.apple.com/rollback',keys:{}}),unsubscribe:async()=>{rollbackLocked=locked;}};
 const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>sub}};
 env.navigator.serviceWorker={register:async()=>registration,ready:Promise.resolve(registration)};
 const controller=createReminderController({state,env,save:()=>true,fetcher:async(url)=>url.endsWith('/config')?new Response(JSON.stringify({publicKey:Buffer.alloc(65).toString('base64url')})):new Response(JSON.stringify({error:'temporary'}),{status:503})});
 await assert.rejects(controller.enable(),/temporary/);assert.equal(rollbackLocked,true);
});
test('Granted phone permission updates the button before a delayed subscription completes',async()=>{
 const {createReminderController,reminderSettingsView}=await import('../src/reminders.js'),{state,env,save}=await setup();
 let started,release;const putStarted=new Promise(r=>{started=r;}),pending=new Promise(r=>{release=r;}),renders=[];
 const controller=createReminderController({state,env,save,onChange:()=>renders.push(reminderSettingsView(state,controller.support())),fetcher:async(url,options)=>{
  if(options.method==='PUT'){started();await pending;}
  return new Response(JSON.stringify(url.endsWith('/config')?{publicKey:Buffer.alloc(65).toString('base64url')}:{subscribed:true}));
 }});
 const work=controller.enable();await putStarted;
 const connecting=reminderSettingsView(state,controller.support());assert.match(connecting,/已授权[\s\S]*连接/);assert.equal(state.reminders.enabled,false);
 assert.ok(renders.some(html=>/已授权[\s\S]*连接/.test(html)));
 release();await work;
 const enabled=reminderSettingsView(state,controller.support());assert.match(enabled,/已开启 · 关闭提醒/);assert.match(enabled,/reminder-disable/);assert.equal(state.reminders.enabled,true);
});
test('Granted permission with failed synchronization shows a retry button and does not claim enabled',async()=>{
 const {reminderSettingsView}=await import('../src/reminders.js'),{controller,state,setFail,getRequestCount}=await setup();
 setFail(true);await assert.rejects(controller.enable());assert.equal(getRequestCount(),1);
 const html=reminderSettingsView(state,controller.support());assert.match(html,/已授权 · 重试开启/);assert.match(html,/提醒未连接/);assert.equal(state.reminders.enabled,false);
 setFail(false);await controller.enable();assert.equal(getRequestCount(),1);assert.equal(state.reminders.enabled,true);
 await controller.disable();const stopped=reminderSettingsView(state,controller.support());assert.match(stopped,/已授权 · 开启提醒/);assert.equal(state.reminders.enabled,false);
});
test('Failed cancellation offers retrying shutdown rather than enabling reminders again',async()=>{
 const {reminderSettingsView}=await import('../src/reminders.js'),{controller,state,setFail,getRequestCount}=await setup();
 await controller.enable();setFail(true);await assert.rejects(controller.disable());
 const pending=reminderSettingsView(state,controller.support());assert.match(pending,/本机通知已停止，取消待同步/);assert.match(pending,/已停止 · 重试关闭/);assert.match(pending,/data-action="reminder-disable"/);assert.doesNotMatch(pending,/data-action="reminder-enable"|连接失败/);
 setFail(false);await controller.disable();assert.equal(state.reminders.enabled,false);assert.equal(state.reminders.pendingRemoval,false);assert.equal(getRequestCount(),1);
 assert.match(reminderSettingsView(state,controller.support()),/已授权 · 开启提醒/);
});
