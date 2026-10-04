const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/getl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_URL||'http://localhost:4177';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1040},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),checks=[],errors=[],imageResponses=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/assets/team-logo-'))imageResponses.push({url:r.url(),status:r.status(),type:r.headers()['content-type']});});
  const feeds=Object.fromEntries(await Promise.all(['valorant','lol','cs2','apex'].map(async game=>{const r=await fetch(base+'/api/feed?game='+game);assert.equal(r.status,200);return [game,await r.json()];})));
  const synced=()=>page.waitForFunction(()=>document.querySelectorAll('.source-chip.ready').length>0,{},{timeout:55000});
  const selectGame=async game=>{await page.locator('.game-select summary').click();await page.locator('[data-action="select-game"][data-game="'+game+'"]').click();};
  const loaded=async selector=>{await page.waitForFunction(selector=>{const badges=[...document.querySelectorAll(selector+' .has-logo')],mode=document.documentElement.dataset.theme;return badges.length>0&&badges.every(b=>{const img=b.querySelector('.team-logo-'+mode);return img?.complete&&img.naturalWidth>0&&b.classList.contains('logo-ready-'+mode);});},selector,{timeout:35000});};
  const readImages=selector=>page.locator(selector+' [data-team-badge]').evaluateAll(es=>es.map(e=>({id:e.dataset.teamBadge,dark:e.querySelector('.team-logo-dark')?.getAttribute('src'),light:e.querySelector('.team-logo-light')?.getAttribute('src')})));
  async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
  await page.goto(base+'/schedule');await synced();
  const today=await page.locator('[data-action="pick-date"]').inputValue();
  const selected={};
  await check('real VALORANT, LoL and CS2 schedules use logos matched by official team ID',async()=>{
   for(const game of ['valorant','lol','cs2']){
    const f=feeds[game],m=f.matches.find(m=>m.date===today&&m.teams?.length===2&&m.teams.every(id=>f.teams[id]?.logos?.dark?.startsWith('/assets/')))||f.matches.find(m=>m.teams?.length===2&&m.teams.every(id=>f.teams[id]?.logos?.dark?.startsWith('/assets/')));assert.ok(m,game+' has readable official teams');selected[game]=m;
    await selectGame(game);await page.locator('[data-action="pick-date"]').fill(m.date);const selector='.match-row[data-id="'+m.id+'"]';await loaded(selector);
    const images=await readImages(selector);assert.deepEqual(images.map(i=>i.id),m.teams);for(const image of images){assert.equal(image.dark,f.teams[image.id].logos.dark);assert.ok(f.teams[image.id].logoSources.dark.startsWith('https://'));}
   }
  });
  await selectGame('valorant');await page.locator('[data-action="pick-date"]').fill(selected.valorant.date);await loaded('.match-row');await page.screenshot({path:'docs/screenshots/official-team-logos-schedule.png',fullPage:true});
  await check('match details retain official scores and show larger official logos',async()=>{const m=selected.valorant;await page.locator('.match-row[data-id="'+m.id+'"]').click();await loaded('.detail-teams');assert.deepEqual((await readImages('.detail-teams')).map(i=>i.id),m.teams);assert.ok((await page.locator('.detail-score').innerText()).includes(m.score?m.score[0]+':'+m.score[1]:'VS'));await page.locator('[data-action="close"]').click();});
  await check('mobile schedule has loaded logos without page overflow',async()=>{await page.setViewportSize({width:390,height:844});await loaded('.match-row');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'docs/screenshots/official-team-logos-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1040});});
  await check('theme toggles show only the correct official variant and persist',async()=>{await page.locator('[data-action="theme"]').click();await loaded('.match-row');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');assert.ok(await page.locator('.match-row .has-logo').evaluateAll(es=>es.every(e=>getComputedStyle(e.querySelector('.team-logo-dark')).display==='none'&&getComputedStyle(e.querySelector('.team-logo-light')).display!=='none')));await page.screenshot({path:'docs/screenshots/official-team-logos-light.png',fullPage:true});await page.reload();await synced();await loaded('.match-row');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.locator('[data-action="theme"]').click();});
  await check('historical native VALORANT logos retain dark/light assets, contrast and the final routes',async()=>{
   const event='valorant:cn:1000066',saved=await (await fetch(base+'/api/archive/event?id='+event)).json();await page.goto(base+'/archive?event='+event);await page.waitForSelector('.elimination-canvas',{timeout:55000});await loaded('.elimination-canvas');
   const images=await readImages('.elimination-canvas');assert.equal(images.length,28);for(const i of images){assert.equal(i.dark,saved.feed.teams[i.id].logos.dark);assert.equal(i.light,saved.feed.teams[i.id].logos.light);}
   const prx=page.locator('.elimination-canvas [data-team-badge="valorant:cn:58"]').first();assert.equal(await prx.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(217, 223, 234)');
   const final=page.locator('.elimination-canvas [data-id="valorant:cn:1002186"]');assert.equal(await page.locator('.elimination-canvas [data-to="valorant:cn:1002186"]').count(),2);assert.ok((await final.innerText()).includes('决赛'));
   await page.locator('.elimination-canvas').scrollIntoViewIfNeeded();await loaded('.elimination-canvas');await page.screenshot({path:'docs/screenshots/official-team-logos-bracket.png'});await page.locator('[data-action="theme"]').click();await loaded('.elimination-canvas');assert.equal(await prx.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(37, 41, 55)');await page.screenshot({path:'docs/screenshots/official-team-logos-bracket-light.png'});await page.locator('[data-action="theme"]').click();
  });
  await check('APEX standings use official badges without changing positions, kills or points',async()=>{
   await page.goto(base+'/bracket');await synced();await page.locator('.game-select summary').click();await page.locator('[data-action="bracket-game"][data-game="apex"]').click();const eventId=feeds.apex.events.find(e=>e.name.includes('Asia Pacific North')).id;await page.locator('.event-select summary').click();await page.locator('[data-action="bracket-event"][data-event="'+eventId+'"]').click();await page.waitForSelector('.apex-team-row',{timeout:55000});
   const table=await page.locator('.apex-team-row').evaluateAll(es=>es.map(e=>({id:e.querySelector('[data-team-badge]').dataset.teamBadge,position:Number(e.querySelector('.rank-number').textContent),points:Number(e.querySelector('strong').textContent),kills:e.children[2].textContent})));
   const id=table[0].id;assert.ok(id.startsWith('apex:'));await loaded('.apex-table-wrap');
   const data=await (await fetch(base+'/api/standings?event='+eventId)).json();const official=data.phases.flatMap(p=>p.rows);
   for(const row of table){const source=official.find(t=>t.id===row.id&&t.position===row.position&&t.points===row.points);assert.ok(source,'published ALGS row retained for '+row.id);assert.equal(row.kills,String(source.kills??'—'));}
   await page.screenshot({path:'docs/screenshots/official-team-logos-apex.png'});
  });
  await check('offline reload preserves already-viewed official logo images',async()=>{
   await page.goto(base+'/schedule');await synced();await selectGame('valorant');await page.locator('[data-action="pick-date"]').fill(selected.valorant.date);await loaded('.match-row');await page.waitForFunction(()=>navigator.serviceWorker.controller);
   await page.waitForFunction(async()=>{const imgs=[...document.querySelectorAll('.match-row .team-logo-dark')];return imgs.length>0&&(await Promise.all(imgs.map(i=>caches.match(i.src)))).every(Boolean);});
   await context.setOffline(true);await page.reload();await loaded('.match-row');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await context.setOffline(false);
  });
  await check('failed image requests show team initials while match details still work',async()=>{
   const failureContext=await browser.newContext({serviceWorkers:'block'}),p=await failureContext.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('**/assets/team-logo-*',r=>r.abort());await p.goto(base+'/schedule');await p.waitForFunction(()=>document.querySelectorAll('.source-chip.ready').length===4,{},{timeout:55000});await p.locator('.game-select summary').click();await p.locator('[data-action="select-game"][data-game="valorant"]').click();await p.locator('[data-action="pick-date"]').fill(selected.valorant.date);
   await p.waitForFunction(()=>document.querySelectorAll('.match-row .team-logo-dark.is-broken').length>0);assert.ok(await p.locator('.match-row .has-logo').evaluateAll(es=>es.every(e=>getComputedStyle(e.querySelector('.team-logo-fallback')).display!=='none'&&!e.classList.contains('logo-ready-dark'))));await p.locator('[data-action="theme"]').click();assert.ok(await p.locator('.match-row .has-logo').evaluateAll(es=>es.every(e=>getComputedStyle(e.querySelector('.team-logo-light')).display==='none'&&getComputedStyle(e.querySelector('.team-logo-fallback')).display!=='none')));await p.locator('.match-row[data-id="'+selected.valorant.id+'"]').click();assert.ok(await p.locator('.watch-heading').isVisible());await failureContext.close();
  });
  await check('all displayed images are same-origin, successfully loaded and served as images',async()=>{assert.ok(imageResponses.length>50);assert.ok(imageResponses.every(r=>r.url.startsWith(base+'/assets/team-logo-')&&r.status===200&&r.type?.startsWith('image/')));assert.deepEqual(errors,[]);});
  const manifest=await (await fetch(base+'/assets/team-logos.json')).json(),counts={};for(const id of Object.keys(manifest.teams)){const game=id.split(':')[0];counts[game]=(counts[game]||0)+1;}
  await fs.writeFile('docs/team-logo-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),checks,cachedOfficialTeams:counts,imageResponses:imageResponses.length,uncaughtErrors:errors},null,2)+String.fromCharCode(10));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
