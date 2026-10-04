import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
async function worker(){
 const handlers={},notifications=[],opened=[],self={location:{origin:'https://matchpoint.test'},addEventListener:(name,fn)=>{handlers[name]=fn;},registration:{showNotification:async(title,options)=>{notifications.push({title,options});}},clients:{matchAll:async()=>[],openWindow:async url=>{opened.push(url);}}};
 runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});
 return {handlers,notifications,opened};
}
test('Service worker displays push while no page is open and click opens the corresponding match',async()=>{
 const {handlers,notifications,opened}=await worker();let work;
 assert.equal(typeof handlers.push,'function');handlers.push({data:{json:()=>({title:'比赛提醒',body:'EDG VS PRX',tag:'match',url:'/following?match=valorant%3Aofficial'})},waitUntil:promise=>{work=promise;}});await work;
 assert.equal(notifications[0].title,'比赛提醒');assert.equal(notifications[0].options.icon,'/assets/icon-192.png');
 handlers.notificationclick({notification:{data:notifications[0].options.data,close:()=>{}},waitUntil:promise=>{work=promise;}});await work;assert.equal(opened[0],'https://matchpoint.test/following?match=valorant%3Aofficial');
});
test('Notification clicks never open external origins or arbitrary internal paths',async()=>{
 const {handlers,opened}=await worker();let work;
 assert.equal(typeof handlers.notificationclick,'function');
 for(const url of ['https://evil.test/', '//evil.test/', '/api/archive/sync']){
  handlers.notificationclick({notification:{data:{url},close:()=>{}},waitUntil:p=>{work=p;}});await work;
 }
 assert.ok(opened.every(url=>url==='https://matchpoint.test/following'));
});
