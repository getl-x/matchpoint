const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const {createAppServer}=await import('../server.mjs'),{loadConfig,initializeStorage}=await import('../server/config.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'matchpoint-pwa-update-'));
 let app,browser,port,revision=0;
 const unavailable=new Set();
 const config={...loadConfig({MATCHPOINT_DATA_DIR:path.join(root,'data'),MATCHPOINT_ARCHIVE_SYNC:'false'}),root};
 async function stop(){if(app)await new Promise(resolve=>{app.close(resolve);app.closeAllConnections();});app=null;}
 async function deploy(){
  await stop();await fs.appendFile(path.join(root,'styles.css'),'\n/* deployment '+(++revision)+' */\n');
  app=createAppServer({config,readFeed:async game=>({game,source:{name:'Official fixture',retrievedAt:new Date().toISOString()},matches:[],events:[],teams:{}}),reminders:{config:async()=>({publicKey:Buffer.alloc(65).toString('base64url')})}});
  const handle=app.listeners('request')[0];app.removeListener('request',handle);app.on('request',(request,response)=>{if(unavailable.has(new URL(request.url,'http://localhost').pathname))request.socket.destroy();else handle(request,response);});
  await new Promise(resolve=>app.listen(port||0,'127.0.0.1',resolve));port=app.address().port;
 }
 async function loaded(page){await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.locator('.source-chip.ready').first().waitFor();}
 const passed=[],failed=[];
 async function check(name,work){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{await work({context,page,base:'http://127.0.0.1:'+port});assert.deepEqual(errors,[]);passed.push(name);console.log('PASS '+name);}
  catch(error){failed.push({name,error:error.message});console.error('FAIL '+name+': '+error.message);}
  finally{await context.close();}
 }
 try{
  for(const name of ['index.html','styles.css','sw.js','manifest.webmanifest','package.json','src','assets'])await fs.cp(path.join(__dirname,'..',name),path.join(root,name),{recursive:true});
  await initializeStorage(config);await deploy();browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  await check('Returning to an old open PWA detects a new deployment even when the worker script and version stay unchanged',async({page,base})=>{
   await page.goto(base+'/following');await loaded(page);
   await page.evaluate(()=>{localStorage.setItem('matchpoint:preferences:v2',JSON.stringify({version:2,game:'valorant',follows:['valorant:official'],theme:'light',reminders:{enabled:false,minutes:25,calendar:true}}));localStorage.setItem('matchpoint:push-token:v1','0123456789abcdef'.repeat(4));});
   const preferences=await page.evaluate(()=>localStorage.getItem('matchpoint:preferences:v2'));
   await page.locator('.notification-button').click();await page.locator('#reminder-minutes').fill('37');
   const before=await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]')?.content),worker=await (await fetch(base+'/sw.js')).text();
   await deploy();assert.equal(await (await fetch(base+'/sw.js')).text(),worker);
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await page.locator('.app-update-notice').waitFor({timeout:5000});
   assert.equal(await page.locator('#reminder-minutes').inputValue(),'37');assert.equal(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]')?.content),before);
   await page.locator('[data-action="close"]').click();
   await Promise.all([page.waitForEvent('load'),page.locator('.app-update-notice [data-action="update-app"]').click()]);await loaded(page);
   const current=await (await fetch(base+'/api/app-version')).json();assert.notEqual(current.build,before);assert.equal(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content),current.build);
   assert.equal(await page.evaluate(()=>localStorage.getItem('matchpoint:preferences:v2')),preferences);assert.equal(await page.evaluate(()=>localStorage.getItem('matchpoint:push-token:v1')),'0123456789abcdef'.repeat(4));
   assert.equal(new URL(page.url()).pathname,'/following');assert.equal(await page.locator('.app-update-notice').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  });
  await check('A visible PWA discovers frontend updates on its periodic check',async({page,base})=>{
   await page.clock.install();await page.goto(base+'/schedule');await loaded(page);await deploy();await page.clock.fastForward(65000);await page.locator('.app-update-notice').waitFor({timeout:5000});
  });
  await check('The mobile update button reloads the current application without reinstalling or losing saved data',async({page,base})=>{
   await page.goto(base+'/schedule');await loaded(page);await page.locator('[data-action="theme"]').click();
   const saved=await page.evaluate(()=>localStorage.getItem('matchpoint:preferences:v2'));assert.equal(await page.locator('.app-update-notice').count(),0);
   await Promise.all([page.waitForEvent('load'),page.locator('.app-update-button').click()]);await loaded(page);
   assert.equal(await page.evaluate(()=>localStorage.getItem('matchpoint:preferences:v2')),saved);
   assert.equal(await page.locator('.app-update-notice').count(),0);assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
  await check('Offline updates keep the page available; reconnection detects and applies the new deployment',async({context,page,base})=>{
   await page.goto(base+'/schedule');await loaded(page);await context.setOffline(true);await page.locator('.app-update-button').click();
   await page.locator('.toast').filter({hasText:'联网'}).waitFor();await deploy();await context.setOffline(false);await page.locator('.app-update-notice').waitFor({timeout:5000});
   await Promise.all([page.waitForEvent('load'),page.locator('.app-update-notice [data-action="update-app"]').click()]);await loaded(page);
   await context.setOffline(true);await page.reload();await page.locator('.app-update-button').waitFor();assert.equal(await page.locator('.app-update-notice').count(),0);
  });
  await check('A failed update check keeps the existing page and retries after connectivity recovers',async({context,page,base})=>{
   await page.goto(base+'/schedule');await loaded(page);
   const build=await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content);
   await context.route('**/api/app-version',route=>route.fulfill({status:503,json:{error:'temporary'}}));
   await page.locator('.app-update-button').click();await page.locator('.toast').filter({hasText:'重试'}).waitFor();
   assert.equal(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content),build);assert.equal(await page.locator('.app-update-notice').count(),0);
   await deploy();await context.unroute('**/api/app-version');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('.app-update-notice').waitFor({timeout:5000});
  });
  await check('One unavailable new script cannot mix old code with new HTML or hide the remaining update',async({context,page,base})=>{
   await fs.appendFile(path.join(root,'src','app.js'),'\nwindow.__loadedDeployment="old";\n');await deploy();await page.goto(base+'/schedule');await loaded(page);
   const oldBuild=await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content);
   await fs.appendFile(path.join(root,'src','app.js'),'\nwindow.__loadedDeployment="new";\n');await deploy();unavailable.add('/src/app.js');
   try{
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('.app-update-notice').waitFor({timeout:5000});await page.locator('.app-update-notice [data-action="update-app"]').click();
    await page.waitForFunction(oldBuild=>!!document.querySelector('.toast')||document.querySelector('meta[name="matchpoint-build"]')?.content!==oldBuild,oldBuild,{timeout:5000});
    assert.equal(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content),oldBuild,'A partially downloaded update must keep the loaded HTML');
    assert.equal(await page.evaluate(()=>window.__loadedDeployment),'old');assert.equal(await page.locator('.app-update-notice').count(),1);
    await page.reload();await loaded(page);
    assert.equal(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content),oldBuild,'Reopening the PWA must also keep HTML and scripts on one complete build');
    assert.equal(await page.evaluate(()=>window.__loadedDeployment),'old');await page.locator('.app-update-notice').waitFor({timeout:5000});
   }finally{unavailable.clear();}
   await Promise.all([page.waitForEvent('load'),page.locator('.app-update-notice [data-action="update-app"]').click()]);await loaded(page);
   assert.equal(await page.evaluate(()=>window.__loadedDeployment),'new');
   const current=await (await fetch(base+'/api/app-version')).json();assert.equal(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content),current.build);
   unavailable.add('/src/app.js');try{await context.setOffline(true);await page.reload();await page.locator('.app-update-button').waitFor();assert.equal(await page.evaluate(()=>window.__loadedDeployment),'new');}finally{unavailable.clear();}
  });
  await check('Older cached HTML without a build marker can be updated without deleting the installed PWA',async({page,base})=>{
   const file=path.join(root,'index.html'),html=await fs.readFile(file,'utf8');
   try{
    await fs.writeFile(file,html.replace(/<meta name="matchpoint-build"[^>]*>\s*/,''));await deploy();
    await page.goto(base+'/schedule');await loaded(page);await page.locator('.app-update-notice').waitFor({timeout:5000});
    await fs.writeFile(file,html);await deploy();
    await Promise.all([page.waitForEvent('load'),page.locator('.app-update-notice [data-action="update-app"]').click()]);await loaded(page);
    assert.match(await page.evaluate(()=>document.querySelector('meta[name="matchpoint-build"]').content),/^[a-f0-9]{64}$/);assert.equal(await page.locator('.app-update-notice').count(),0);
   }finally{await fs.writeFile(file,html);}
  });
  await check('A failed update in another window cannot delete the successfully activated build',async({context,page,base})=>{
   await page.goto(base+'/schedule');await loaded(page);const other=await context.newPage();await other.goto(base+'/schedule');await loaded(other);
   await fs.appendFile(path.join(root,'src','app.js'),'\nwindow.__loadedDeployment="parallel-new";\n');await deploy();
   let release,started;const began=new Promise(resolve=>{started=resolve;});
   await other.route('**/src/app.js?app-build=*',async route=>{started();await new Promise(resolve=>{release=resolve;});await route.abort();});
   await other.locator('.app-update-button').click();await began;
   try{
    await Promise.all([page.waitForEvent('load'),page.locator('.app-update-button').click()]);await loaded(page);assert.equal(await page.evaluate(()=>window.__loadedDeployment),'parallel-new');
   }finally{release();}
   await other.locator('.toast').filter({hasText:'重试'}).waitFor();
   await context.setOffline(true);await page.reload();await page.locator('.app-update-button').waitFor();assert.equal(await page.evaluate(()=>window.__loadedDeployment),'parallel-new');
  });
  assert.deepEqual(failed,[]);console.log('PWA update browser checks: '+passed.length+' passed.');
 }finally{if(browser)await browser.close();await stop();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
