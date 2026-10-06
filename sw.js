const CACHE='matchpoint-v21-viewport-match-dialog';
const APP_STATE='matchpoint-app-state',ACTIVE_BUILD='/__matchpoint-active-build',INSTALLED_BUILD='/__matchpoint-installed-build',CLIENT_BUILD='/__matchpoint-client-build/',RELEASE_PREFIX='matchpoint-release-';
const SHELL=['/index.html','/styles.css','/manifest.webmanifest','/assets/favicon.svg','/assets/mark.svg','/assets/hero.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/icon-maskable.png','/src/app.js','/src/app-update.js','/src/ui.js','/src/data.js','/src/state.js','/src/reminders.js','/src/calendar.js','/src/localization.js','/src/theme.js','/src/sources.js','/src/watch.js','/src/bracket.js','/src/mindmap.js','/src/elimination.js','/src/diagrams.js','/src/components.js','/src/logo-sources.js','/src/team-logos.js','/src/views/schedule.js','/src/views/bracket.js','/src/views/archive.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const response=await fetch('/api/app-version',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Application version unavailable');
 const version=await response.json();if(!/^[a-f0-9]{64}$/.test(version.build)||!Array.isArray(version.resources)||!version.resources.length)throw new Error('Invalid application version');
 const downloaded=await Promise.all(version.resources.map(async resource=>{
  if(!/^\/(index\.html|styles\.css|sw\.js|manifest\.webmanifest|src\/[\w/.-]+|assets\/[\w.-]+)$/.test(resource.url)||!/^[a-f0-9]{64}$/.test(resource.hash))throw new Error('Invalid application resource');
  const response=await fetch(resource.url+'?app-build='+version.build,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Application resource unavailable');
  const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(hash!==resource.hash)throw new Error('Application resource changed');
  const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return {url:resource.url,response:new Response(bytes,{headers})};
 }));
 const release=await caches.open(RELEASE_PREFIX+version.build);await Promise.all(downloaded.map(resource=>release.put(resource.url,resource.response)));
 await (await caches.open(CACHE)).put(INSTALLED_BUILD,new Response(version.build));await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('matchpoint-')&&key!==CACHE&&key!==APP_STATE&&!key.startsWith(RELEASE_PREFIX)).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
 if(event.data?.type!=='ACTIVATE_APP_BUILD'||!/^[a-f0-9]{64}$/.test(event.data.build)||!event.ports?.[0])return;
 event.waitUntil((async()=>{
  try{
   const build=event.data.build,release=await caches.open(RELEASE_PREFIX+build),html=await release.match('/index.html');
   if(!html||(await html.text()).indexOf('content="'+build+'"')===-1)throw new Error('Incomplete application snapshot');
   await (await caches.open(APP_STATE)).put(ACTIVE_BUILD,new Response(build));event.ports[0].postMessage({ok:true});
  }catch{event.ports[0].postMessage({ok:false});}
 })());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.searchParams.has('app-build'))return;
 event.respondWith((async()=>{
  const state=await caches.open(APP_STATE),installed=await caches.open(CACHE),navigation=event.request.mode==='navigate'&&['/','/schedule','/bracket','/archive','/following'].includes(url.pathname);
  const clientKey=event.clientId&&CLIENT_BUILD+encodeURIComponent(event.clientId);
  const selected=(!navigation&&clientKey&&await state.match(clientKey))||await state.match(ACTIVE_BUILD)||await installed.match(INSTALLED_BUILD),build=selected&&await selected.text();
  if(navigation&&build&&event.resultingClientId)await state.put(CLIENT_BUILD+encodeURIComponent(event.resultingClientId),new Response(build));
  if(build){
   const release=await caches.open(RELEASE_PREFIX+build),cached=await release.match(event.request,{ignoreSearch:true});if(cached)return cached;
   if(navigation)return await release.match('/index.html')||Response.error();
   if(SHELL.includes(url.pathname)||url.pathname.startsWith('/src/'))return Response.error();
  }
  try{
   const response=await fetch(event.request);if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;
  }catch{return await installed.match(event.request)||(event.request.mode==='navigate'?await installed.match('/index.html'):Response.error());}
 })());
});
function reminderURL(value){
 try{const url=new URL(value||'/following',self.location.origin);if(url.origin===self.location.origin&&url.pathname==='/following')return url.href;}catch{}
 return self.location.origin+'/following';
}
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(String(payload.title||'赛点 · 开赛提醒').slice(0,100),{body:String(payload.body||'你关注的比赛即将开始，点击查看最新官方赛程。').slice(0,1000),icon:'/assets/icon-192.png',badge:'/assets/favicon.svg',tag:String(payload.tag||'matchpoint-reminder').slice(0,100),data:{url:reminderURL(payload.url)}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=reminderURL(event.notification.data?.url),clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients){if(new URL(client.url).origin===self.location.origin&&'navigate'in client){await client.navigate(url);await client.focus();return;}}await self.clients.openWindow(url);})());
});
