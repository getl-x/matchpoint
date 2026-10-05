const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://localhost:4179';
(async()=>{
 const {normalizeRiot}=await import('../server/providers/riot.mjs'),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/riot-official.json','file://'+__filename.replaceAll('\\','/')),'utf8')),feed=normalizeRiot(fixture,'valorant');
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}),passed=[],failed=[];
 async function check(name,work){
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/api/feed?game=*',route=>{const game=new URL(route.request().url()).searchParams.get('game');return route.fulfill({json:game==='valorant'?feed:{game,source:feed.source,matches:[],events:[],teams:{}}});});
  try{await work({context,page});assert.deepEqual(errors,[]);passed.push(name);console.log('PASS '+name);}
  catch(error){failed.push({name,error:error.message});console.error('FAIL '+name+': '+error.message);}
  finally{await context.close();}
 }
 async function installedNotifications(context){
  await context.addInitScript(()=>{
   localStorage.setItem('matchpoint:preferences:v2',JSON.stringify({version:2,follows:['valorant:official'],reminders:{enabled:true,minutes:15,calendar:false}}));
   Object.defineProperty(Notification,'permission',{get:()=> 'granted'});
   const subscription={toJSON:()=>({endpoint:'https://web.push.apple.com/lifecycle-fixture',keys:{p256dh:'test-only',auth:'test-only'}}),unsubscribe:async()=>true};
   PushManager.prototype.getSubscription=async()=>subscription;
  });
 }
 try{
  await check('An official live match stays visible after Beijing midnight and retains its original start date',async({context,page})=>{
   const raw={...structuredClone(fixture.find(e=>e.state==='unstarted')),id:'overnight-official',state:'inProgress',startTime:'2026-10-03T15:30:00Z'},liveFeed=normalizeRiot([raw],'valorant');
   await context.route('**/api/feed?game=*',route=>{const game=new URL(route.request().url()).searchParams.get('game');return route.fulfill({json:game==='valorant'?liveFeed:{game,source:liveFeed.source,matches:[],events:[],teams:{}}});});
   await page.clock.install({time:new Date('2026-10-03T15:59:30Z')});
   await page.goto(base+'/schedule');await page.locator('.live-card-body[data-id="valorant:overnight-official"]').waitFor();
   await page.clock.fastForward(120000);
   assert.equal(await page.locator('.calendar-picker input').inputValue(),'2026-10-04');
   await page.locator('[data-action="status"][data-status="live"]').click();
   assert.equal(await page.locator('.live-card').count(),1);
   await page.locator('.live-card-body').click();await page.locator('dialog[open]').waitFor();
   assert.match(await page.locator('.detail-info').innerText(),/2026-10-03 23:30/);
   await page.locator('[data-action="close"]').click();
   await page.locator('.calendar-picker input').fill('2026-10-02');assert.equal(await page.locator('.live-card').count(),0);
   await page.locator('[data-action="today"]').click();assert.equal(await page.locator('.live-card').count(),1);
  });
  await check('An open PWA moves today to the new Beijing day but preserves a manually chosen historical date',async({page})=>{
   await page.clock.install({time:new Date('2026-10-03T15:59:30Z')});
   await page.goto(base+'/schedule');await page.locator('.source-chip.ready').first().waitFor();
   assert.equal(await page.locator('.calendar-picker input').inputValue(),'2026-10-03');
   await page.clock.fastForward(120000);
   assert.equal(await page.locator('.calendar-picker input').inputValue(),'2026-10-04');
   assert.equal(await page.locator('.day-button').filter({hasText:'今天'}).getAttribute('data-date'),'2026-10-04');
   await page.locator('.calendar-picker input').fill('2026-10-02');
   await page.clock.fastForward(86400000);
   assert.equal(await page.locator('.calendar-picker input').inputValue(),'2026-10-02');
   await page.locator('[data-action="today"]').click();
   assert.equal(await page.locator('.calendar-picker input').inputValue(),'2026-10-05');
  });
  await check('Selecting yesterday just after midnight is respected before the next automatic refresh',async({page})=>{
   await page.clock.install({time:new Date('2026-10-03T15:59:30Z')});await page.goto(base+'/schedule');
   await page.locator('.day-button[data-date="2026-10-03"]').waitFor();
   await page.clock.setFixedTime(new Date('2026-10-03T16:00:05Z'));
   await page.locator('.day-button[data-date="2026-10-03"]').click();
   assert.equal(await page.locator('.calendar-picker input').inputValue(),'2026-10-03');
   assert.equal(await page.locator('.day-button').filter({hasText:'今天'}).getAttribute('data-date'),'2026-10-04');
  });
  await check('A background reminder sync cannot erase unsaved minutes, calendar choice or input focus',async({context,page})=>{
   await installedNotifications(context);let release,started;
   const began=new Promise(resolve=>{started=resolve;});
   await context.route('**/api/reminders/subscription',async route=>{if(route.request().method()==='PUT')await new Promise(resolve=>{release=resolve;started();});await route.fulfill({json:{subscribed:true}});});
   await page.goto(base+'/following');await began;await page.locator('.notification-button').click();
   await page.locator('#reminder-calendar').check();await page.locator('#reminder-minutes').fill('31');
   release();await page.waitForResponse(response=>response.url().endsWith('/api/reminders/subscription'));await page.locator('.reminder-status.enabled').waitFor();
   assert.equal(await page.locator('#reminder-minutes').inputValue(),'31');
   assert.equal(await page.locator('#reminder-calendar').isChecked(),true);
   assert.equal(await page.locator('#reminder-minutes').evaluate(input=>input===document.activeElement),true);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('matchpoint:preferences:v2')).reminders.minutes),15);
  });
  await check('A transient reminder update failure recovers automatically while the page stays visible',async({context,page})=>{
   await installedNotifications(context);await page.clock.install({time:new Date('2026-10-03T08:00:00Z')});let failedOnce=false;
   await context.route('**/api/reminders/subscription',route=>{if(!failedOnce){failedOnce=true;return route.fulfill({status:503,json:{error:'temporary'}});}return route.fulfill({json:{subscribed:true}});});
   await page.goto(base+'/following');await page.waitForFunction(()=>document.querySelector('.following-reminder-heading p')?.textContent.includes('temporary'));
   await page.clock.fastForward(65000);
   await page.waitForFunction(()=>document.querySelector('.following-reminder-heading p')?.textContent.includes('已开启'),{},{timeout:5000});
  });
  await check('Automatic reminder sync preserves keyboard focus on preset and save buttons',async({context,page})=>{
   await installedNotifications(context);await page.clock.install({time:new Date('2026-10-03T08:00:00Z')});
   await context.route('**/api/reminders/subscription',route=>route.fulfill({json:{subscribed:true}}));
   await page.goto(base+'/following');await page.locator('.notification-button').click();await page.locator('.reminder-status.enabled').waitFor();
   await page.evaluate(()=>{window.__reminderRenders=0;new MutationObserver(()=>window.__reminderRenders++).observe(document.querySelector('#modal'),{childList:true});});
   for(const selector of ['[data-action="reminder-preset"][data-minutes="30"]','[data-action="reminder-save"]']){
    await page.locator(selector).focus();const before=await page.evaluate(()=>window.__reminderRenders),synced=page.waitForResponse(response=>response.url().endsWith('/api/reminders/subscription'));
    await page.clock.fastForward(65000);await synced;
    // A response arrives before JSON parsing and the modal update complete.
    // Query the current DOM atomically, rather than a handle replaced during that update.
    await page.waitForFunction(({selector,before})=>window.__reminderRenders>before&&document.querySelector(selector)===document.activeElement,{selector,before},{timeout:2000});
   }
  });
  assert.deepEqual(failed,[]);console.log('App lifecycle browser checks: '+passed.length+' passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
