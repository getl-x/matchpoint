const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright'),engine=process.env.PLAYWRIGHT_BROWSER||'chromium';
const games=['cs2','lol','valorant','apex'];
const eventNames={cs2:'2026 ESL 职业联赛第24赛季',lol:'2026 北美职业联赛升降级赛 · 季后赛',valorant:'2026 VCT 欧洲、中东及非洲联赛 · 改变者全球冠军资格赛',apex:'ALGS 第6年 · 亚太北部赛区 · 分赛2职业联赛赛区决赛'};
function fixture(game){
 const eventId=game+':layout-event',names={cs2:['spirit','1win'],lol:['paiN Gaming Academy','Vivo Keyd Stars'],valorant:['KRÜ BLAZE','GentleMatesGameChangers']};
 const teams=Object.fromEntries((names[game]||[]).map((name,i)=>[game+':team-'+i,{id:game+':team-'+i,name,short:name,mark:name.slice(0,2),color:'#7d62c6'}]));
 const make=(id,status,extra={})=>({id:game+':'+id,game,eventId,event:eventNames[game],stage:'小组赛 · A组对B组',format:game==='apex'?'多队积分赛':'BO3',date:'2026-10-06',time:'23:30',startsAt:'2026-10-06T15:30:00Z',status,teams:game==='apex'?[]:[game+':team-0',game+':team-1'],score:game==='apex'||status==='upcoming'?null:[0,1],sourceUrl:'https://example.com/official-fixture',...extra});
 const matches=[make('live','live'),make('finished','finished',{time:'00:30',score:game==='apex'?null:[2,1]}),make('upcoming','upcoming',{startOverdue:true})];
 if(game==='cs2'){
  teams['cs2:long-team']={id:'cs2:long-team',name:'Ninjas in Pyjamas',short:'Ninjas in Pyjamas',mark:'NIP',color:'#7d62c6'};
  matches.push(make('second-live','live',{teams:['cs2:team-0','cs2:long-team']}));
 }
 if(game==='valorant')matches.push(make('unknown','unknown',{teams:[null,null],score:null}));
 matches.push(make('tomorrow','upcoming',{date:'2026-10-07',startsAt:'2026-10-07T15:30:00Z'}));
 return {game,source:{name:'Official-shaped layout fixture',url:'https://example.com/official-fixture',retrievedAt:'2026-10-06T13:11:00Z'},events:[{id:eventId,game,name:eventNames[game],nameZh:eventNames[game],live:true}],matches,teams};
}

// Inspect rendered text, not just root scrollWidth: a card can hide overflow while
// the document itself fits perfectly, and absolute status labels can cover text.
async function layoutIssues(page,liveOnly=false){
 return page.evaluate(liveOnly=>{
  const issues=[],epsilon=1.5;
  const rect=el=>el.getBoundingClientRect();
  const inside=(a,b)=>a.left>=b.left-epsilon&&a.right<=b.right+epsilon&&a.top>=b.top-epsilon&&a.bottom<=b.bottom+epsilon;
  const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>epsilon&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>epsilon;
  const label=el=>el.className+': '+el.textContent.trim().slice(0,80);
  function siblings(nodes){for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(overlap(rect(nodes[i]),rect(nodes[j])))issues.push('Overlap '+label(nodes[i])+' / '+label(nodes[j]));}
  if(document.documentElement.scrollWidth>innerWidth+epsilon)issues.push('Document overflows horizontally');
  for(const owner of document.querySelectorAll(liveOnly?'.live-card':'.schedule-hero,.live-card,.match-row,.section-caption,.status-tabs,.filter-selects')){
   const bounds=rect(owner);
   if(bounds.left<0||bounds.right>innerWidth+epsilon)issues.push('Off-screen '+label(owner));
   const walker=document.createTreeWalker(owner,NodeFilter.SHOW_TEXT);
   let node;
   while(node=walker.nextNode()){
    if(!node.textContent.trim()||node.parentElement.closest('svg,.select-popover'))continue;
    const range=document.createRange();range.selectNodeContents(node);
    for(const r of range.getClientRects()){
     if(r.width===0||r.height===0)continue;
     if(!inside(r,bounds))issues.push('Text outside '+label(owner)+': '+node.textContent.trim());
     for(let parent=node.parentElement;parent&&parent!==owner;parent=parent.parentElement){
      const style=getComputedStyle(parent);
      if((style.overflowX!=='visible'||style.overflowY!=='visible')&&!inside(r,rect(parent)))issues.push('Clipped text in '+label(parent));
     }
    }
   }
  }
  for(const card of document.querySelectorAll('.live-card')){
   siblings([...card.querySelector('.live-card-top').children]);
   siblings([...card.querySelector('.live-card-bottom').children]);
   siblings([...card.querySelector('.live-teams').children]);
  }
  if(!liveOnly)for(const row of document.querySelectorAll('.match-row')){
   siblings([...row.children].filter(el=>getComputedStyle(el).display!=='none'));
   siblings([...row.querySelector('.match-teams').children]);
   const small=row.querySelector('.match-time small'),range=document.createRange();range.selectNodeContents(small);
   if(range.getClientRects().length!==1)issues.push('Broken time label: '+small.textContent);
   if(rect(row.querySelector('.match-time')).left<rect(row).left+8)issues.push('Time touches the game-color rail');
  }
  return [...new Set(issues)];
 },liveOnly);
}

async function modalInViewport(page){
 const geometry=await page.locator('dialog[open]').evaluate(dialog=>{
  const viewport=visualViewport,box=dialog.getBoundingClientRect(),close=dialog.querySelector('.modal-close').getBoundingClientRect(),heading=dialog.querySelector('.modal-league,h2').getBoundingClientRect(),header=document.createRange();header.selectNodeContents(dialog.querySelector('.modal-eyebrow'));
  return {box:box.toJSON(),close:close.toJSON(),heading:heading.toJSON(),header:[...header.getClientRects()].map(rect=>rect.toJSON()),left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0,width:viewport?.width||innerWidth,height:viewport?.height||innerHeight,scrollTop:dialog.scrollTop};
 });
 for(const name of ['box','close','heading']){
  const box=geometry[name];
  assert.ok(box.left>=geometry.left-1&&box.right<=geometry.left+geometry.width+1&&box.top>=geometry.top-1&&box.bottom<=geometry.top+geometry.height+1,name+' must be visible in the current viewport: '+JSON.stringify(geometry));
 }
 for(const text of geometry.header)assert.ok(Math.min(text.right,geometry.close.right)-Math.max(text.left,geometry.close.left)<=1||Math.min(text.bottom,geometry.close.bottom)-Math.max(text.top,geometry.close.top)<=1,'The close button must not cover the match header');
}
const scrollPosition=page=>page.evaluate(()=>({x:scrollX,y:scrollY}));

(async()=>{
 const {createAppServer}=await import('../server.mjs'),{loadConfig}=await import('../server/config.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'matchpoint-mobile-layout-')),feeds=Object.fromEntries(games.map(game=>[game,fixture(game)]));
 const config=loadConfig({MATCHPOINT_DATA_DIR:root,MATCHPOINT_ARCHIVE_SYNC:'false'});
 const app=createAppServer({config,readFeed:async game=>feeds[game],logos:{decorateFeed:async feed=>feed},reminders:{config:async()=>({publicKey:Buffer.alloc(65).toString('base64url')})}});
 let browser;
 const passed=[],failed=[];
 async function check(name,work){
  if(process.env.TEST_FILTER&&!new RegExp(process.env.TEST_FILTER).test(name))return;
  const context=await browser.newContext({viewport:{width:428,height:926},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-06T13:11:00Z')});
  try{await work({context,page});assert.deepEqual(errors,[]);passed.push(name);console.log('PASS '+name);}
  catch(error){failed.push({name,error:error.message});console.error('FAIL '+name+': '+error.message.slice(0,1800));}
  finally{await context.close();}
 }
 try{
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}:{})});
  const loaded=page=>page.waitForFunction(()=>document.querySelectorAll('.source-chip.ready').length===4);
  await fs.mkdir('docs/screenshots',{recursive:true});
  for(const theme of ['dark','light'])for(const width of [320,360,375,390,414,428,640])await check(theme+' '+width+'px: full text and controls fit across all four games',async({context,page})=>{
   await context.addInitScript(theme=>localStorage.setItem('matchpoint:preferences:v2',JSON.stringify({version:2,game:'all',theme})),theme);
   await page.setViewportSize({width,height:926});await page.goto(base+'/schedule');await loaded(page);
   assert.equal(await page.locator('.live-card').count(),5);assert.equal(await page.locator('.match-row').count(),9);
   if(width===428&&theme==='dark')await page.locator('.schedule-panel').screenshot({path:'docs/screenshots/mobile-layout-428'+(engine==='chromium'?'':'-'+engine)+'.png'});
   assert.deepEqual(await layoutIssues(page),[]);
  });
  for(const width of [768,1024,1440,1920])await check(width+'px: live cards stay readable on tablets and desktops',async({page})=>{
   await page.setViewportSize({width,height:1080});await page.goto(base+'/schedule');await loaded(page);
   // Desktop tables intentionally abbreviate event names; validate the live cards separately.
   assert.deepEqual(await layoutIssues(page,true),[]);
  });
  await check('Mobile status filters, details and follow controls remain usable',async({page})=>{
   await page.goto(base+'/schedule');await loaded(page);
   const chooseGame=async game=>{await page.locator('.game-select summary').click();await page.locator('[data-action="select-game"][data-game="'+game+'"]').click();};
   for(const game of games){
    await chooseGame(game);
    await page.locator('[data-action="status"][data-status="live"]').click();
    assert.equal(await page.locator('.live-card').count(),game==='cs2'?2:1);
    assert.deepEqual(await layoutIssues(page),[]);
    const card=page.locator('.live-card').first();await card.locator('[data-action="follow"]').click();
    assert.equal(await page.locator('dialog[open]').count(),0);
    await card.locator('.live-card-body').click();await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('.modal-league').innerText(),new RegExp(eventNames[game].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    await page.locator('[data-action="close"]').click();
    for(const status of ['upcoming','finished']){
     await page.locator('[data-action="status"][data-status="'+status+'"]').click();assert.equal(await page.locator('.match-row').count(),1);
     assert.deepEqual(await layoutIssues(page),[]);
    }
    await page.locator('[data-action="status"][data-status="all"]').click();
   }
   await chooseGame('all');await page.locator('.match-row [data-action="follow"]').first().click();
   await page.locator('.mobile-nav [data-route="following"]').click();assert.equal(await page.locator('.live-card').count(),4);assert.equal(await page.locator('.match-row').count(),1);
   assert.deepEqual(await layoutIssues(page),[]);
   await page.locator('.match-row [data-action="follow"]').click();assert.equal(await page.locator('.match-row').count(),0);
  });
  await check('Selected mobile event names and large match counts do not get clipped',async({page})=>{
   await page.setViewportSize({width:320,height:926});await page.goto(base+'/schedule');await loaded(page);
   await page.locator('.event-select summary').click();await page.locator('[data-action="select-event"][data-event="valorant:layout-event"]').click();
   await page.locator('.status-tabs button>span').evaluateAll(spans=>spans.forEach(span=>span.textContent='1234'));
   assert.deepEqual(await layoutIssues(page),[]);
  });
  for(const viewport of [{width:320,height:640},{width:390,height:844},{width:428,height:926},{width:1440,height:900}])await check(viewport.width+'px: opening and closing scrolled match rows preserves the reading position',async({page})=>{
   await page.setViewportSize(viewport);await page.goto(base+'/schedule');await loaded(page);
   for(const game of games){
    const row=page.locator('.match-row[data-id="'+game+':finished"]');
    await row.evaluate(el=>el.scrollIntoView({block:'center'}));const before=await scrollPosition(page),rowBox=await row.boundingBox();assert.ok(before.y>300);
    await row.click();await modalInViewport(page);assert.deepEqual(await scrollPosition(page),before);
    assert.deepEqual(await row.boundingBox(),rowBox,'Locking page scroll must not reflow the selected match');
    await page.locator('dialog').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.deepEqual(await scrollPosition(page),before,'Scrolling match details must not move the page');
    await page.locator('.modal-close').click();assert.equal(await page.locator('dialog[open]').count(),0);
    assert.deepEqual(await scrollPosition(page),before,'Closing details must return to the same match');
   }
  });
  await check('Scrolled live cards, repeated openings and viewport resizing keep details on screen',async({page})=>{
   await page.goto(base+'/schedule');await loaded(page);
   for(const game of ['cs2','lol','apex']){
    const card=page.locator('.live-card-body[data-id="'+game+':live"]');
    await card.evaluate(el=>el.scrollIntoView({block:'center'}));const before=await scrollPosition(page);
    await card.click();await modalInViewport(page);assert.deepEqual(await scrollPosition(page),before);
    assert.equal(await page.locator('dialog').evaluate(el=>el.scrollTop),0,'Each new match opens at its heading');
    await page.setViewportSize({width:428,height:600});await modalInViewport(page);
    await page.locator('dialog').evaluate(el=>el.scrollTop=el.scrollHeight);await page.locator('.modal-close').click();
    await page.setViewportSize({width:428,height:926});
   }
   await page.locator('.live-card-body[data-id="cs2:live"]').click();await modalInViewport(page);
   await page.screenshot({path:'docs/screenshots/mobile-match-modal'+(engine==='chromium'?'':'-'+engine)+'.png'});
   await page.locator('.modal-close').click();
  });
  await check('Closing a dialog restores an off-screen focus target without jumping to the top',async({page})=>{
   await page.goto(base+'/schedule');await loaded(page);await page.locator('#search').focus();
   // Let the input's native focus scroll finish before setting a deliberate reading position.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const row=page.locator('.match-row[data-id="cs2:finished"]');
   await row.evaluate(el=>el.scrollIntoView({block:'center'}));const before=await scrollPosition(page);assert.ok(before.y>300);
   // A mobile tap or programmatic click can leave focus in an off-screen input.
   await row.evaluate(el=>el.click());await modalInViewport(page);
   assert.deepEqual(await scrollPosition(page),before,'Opening details must also preserve scroll when focus remains in an input');
   await page.locator('.modal-close').click();assert.deepEqual(await scrollPosition(page),before);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'search');
  });
  await check('Escape and backdrop dismissal preserve page position; background wheel scrolling is blocked',async({page})=>{
   await page.goto(base+'/schedule');await loaded(page);
   const row=page.locator('.match-row[data-id="lol:finished"]');await row.evaluate(el=>el.scrollIntoView({block:'center'}));const before=await scrollPosition(page);
   await row.click();await modalInViewport(page);
   await page.mouse.move(2,200);await page.mouse.wheel(0,500);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.deepEqual(await scrollPosition(page),before,'The background must not scroll behind the modal');
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(await scrollPosition(page),before);
   await row.click();await modalInViewport(page);await page.mouse.click(2,200);
   assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(await scrollPosition(page),before);
  });
  await check('Navigating from a scrolled match dialog starts the new page at the top',async({page})=>{
   await page.goto(base+'/schedule');await loaded(page);
   const row=page.locator('.match-row[data-id="cs2:finished"]');await row.evaluate(el=>el.scrollIntoView({block:'center'}));assert.ok((await scrollPosition(page)).y>300);
   await row.click();await page.locator('[data-action="open-bracket"]').click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(new URL(page.url()).pathname,'/bracket');assert.equal(await page.locator('dialog[open]').count(),0);
   assert.deepEqual(await scrollPosition(page),{x:0,y:0},'Closing the old dialog must not undo intentional navigation');
  });
  await fs.writeFile('docs/mobile-layout'+(engine==='chromium'?'':'-'+engine)+'-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),engine,passed,failed},null,2));
  assert.deepEqual(failed.map(failure=>failure.name),[]);console.log('Mobile layout browser checks: '+passed.length+' passed.');
 }finally{
  if(browser)await browser.close();await new Promise(resolve=>{app.close(resolve);app.closeAllConnections();});await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
