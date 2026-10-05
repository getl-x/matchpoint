import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const origin='https://matchpoint.test',first='a'.repeat(64),second='b'.repeat(64);
function storage(){
 const stores=new Map(),key=(request,ignoreSearch=false)=>{const url=new URL(typeof request==='string'?request:request.url,origin);if(ignoreSearch)url.search='';return url.href;};
 return {keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
  if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);
  return {put:async(request,response)=>entries.set(key(request),response.clone()),match:async(request,options)=>{const match=[...entries].find(([url])=>key(url,options?.ignoreSearch)===key(request,options?.ignoreSearch));return match?.[1].clone();}};
 }};
}
async function worker(caches){
 const handlers={},self={location:{origin},addEventListener:(name,handler)=>{handlers[name]=handler;},clients:{claim:async()=>{},matchAll:async()=>[]}};
 runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,caches,URL,Response,fetch:()=>Promise.reject(new Error('Unexpected network request'))});
 async function fetch(path,{clientId='',resultingClientId='',navigate=false}={}){
  let response;handlers.fetch({request:{url:origin+path,method:'GET',mode:navigate?'navigate':'cors'},clientId,resultingClientId,respondWith:value=>{response=value;},waitUntil:()=>{}});return await response;
 }
 async function activate(build){let work,reply;handlers.message({data:{type:'ACTIVATE_APP_BUILD',build},ports:[{postMessage:value=>{reply=value;}}],waitUntil:value=>{work=value;}});await work;assert.equal(reply.ok,true);}
 return {fetch,activate};
}
test('A document keeps its own complete build when another page activates an update, including after worker restart',async()=>{
 const caches=storage();
 for(const [build,script] of [[first,'old-script'],[second,'new-script']]){
  const release=await caches.open('matchpoint-release-'+build);await release.put('/index.html',new Response('<meta name="matchpoint-build" content="'+build+'"/>'));await release.put('/src/app.js',new Response(script));
 }
 await (await caches.open('matchpoint-app-state')).put('/__matchpoint-active-build',new Response(first));
 const active=await worker(caches),document=await active.fetch('/schedule',{navigate:true,resultingClientId:'opening-page'});assert.match(await document.text(),new RegExp(first));
 await active.activate(second);
 assert.equal(await (await active.fetch('/src/app.js',{clientId:'opening-page'})).text(),'old-script');
 const restarted=await worker(caches);assert.equal(await (await restarted.fetch('/src/app.js',{clientId:'opening-page'})).text(),'old-script');
 const newer=await restarted.fetch('/schedule',{navigate:true,resultingClientId:'updated-page'});assert.match(await newer.text(),new RegExp(second));assert.equal(await (await restarted.fetch('/src/app.js',{clientId:'updated-page'})).text(),'new-script');
});
