const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/getl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_URL||'http://localhost:4177',event='valorant:cn:1000066',final='valorant:cn:1002186';
(async()=>{
 const saved=await (await fetch(base+'/api/archive/event?id='+event)).json(),browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/archive?event='+event);await page.waitForSelector('.elimination-canvas',{timeout:55000});
  const canvas=page.locator('.elimination-canvas');
  const read=()=>canvas.evaluate(canvas=>{
   const nodes=[...canvas.querySelectorAll('.duel-card')].map(n=>({id:n.dataset.id,x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight,score:n.querySelector('.duel-versus b').textContent,label:n.querySelector('.duel-card-meta>span').textContent,clipped:[...n.children].some(c=>c.getBoundingClientRect().bottom>n.getBoundingClientRect().bottom+.5)}));
   const edges=[...canvas.querySelectorAll('[data-edge-kind]')].map(n=>({from:n.dataset.from,to:n.dataset.to,kind:n.dataset.edgeKind,outcome:n.dataset.outcome,team:n.dataset.teamId}));
   return {nodes,edges,overflow:document.documentElement.scrollWidth>innerWidth,zoom:parseFloat(document.querySelector('[data-zoom-label]').textContent)/100};
  });
  for(const width of [360,390,640,768,1024,1600]){
   await page.setViewportSize({width,height:1100});const report=await read(),node=report.nodes.find(n=>n.id===final);
   assert.equal(report.nodes.length,14);assert.ok(report.nodes.filter(n=>n!==node).every(n=>n.x<node.x));
   assert.deepEqual(report.edges.filter(e=>e.to===final).map(e=>e.from).sort(),['valorant:cn:1002183','valorant:cn:1002185']);
   assert.equal(report.edges.filter(e=>e.kind==='stage-entry').length,4);assert.ok(!report.edges.some(e=>e.from==='stage-root'&&e.to===final));
   assert.equal(report.edges.filter(e=>e.kind==='confirmed-advancement').length,20);
   for(const e of report.edges.filter(e=>e.kind==='confirmed-advancement')){const a=saved.feed.matches.find(m=>m.id===e.from),b=saved.feed.matches.find(m=>m.id===e.to);assert.ok(b.teams.includes(e.team));assert.equal(e.team,e.outcome==='win'?a.winner:a.teams.find(t=>t!==a.winner));}
   assert.ok(report.nodes.every(n=>!n.clipped));assert.ok(!report.overflow);assert.ok(report.zoom>=.85);
   for(let i=0;i<report.nodes.length;i++)for(let j=i+1;j<report.nodes.length;j++){const a=report.nodes[i],b=report.nodes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
   const card=canvas.locator('[data-id="'+final+'"]');await card.scrollIntoViewIfNeeded();await card.click();assert.equal(await page.locator('.watch-group').count(),2);await page.locator('[data-action="close"]').click();
   checks.push({width,finalAtRight:true,firstRoundEntries:4,confirmedPaths:20,noOverlap:true});console.log('PASS progressive final, true finalist paths and match details at '+width+'px');
  }
  await page.setViewportSize({width:1600,height:1100});
  await canvas.locator('[data-id="'+final+'"]').scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/london-final-right.png'});
  const markup=await canvas.evaluate(n=>n.outerHTML),preview=await browser.newPage({viewport:{width:2460,height:1280}});
  await preview.setContent('<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="'+base+'/styles.css"></head><body>'+markup+'</body></html>');
  await preview.locator('.elimination-canvas').evaluate(n=>n.style.transform='none');
  await preview.locator('.elimination-canvas').screenshot({path:'docs/screenshots/london-progressive-bracket.png'});await preview.close();
  await page.locator('.theme-toggle').click();assert.ok((await read()).nodes.every(n=>!n.clipped));await page.locator('.theme-toggle').click();
  const download=page.waitForEvent('download');await page.locator('[data-action="archive-export"]').click();const file=await download,exported=JSON.parse(await fs.readFile(await file.path(),'utf8'));
  assert.deepEqual(exported.feed.matches,saved.feed.matches);const stage=exported.diagrams.events.flatMap(e=>e.stages).find(s=>s.layout.type==='elimination');assert.ok(stage);assert.equal(stage.layout.edges.filter(e=>e.to===final).length,2);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.context().setOffline(true);await page.reload();await page.waitForSelector('.elimination-canvas');assert.equal((await read()).edges.filter(e=>e.to===final).length,2);await page.context().setOffline(false);
  assert.deepEqual(errors,[]);await fs.writeFile('docs/elimination-browser-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),officialEvent:event,checks,lightMode:true,offline:true,exportPreservesResults:true,uncaughtErrors:errors},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
