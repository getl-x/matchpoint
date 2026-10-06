const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://localhost:4177';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],passed=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/schedule');
  await page.waitForFunction(()=>document.querySelectorAll('.source-chip.ready').length===4,{},{timeout:55000});
  const feeds=await page.evaluate(()=>JSON.parse(localStorage.getItem('matchpoint:official-cache:v1')).feeds);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const current=m=>m.date===today||(m.status==='live'&&m.date<today);
  const lives=Object.values(feeds).flatMap(f=>f.matches).filter(m=>current(m)&&m.status==='live');
  const chooseGame=async game=>{await page.locator('.game-select summary').click();await page.locator('[data-action="select-game"][data-game="'+game+'"]').click();};
  async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
  await check('All four official feeds finish without partial or stale status data',async()=>{
   for(const game of ['cs2','lol','valorant','apex']){assert.ok(feeds[game].source.retrievedAt);assert.ok(!feeds[game].stale&&!feeds[game].partial);}
  });
  await check('The live section and live tab contain exactly the officially live matches',async()=>{
   const ids=await page.locator('.live-card-body').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
   assert.deepEqual(ids.sort(),lives.map(m=>m.id).sort());
   await page.locator('[data-action="status"][data-status="live"]').click();
   assert.equal(await page.locator('.match-row').count(),0);
   assert.equal(await page.locator('.live-card-body').count(),lives.length);
   assert.equal((await page.locator('[data-action="status"][data-status="live"] span').textContent()).trim(),String(lives.length));
  });
  await check('Game filters keep each game’s official live count, including zero-match states',async()=>{
   for(const game of ['cs2','lol','valorant','apex']){await chooseGame(game);assert.equal(await page.locator('.live-card-body').count(),lives.filter(m=>m.game===game).length,game);}
   await chooseGame('all');
  });
  await check('CS2 official live cards preserve absent scores and the published status provenance',async()=>{
   // The bracket may have caught up since the last read; a correction is not always needed.
   const currentCS2=feeds.cs2.matches.filter(m=>current(m)&&m.status==='live');
   for(const m of currentCS2){
    const card=page.locator('.live-card').filter({has:page.locator('[data-id="'+m.id+'"]')});
    await card.waitFor();assert.ok((await card.locator('.live-pill').innerText()).includes('LIVE'));
    if(!m.score)assert.equal((await card.locator('.live-score b').innerText()).trim(),'VS');
    await card.locator('.live-card-body').click();
    assert.ok((await page.locator('.detail-score .status').innerText()).includes('进行中'));
    assert.equal(await page.locator('.modal-footnote a').getAttribute('href'),m.statusSource?.url||m.sourceUrl);
    await page.locator('[data-action="close"]').click();
   }
  });
  await check('Finished and upcoming matches do not leak into the live section or tab',async()=>{
   await page.locator('[data-action="status"][data-status="all"]').click();
   const ids=await page.locator('.match-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
   const byId=new Map(Object.values(feeds).flatMap(f=>f.matches).map(m=>[m.id,m]));
   assert.ok(ids.every(id=>byId.get(id).status!=='live'));
   await fs.mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/live-status-fixed.png',fullPage:true});
  });
  await check('Live cards remain accessible on a 390px mobile screen without horizontal overflow',async()=>{
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.locator('.live-card-body').count(),lives.length);
   await page.screenshot({path:'docs/screenshots/live-status-mobile.png',fullPage:true});
  });
  await check('No uncaught browser errors during status filtering and details',async()=>assert.deepEqual(errors,[]));
  await fs.writeFile('docs/live-status-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),passed,errors,counts:Object.fromEntries(Object.entries(feeds).map(([g,f])=>[g,{total:f.matches.length,live:f.matches.filter(m=>m.status==='live').length,overdue:f.matches.filter(m=>m.startOverdue).length}])),corrected:feeds.cs2.matches.filter(m=>m.statusSource).map(m=>({id:m.id,status:m.status,teams:m.teams.map(id=>feeds.cs2.teams[id]?.name),statusSource:m.statusSource}))},null,2));
  console.log(passed.length+' live status browser checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
