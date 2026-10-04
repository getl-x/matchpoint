import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createECDH} from 'node:crypto';
import {Readable} from 'node:stream';
import {createAppServer} from '../server.mjs';
import {createReminderService} from '../server/reminders.mjs';
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'matchpoint-push-api-')),reminders=createReminderService({directory,readFeed:async()=>({}),send:async()=>{}});
 const server=createAppServer({reminders});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});await reminders.close();await rm(directory,{recursive:true,force:true});});
 const token=randomBytes(32).toString('hex'),key=createECDH('prime256v1');key.generateKeys();
 const body={subscription:{endpoint:'https://web.push.apple.com/api-test',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},matchIds:[],minutes:15};
 return {base,token,body,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:base}};
}
test('Reminder API persists private device subscriptions and isolates status and removal by token',async t=>{
 const {base,body,headers}=await setup(t);
 const config=await fetch(base+'/api/reminders/config');assert.equal(config.status,200);const publicConfig=await config.json();assert.ok(publicConfig.publicKey);assert.equal(publicConfig.privateKey,undefined);
 const update=await fetch(base+'/api/reminders/subscription',{method:'PUT',headers,body:JSON.stringify(body)});assert.equal(update.status,200);
 assert.equal((await (await fetch(base+'/api/reminders/subscription',{headers})).json()).subscribed,true);
 const other={...headers,Authorization:'Bearer '+randomBytes(32).toString('hex')};assert.equal((await (await fetch(base+'/api/reminders/subscription',{headers:other})).json()).subscribed,false);
 assert.equal((await fetch(base+'/api/reminders/test',{method:'POST',headers,body:'{}'})).status,200);
 assert.equal((await fetch(base+'/api/reminders/test',{method:'POST',headers,body:'{}'})).status,429);
 assert.equal((await fetch(base+'/api/reminders/subscription',{method:'DELETE',headers})).status,200);
});
test('Reminder API rejects cross-origin changes, absent credentials and oversized or invalid JSON',async t=>{
 const {base,body,headers}=await setup(t),url=base+'/api/reminders/subscription';
 assert.equal((await fetch(url,{method:'PUT',headers:{...headers,Origin:'https://evil.test'},body:JSON.stringify(body)})).status,403);
 assert.equal((await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,401);
 assert.equal((await fetch(url,{method:'PUT',headers,body:'x'.repeat(33000)})).status,413);
 assert.equal((await fetch(url,{method:'PUT',headers,body:'{'})).status,400);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(body)})).status,405);
});
test('Independent devices behind a proxy retain their own reminder request quotas',async t=>{
 const {base,body,headers}=await setup(t);
 for(let i=0;i<60;i++)assert.equal((await fetch(base+'/api/reminders/subscription',{headers})).status,200);
 const other={...headers,Authorization:'Bearer '+randomBytes(32).toString('hex')};
 assert.equal((await fetch(base+'/api/reminders/subscription',{method:'PUT',headers:other,body:JSON.stringify(body)})).status,200);
});
test('Chunked obsolete unsubscribe body cannot delete a replacement subscription',async t=>{
 const {base,body,headers}=await setup(t);await fetch(base+'/api/reminders/subscription',{method:'PUT',headers,body:JSON.stringify(body)});
 const response=await fetch(base+'/api/reminders/subscription',{method:'DELETE',headers,duplex:'half',body:Readable.from([JSON.stringify({endpoint:body.subscription.endpoint+'-old'})])});
 assert.equal(response.status,200);assert.equal((await (await fetch(base+'/api/reminders/subscription',{headers})).json()).subscribed,true);
});
test('Same-origin browser subscriptions work when a reverse proxy rewrites the upstream Host',async t=>{
 const {base,body,headers}=await setup(t),browserHeaders={...headers,Origin:'https://matches.example.com','Sec-Fetch-Site':'same-origin'};
 const response=await fetch(base+'/api/reminders/subscription',{method:'PUT',headers:browserHeaders,body:JSON.stringify(body)});
 assert.equal(response.status,200);
 assert.equal((await (await fetch(base+'/api/reminders/subscription',{headers})).json()).subscribed,true);
 assert.equal((await fetch(base+'/api/reminders/test',{method:'POST',headers:browserHeaders,body:'{}'})).status,200);
 assert.equal((await fetch(base+'/api/reminders/subscription',{method:'DELETE',headers:browserHeaders,body:JSON.stringify({endpoint:body.subscription.endpoint})})).status,200);
});
test('Cross-site and sibling-site requests stay rejected even with matching Host or forwarded headers',async t=>{
 const {base,body,headers}=await setup(t);
 for(const site of ['cross-site','same-site']){
  const response=await fetch(base+'/api/reminders/subscription',{method:'PUT',headers:{...headers,'Sec-Fetch-Site':site,'X-Forwarded-Host':'evil.test'},body:JSON.stringify(body)});
  assert.equal(response.status,403);
 }
 const invalid=await fetch(base+'/api/reminders/subscription',{method:'PUT',headers:{...headers,Origin:'null','Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});assert.equal(invalid.status,403);
 const missing=await fetch(base+'/api/reminders/subscription',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://matches.example.com','Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});assert.equal(missing.status,401);
 assert.equal((await (await fetch(base+'/api/reminders/subscription',{headers})).json()).subscribed,false);
});
