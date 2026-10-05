export function createAppUpdater({onChange=()=>{}}={}){
 const loadedBuild=document.querySelector('meta[name="matchpoint-build"]')?.content;
 let pending=null;
 async function check(){
  if(document.hidden||navigator.onLine===false)return null;
  if(pending)return pending;
  pending=(async()=>{
   try{
    const response=await fetch('/api/app-version',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!response.ok)return null;
    const current=await response.json();if(!/^[a-f0-9]{64}$/.test(current.build))return null;
    onChange(current.build!==loadedBuild);return current;
   }catch{return null;}
  })();
  try{return await pending;}finally{pending=null;}
 }
 async function update(){
  if(navigator.onLine===false)throw new Error('当前离线，请联网后再更新应用');
  const next=await check();if(!next)throw new Error('暂时无法更新应用，请检查网络后重试');
  const cacheName='matchpoint-release-'+next.build;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   if(!Array.isArray(next.resources)||!next.resources.length||!crypto.subtle)throw new Error('应用更新信息暂不可用');
   const downloaded=await Promise.all(next.resources.map(async resource=>{
    if(!/^\/(index\.html|styles\.css|sw\.js|manifest\.webmanifest|src\/[\w/.-]+|assets\/[\w.-]+)$/.test(resource.url)||!/^[a-f0-9]{64}$/.test(resource.hash))throw new Error('应用更新信息无效');
    const response=await fetch(resource.url+'?app-build='+next.build,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('应用资源下载失败');
    const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(hash!==resource.hash)throw new Error('应用资源版本不一致');
    const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
    return {url:resource.url,response:new Response(bytes,{headers})};
   }));
   if(navigator.serviceWorker){
    const cache=await caches.open(cacheName);await Promise.all(downloaded.map(resource=>cache.put(resource.url,resource.response)));
    // Keep the registration and push subscription. The worker switches only to a complete snapshot.
    const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}),worker=registration.installing||registration.waiting;
    if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
     const changed=()=>{if(worker.state==='activated'){clearTimeout(timeout);worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){clearTimeout(timeout);worker.removeEventListener('statechange',changed);reject(new Error('应用更新未完成'));}};
     const timeout=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(new Error('应用更新超时'));},15000);worker.addEventListener('statechange',changed);changed();
    });
    await new Promise((resolve,reject)=>{
     const channel=new MessageChannel(),timeout=setTimeout(()=>{channel.port1.close();reject(new Error('应用更新未完成'));},5000);
     channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();event.data?.ok?resolve():reject(new Error('应用更新未完成'));};
     if(!registration.active){clearTimeout(timeout);channel.port1.close();reject(new Error('应用更新未完成'));return;}
     registration.active.postMessage({type:'ACTIVATE_APP_BUILD',build:next.build},[channel.port2]);
    });
   }
   location.reload();
  }catch{
   // Another tab or a delayed worker acknowledgement may already use this build.
   // Never delete a shared snapshot on an individual update failure.
   controller.abort();
   throw new Error('应用更新未完成，当前页面已保留，请检查网络后重试');
  }finally{clearTimeout(timer);}
 }
 document.addEventListener('visibilitychange',check);
 window.addEventListener('pageshow',check);
 window.addEventListener('online',check);
 setInterval(check,60000);check();
 return {check,update};
}
