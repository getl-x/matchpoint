import webpush from 'web-push';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,ECDH} from 'node:crypto';
import {join} from 'node:path';
import {localizeEvent} from '../src/localization.js';

const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const games=['cs2','valorant','lol','apex'];
const sameSubscription=(a,b)=>a&&b&&a.endpoint===b.endpoint&&['p256dh','auth'].every(k=>a.keys[k]===b.keys[k]);
export function validateSubscription(subscription){
 let url;try{url=new URL(subscription?.endpoint);}catch{throw fail('推送地址无效');}
 const host=url.hostname,allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(host)||host.endsWith('.notify.windows.com')||host.endsWith('.push.apple.com');
 if(!allowed||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.href.length>2048)throw fail('不支持的推送地址');
 const keys=subscription?.keys;
 if(!keys||!['p256dh','auth'].every(k=>typeof keys[k]==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(keys[k])))throw fail('推送密钥无效');
 const publicKey=Buffer.from(keys.p256dh,'base64url'),auth=Buffer.from(keys.auth,'base64url');
 if(publicKey.length!==65||publicKey[0]!==4||auth.length!==16)throw fail('推送密钥无效');
 try{ECDH.convertKey(publicKey,'prime256v1');}catch{throw fail('推送密钥无效');}
 return {endpoint:url.href,keys:{p256dh:publicKey.toString('base64url'),auth:auth.toString('base64url')}};
}
function identity(token){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail('设备凭证无效',401);
 return createHash('sha256').update(token).digest('hex');
}
export function createReminderService({directory,readFeed,send,now=Date.now,subject='https://github.com/getl-x/matchpoint',feedTimeoutMs=45000}){
 let store,keys,loading,writes=Promise.resolve(),timer,active,closed=false,revision=0,savedRevision=0;
 const tests=new Map(),stopReads=new Set();
 async function atomic(name,payload){
  const target=join(directory,name),temp=target+'.tmp';
  await writeFile(temp,JSON.stringify(payload),{mode:0o600});await rename(temp,target);
 }
 function persist(){
  const snapshot=structuredClone(store),version=++revision;
  const work=writes.then(()=>atomic('state.json',snapshot)).then(()=>{savedRevision=version;});writes=work.catch(()=>{});return work;
 }
 function readSchedule(game){
  let timeout,stop;
  return new Promise((resolve,reject)=>{
   stop=()=>reject(new Error('提醒服务正在关闭'));stopReads.add(stop);
   if(closed){stop();return;}
   timeout=setTimeout(()=>reject(new Error('官方赛程读取超时')),feedTimeoutMs);
   Promise.resolve().then(()=>readFeed(game)).then(resolve,reject);
  }).finally(()=>{clearTimeout(timeout);stopReads.delete(stop);});
 }
 async function load(){
  if(loading)return loading;
  loading=(async()=>{
   await mkdir(directory,{recursive:true});
   try{keys=JSON.parse(await readFile(join(directory,'keys.json'),'utf8'));webpush.getVapidHeaders('https://web.push.apple.com',subject,keys.publicKey,keys.privateKey,'aes128gcm');}
   catch(error){if(error.code!=='ENOENT')throw error;keys=webpush.generateVAPIDKeys();webpush.getVapidHeaders('https://web.push.apple.com',subject,keys.publicKey,keys.privateKey,'aes128gcm');await atomic('keys.json',keys);}
   try{store=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));if(store.version!==1||!store.devices||typeof store.devices!=='object')throw new Error('提醒存储格式无效');}
   catch(error){if(error.code!=='ENOENT')throw error;store={version:1,devices:{}};await persist();}
  })();return loading;
 }
 async function transmit(device,payload,ttl){
  if(send)return send(device.subscription,payload);
  return webpush.sendNotification(device.subscription,JSON.stringify(payload),{vapidDetails:{subject,...keys},TTL:Math.max(1,Math.min(3600,ttl)),urgency:'high',timeout:10000});
 }
 async function deliver(id,device,payload,ttl){
  try{await transmit(device,payload,ttl);return true;}
  catch(error){
   if([404,410].includes(error.statusCode)){if(sameSubscription(store.devices[id]?.subscription,device.subscription)){delete store.devices[id];await persist();}return false;}
   // Never log capability URLs, encryption keys or push provider response bodies.
   console.warn('[Reminders] 推送暂时失败，稍后重试',Number(error.statusCode)||'network');return false;
  }
 }
 const service={
  async config(){await load();return {publicKey:keys.publicKey,minMinutes:1,maxMinutes:1440};},
  async status(token){const id=identity(token);await load();return {subscribed:!!store.devices[id]};},
  async upsert(token,input){
   const id=identity(token),subscription=validateSubscription(input?.subscription),minutes=input?.minutes;
   if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw fail('提前分钟数必须为 1～1440 的整数');
   if(!Array.isArray(input.matchIds)||input.matchIds.length>200||!input.matchIds.every(m=>typeof m==='string'&&/^(cs2|valorant|lol|apex):[A-Za-z0-9:_-]{1,180}$/.test(m)))throw fail('关注比赛无效，最多支持 200 场');
   await load();if(closed)throw fail('提醒服务正在关闭',503);
   if(!store.devices[id]&&Object.keys(store.devices).length>=1000)throw fail('提醒设备数量已满',503);
   if(Object.entries(store.devices).some(([key,d])=>key!==id&&d.subscription.endpoint===subscription.endpoint))throw fail('此设备已注册提醒，请保留原有设备设置',409);
   const previous=store.devices[id];
   store.devices[id]={subscription,minutes,matchIds:[...new Set(input.matchIds)],sent:previous?.sent||{},updatedAt:now()};
   await persist();return {subscribed:true};
  },
  async remove(token,endpoint){const id=identity(token);await load();if(endpoint&&store.devices[id]?.subscription.endpoint!==endpoint)return {subscribed:!!store.devices[id],obsolete:true};delete store.devices[id];await persist();return {subscribed:false};},
  async test(token){
   const id=identity(token);await load();const device=store.devices[id];if(!device)throw fail('请先开启提醒',404);
   if(now()<(tests.get(id)||0))throw fail('测试通知每分钟只能发送一次',429);tests.set(id,now()+60000);
   const delivered=await deliver(id,device,{title:'赛点 · 测试通知',body:'通知已连通。关注比赛后，将按你设置的提前时间提醒。',tag:'matchpoint-test',url:'/following',test:true},60);
   return {delivered,subscribed:!!store.devices[id]};
  },
  tick(){
   if(active)return active;if(closed)return Promise.resolve();
   active=(async()=>{
    await load();const expiry=now()-90*86400000;let dirty=false;
    for(const [id,d] of Object.entries(store.devices)){if(d.updatedAt<expiry){delete store.devices[id];dirty=true;}for(const [key,time] of Object.entries(d.sent)){if(time<now()-30*86400000){delete d.sent[key];dirty=true;}}}
    const required=games.filter(g=>Object.values(store.devices).some(d=>d.matchIds.some(id=>id.startsWith(g+':'))));
    const queues=new Map(),workers=[],errors=[];
    function enqueue(provider,task){
     if(!queues.has(provider))queues.set(provider,{pending:[],running:0});
     const queue=queues.get(provider);queue.pending.push(task);
     if(queue.running>=8)return;queue.running++;
     workers.push((async()=>{try{while(queue.pending.length){try{await queue.pending.shift()();}catch(error){errors.push(error);}}}finally{queue.running--;}})());
    }
    await Promise.allSettled(required.map(async game=>{
     const feed=await readSchedule(game);
     if(closed||feed.stale||!feed.source?.retrievedAt||now()-Date.parse(feed.source.retrievedAt)>5*60000||!Number.isFinite(Date.parse(feed.source.retrievedAt)))return;
     for(const match of feed.matches||[]){
      const start=Date.parse(match.startsAt);if(match.status!=='upcoming'||!Number.isFinite(start)||start<=now())continue;
      const key=match.id+'|'+new Date(start).toISOString();
      for(const [id,device] of Object.entries(store.devices)){
       if(closed)break;if(store.devices[id]!==device||!device.matchIds.includes(match.id)||device.sent[key]||now()<start-device.minutes*60000||now()>=start)continue;
       const host=new URL(device.subscription.endpoint).hostname,provider=host.endsWith('.push.apple.com')?'apple':host.endsWith('.notify.windows.com')?'windows':host;
       enqueue(provider,async()=>{
       const latest=store.devices[id];
       if(closed||!sameSubscription(latest?.subscription,device.subscription)||!latest.matchIds.includes(match.id)||latest.sent[key]||now()<start-latest.minutes*60000||now()>=start)return;
       const event=feed.events?.find(e=>e.id===match.eventId),name=event?localizeEvent(event,new Date(start).getUTCFullYear()).name:'官方赛事';
       const teams=(match.teams||[]).map(team=>feed.teams?.[team]?.short||feed.teams?.[team]?.name||'待官方公布').join(' VS ');
       const time=new Date(start).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
       const delivered=await deliver(id,latest,{title:'赛点 · 比赛即将开始',body:`${name} · ${match.game==='apex'?'多队积分赛':teams}\n${time}（北京时间），距开赛约 ${Math.max(1,Math.ceil((start-now())/60000))} 分钟。`,tag:'matchpoint-'+createHash('sha256').update(key).digest('hex').slice(0,24),url:'/following?match='+encodeURIComponent(match.id)},Math.ceil((start-now())/1000));
       const current=store.devices[id];
       if(delivered&&sameSubscription(current?.subscription,device.subscription)){current.sent[key]=now();await persist();}
       });
      }
     }
    }));
    await Promise.all(workers);
    if(dirty||savedRevision<revision)await persist();
    if(errors.length)throw errors[0];
   })().finally(()=>{active=null;});return active;
  },
  start(){if(timer||closed)return;service.tick().catch(()=>console.warn('[Reminders] 暂时无法检查赛程'));timer=setInterval(()=>service.tick().catch(()=>console.warn('[Reminders] 暂时无法检查赛程')),30000);timer.unref();},
  async close(){closed=true;clearInterval(timer);for(const stop of stopReads)stop();try{if(active)await active;}finally{if(loading)await loading;await writes;if(store&&savedRevision<revision)await persist();}}
 };
 return service;
}
