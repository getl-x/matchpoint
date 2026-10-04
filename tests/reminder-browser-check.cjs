const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/getl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_URL||'http://localhost:4179';
(async()=>{
 const {normalizeRiot}=await import('../server/providers/riot.mjs'),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/riot-official.json','file://'+__filename.replaceAll('\\','/')),'utf8')),feed=normalizeRiot(fixture,'valorant');
 const browser=await chromium.launch({headless:true,channel:'msedge'}),passed=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],updates=[];
  let subscriptionMode='success',releaseSubscription,subscriptionStarted,removalRejected=false,removals=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-03T08:00:00Z')});
  await context.route('**/api/feed?game=*',route=>{const game=new URL(route.request().url()).searchParams.get('game');return route.fulfill({json:game==='valorant'?feed:{game,source:feed.source,matches:[],events:[],teams:{}}});});
  await context.route('**/api/reminders/subscription',async route=>{
   if(route.request().method()==='DELETE'){removals++;if(removalRejected)return route.fulfill({status:503,json:{error:'temporary'}});
   }
   if(route.request().method()==='PUT'){
    updates.push(route.request().postDataJSON());
    if(subscriptionMode==='delayed')await new Promise(resolve=>{releaseSubscription=resolve;subscriptionStarted();});
    if(subscriptionMode==='rejected')return route.fulfill({status:403,json:{error:'只允许在赛点内修改提醒'}});
   }
   return route.fulfill({json:{subscribed:route.request().method()!=='DELETE'}});
  });
  await context.addInitScript(()=>{
   window.__permissionRequests=0;let permission='default',subscription=null;
   Object.defineProperty(Notification,'permission',{get:()=>permission});
   Object.defineProperty(Notification,'requestPermission',{value:()=>{window.__permissionRequests++;permission='granted';return Promise.resolve('granted');}});
   PushManager.prototype.getSubscription=async()=>subscription;
   PushManager.prototype.subscribe=async()=>{subscription={toJSON:()=>({endpoint:'https://web.push.apple.com/browser-fixture',keys:{p256dh:'test-only',auth:'test-only'}}),unsubscribe:async()=>{subscription=null;return true;}};return subscription;};
  });
  async function check(name,work){await work();passed.push(name);console.log('PASS '+name);}
  await page.goto(base+'/schedule');await page.waitForFunction(()=>document.querySelectorAll('.source-chip.ready').length===4);
  await page.locator('.match-row [data-action="follow"]').first().click();
  await page.locator('.main-nav [data-route="following"]').click();
  await page.locator('.following-reminder-heading [data-action="notifications"]').click();
  await check('Notification and calendar default off; visiting settings never requests permission',async()=>{
   assert.equal(await page.locator('#reminder-calendar').isChecked(),false);assert.equal(await page.evaluate(()=>window.__permissionRequests),0);assert.ok(await page.locator('[data-action="reminder-enable"]').isVisible());
  });
  await check('Granted permission immediately shows a disabled connecting button before subscription completes',async()=>{
   await page.locator('#reminder-minutes').fill('31');await page.locator('[data-action="reminder-save"]').click();
   const subscriptionPending=new Promise(resolve=>{subscriptionStarted=resolve;});
   subscriptionMode='delayed';await page.setViewportSize({width:390,height:900});
   try{
    await page.locator('[data-action="reminder-enable"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-action="reminder-enable"]')?.textContent.includes('已授权，连接中'));
    assert.equal(await page.locator('[data-action="reminder-enable"]').isDisabled(),true);
    assert.equal(await page.locator('.reminder-status.enabled').count(),0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('matchpoint:preferences:v2')).reminders.enabled),false);
    assert.equal(await page.evaluate(()=>window.__permissionRequests),1);
    await subscriptionPending;
   }finally{subscriptionMode='success';releaseSubscription?.();}
  });
  await check('Successful subscription shows a green enabled toggle and preserves custom minutes and official IDs',async()=>{
   await page.locator('.reminder-status.enabled').waitFor();
   assert.match(await page.locator('[data-action="reminder-disable"]').innerText(),/已开启 · 关闭提醒/);
   assert.equal(await page.locator('[data-action="reminder-disable"]').getAttribute('class'),'button primary is-enabled');
   await page.mouse.move(0,0);
   assert.equal(await page.locator('[data-action="reminder-disable"]').evaluate(button=>getComputedStyle(button).backgroundColor),'rgb(43, 117, 89)');
   assert.equal(await page.locator('[data-action="reminder-test"]').isVisible(),true);
   assert.equal(await page.evaluate(()=>window.__permissionRequests),1);assert.equal(updates.at(-1).minutes,31);assert.ok(updates.at(-1).matchIds[0].startsWith('valorant:'));assert.equal(updates.at(-1).startsAt,undefined);
  });
  await check('Calendar remains explicit and downloads official UTC start with chosen alarm',async()=>{
   await page.locator('#reminder-calendar').check();await page.locator('[data-action="reminder-save"]').click();await page.locator('.reminder-status.enabled').waitFor();await page.locator('[data-action="close"]').click();
   const downloadPromise=page.waitForEvent('download');await page.locator('.following-calendar-list [data-action="calendar"]').click();const download=await downloadPromise;
   const content=await fs.readFile(await download.path(),'utf8');assert.match(content,/DTSTART:20261003T090000Z/);assert.match(content,/TRIGGER:-PT31M/);assert.ok(download.suggestedFilename().endsWith('.ics'));
  });
  await check('Preset and invalid minutes have visible feedback; disabling notifications keeps calendar preference',async()=>{
   await page.locator('.notification-button').click();await page.locator('[data-action="reminder-preset"][data-minutes="5"]').click();assert.equal(await page.locator('#reminder-minutes').inputValue(),'5');
   await page.locator('#reminder-minutes').fill('0');await page.locator('[data-action="reminder-save"]').click();assert.match(await page.locator('.toast').last().innerText(),/1～1440/);
   await page.locator('[data-action="reminder-disable"]').click();await page.locator('[data-action="reminder-enable"]').waitFor();assert.equal(await page.locator('#reminder-calendar').isChecked(),true);
   assert.match(await page.locator('[data-action="reminder-enable"]').innerText(),/已授权 · 开启提醒/);
   await page.locator('#reminder-minutes').fill('31');
  });
  await check('Failed subscription with permission granted shows authorized retry instead of a false enabled state',async()=>{
   subscriptionMode='rejected';await page.locator('[data-action="reminder-enable"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-action="reminder-enable"]')?.textContent.includes('已授权 · 重试开启'));
   assert.match(await page.locator('.reminder-status b').innerText(),/已授权，提醒未连接/);
   assert.match(await page.locator('.reminder-status p').innerText(),/只允许在赛点内修改提醒/);
   assert.equal(await page.locator('[data-action="reminder-enable"]').isDisabled(),false);
   assert.equal(await page.locator('[data-action="reminder-test"]').count(),0);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('matchpoint:preferences:v2')).reminders.enabled),false);
   await fs.mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/reminders-authorized-retry.png'});
  });
  await check('Retry connects without requesting phone permission again; reopening settings retains the active button',async()=>{
   subscriptionMode='success';await page.locator('[data-action="reminder-enable"]').click();await page.locator('.reminder-status.enabled').waitFor();
   assert.equal(await page.evaluate(()=>window.__permissionRequests),1);
   await page.locator('[data-action="close"]').click();await page.locator('.notification-button').click();
   assert.match(await page.locator('[data-action="reminder-disable"]').innerText(),/已开启 · 关闭提醒/);
  });
  await check('Failed cancellation retries shutdown without re-enabling the device subscription',async()=>{
   const before=updates.length,removed=removals;removalRejected=true;await page.locator('[data-action="reminder-disable"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-action="reminder-disable"]')?.textContent.includes('已停止 · 重试关闭'));
   assert.match(await page.locator('.reminder-status b').innerText(),/本机通知已停止，取消待同步/);
   assert.equal(await page.locator('[data-action="reminder-enable"]').count(),0);
   removalRejected=false;await page.locator('[data-action="reminder-disable"]').click();
   await page.locator('[data-action="reminder-enable"]').waitFor();
   assert.equal(updates.length,before);assert.equal(removals,removed+2);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('matchpoint:preferences:v2')).reminders.enabled),false);
   await page.locator('[data-action="reminder-enable"]').click();await page.locator('.reminder-status.enabled').waitFor();
   assert.equal(await page.evaluate(()=>window.__permissionRequests),1);
  });
  await check('Dark and light reminder settings fit mobile widths without clipped controls',async()=>{
   for(const theme of ['dark','light']){
    if(await page.locator('html').getAttribute('data-theme')!==theme){await page.locator('[data-action="close"]').click();await page.locator('[data-action="theme"]').click();await page.locator('.notification-button').click();}
    for(const width of [320,390,768]){
     await page.setViewportSize({width,height:900});assert.ok(await page.locator('#reminder-minutes').isVisible());
     await page.mouse.move(0,0);assert.equal(await page.locator('[data-action="reminder-disable"]').evaluate(button=>getComputedStyle(button).backgroundColor),'rgb(43, 117, 89)');
     const metrics=await page.locator('#modal').evaluate(el=>{const modal=el.getBoundingClientRect();return {width:el.clientWidth,scroll:el.scrollWidth,controls:[...el.querySelectorAll('.reminder-actions button')].map(button=>{const bounds=button.getBoundingClientRect();return {inside:bounds.left>=modal.left&&bounds.right<=modal.right,width:button.clientWidth,scroll:button.scrollWidth};})};});
     assert.ok(metrics.scroll<=metrics.width+2&&metrics.controls.every(button=>button.inside&&button.scroll<=button.width+2),JSON.stringify({width,theme,metrics}));
     if(width===390)await page.screenshot({path:'docs/screenshots/reminders-mobile-'+theme+'.png'});
    }
   }
  });
  assert.deepEqual(errors,[]);await context.close();
  const ios=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',viewport:{width:390,height:844}}),iosPage=await ios.newPage();
  await iosPage.goto(base+'/following');await iosPage.locator('.notification-button').click();
  await check('iPhone browser before installation explains Home Screen requirement',async()=>{assert.match(await iosPage.locator('.reminder-status p').innerText(),/主屏幕/);assert.equal(await iosPage.locator('[data-action="reminder-enable"]').isDisabled(),true);});
  await ios.close();console.log('Browser reminder checks: '+passed.length+' passed. Push delivery here is stubbed; real iPhone delivery needs HTTPS/device verification.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
