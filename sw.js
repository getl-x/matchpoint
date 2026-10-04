const CACHE='matchpoint-v12-notification-state';
const SHELL=['/index.html','/styles.css','/manifest.webmanifest','/assets/favicon.svg','/assets/mark.svg','/assets/hero.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/icon-maskable.png','/src/app.js','/src/ui.js','/src/data.js','/src/state.js','/src/reminders.js','/src/calendar.js','/src/localization.js','/src/theme.js','/src/sources.js','/src/watch.js','/src/bracket.js','/src/mindmap.js','/src/elimination.js','/src/diagrams.js','/src/components.js','/src/logo-sources.js','/src/team-logos.js','/src/views/schedule.js','/src/views/bracket.js','/src/views/archive.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('matchpoint-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||(event.request.mode==='navigate'?caches.match('/index.html'):Response.error()))));});
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
