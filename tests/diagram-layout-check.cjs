const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/getl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_URL||'http://localhost:4177';
const event='cs2:iem-cologne-major-2026';
(async()=>{
 const response=await fetch(base+'/api/archive/event?id='+encodeURIComponent(event));
 assert.equal(response.status,200);const official=await response.json();
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/archive?event='+encodeURIComponent(event));
  await page.waitForSelector('.archive-diagram .swiss .map-group',{timeout:55000});
  const read=()=>page.evaluate(()=>{
   const inside=(child,parent)=>{const a=child.getBoundingClientRect(),b=parent.getBoundingClientRect();return a.top>=b.top-.6&&a.left>=b.left-.6&&a.bottom<=b.bottom+.6&&a.right<=b.right+.6;};
   return {
    zoom:parseFloat(document.querySelector('[data-zoom-label]').textContent)/100,
    pageOverflow:document.documentElement.scrollWidth>innerWidth,
    groups:[...document.querySelectorAll('.swiss .map-group')].map(group=>{
     const header=group.querySelector('.map-group-heading');
     return {name:group.dataset.group,subtitleClipped:!inside(header.querySelector('small'),header),titleClipped:!inside(header.querySelector('h4'),header),footerClipped:!inside(group.querySelector('.map-group-footer'),group),matches:[...group.querySelectorAll('.map-match')].map(row=>({id:row.dataset.id,clipped:!inside(row,group),overflow:row.scrollHeight>row.clientHeight,truncatedNames:[...row.querySelectorAll('.map-team>span')].filter(x=>x.scrollWidth>x.clientWidth+1||x.scrollHeight>x.clientHeight+1).map(x=>x.textContent)}))};
    }),
    outcomes:[...document.querySelectorAll('.swiss .map-outcome')].map(node=>({name:node.dataset.outcome,clipped:[...node.querySelectorAll('h4,p,.map-outcome-teams>span')].filter(x=>!inside(x,node)).map(x=>x.textContent),truncatedNames:[...node.querySelectorAll('.map-outcome-teams b')].filter(x=>x.scrollWidth>x.clientWidth+1||x.scrollHeight>x.clientHeight+1).map(x=>x.textContent)})),
    overlapping:[...document.querySelectorAll('.swiss')].flatMap(canvas=>{
     const nodes=[...canvas.querySelectorAll('.map-node')],issues=[];
     for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)issues.push(nodes[i].textContent.slice(0,20)+' / '+nodes[j].textContent.slice(0,20));
     }return issues;
    })
   };
  });
  for(const width of [360,390,640,768,1024,1440]){
   await page.setViewportSize({width,height:1000});
   const result=await read();
   assert.ok(result.groups.length>0);assert.ok(!result.pageOverflow,width+': page overflow');
   for(const group of result.groups){
    assert.ok(!group.subtitleClipped,width+': '+group.name+' subtitle clipped');
    assert.ok(!group.titleClipped,width+': '+group.name+' title clipped');
    assert.ok(!group.footerClipped,width+': '+group.name+' footer clipped');
    for(const row of group.matches){assert.ok(!row.clipped&&!row.overflow,row.id+': match clipped');assert.deepEqual(row.truncatedNames,[],row.id+': team name clipped');}
   }
   for(const node of result.outcomes){assert.deepEqual(node.clipped,[],node.name+': outcome teams clipped');assert.deepEqual(node.truncatedNames,[],node.name+': outcome name clipped');}
   assert.deepEqual(result.overlapping,[]);assert.ok(result.zoom>=.85,width+': diagram shrunk below readable size');
   const ids=result.groups.flatMap(g=>g.matches.map(m=>m.id)).sort();
   const expected=official.feed.brackets.filter(b=>/^swiss-\d+$/.test(b.format)).flatMap(b=>b.groups.flatMap(g=>g.matchIds)).sort();
   assert.deepEqual(ids,expected,'Official group matches must remain complete');
   checks.push({width,zoom:result.zoom,groups:result.groups.length,matches:ids.length,outcomes:result.outcomes.length});
   console.log('PASS complete Swiss headers, match rows and outcome lists at '+width+'px');
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.swiss').first().screenshot({path:'docs/screenshots/swiss-complete-dark.png'});
  await page.locator('.swiss .map-outcome').first().screenshot({path:'docs/screenshots/swiss-outcome-complete.png'});
  await page.locator('.swiss .map-group').nth(1).screenshot({path:'docs/screenshots/swiss-group-complete.png'});
  await page.locator('.theme-toggle[data-action="theme"]').click();const light=await read();
  assert.ok(light.groups.every(g=>!g.subtitleClipped&&!g.titleClipped&&!g.footerClipped));assert.ok(light.outcomes.every(x=>!x.clipped.length));
  await page.locator('.swiss').first().screenshot({path:'docs/screenshots/swiss-complete-light.png'});
  await page.locator('.theme-toggle[data-action="theme"]').click();
  await page.setViewportSize({width:390,height:844});await page.locator('.swiss .map-group').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/screenshots/swiss-complete-mobile.png'});

  const membershipEvent='cs2:bounty-2026-season-2';
  const memberResponse=await fetch(base+'/api/archive/event?id='+encodeURIComponent(membershipEvent));assert.equal(memberResponse.status,200);const memberOfficial=await memberResponse.json();
  await page.goto(base+'/archive?event='+encodeURIComponent(membershipEvent));await page.waitForSelector('.membership .map-group',{timeout:55000});
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});
   const membership=await page.locator('.membership .map-group').evaluateAll(groups=>groups.map(group=>{
    const within=(child,parent)=>{const a=child.getBoundingClientRect(),b=parent.getBoundingClientRect();return a.top>=b.top-.5&&a.bottom<=b.bottom+.5;};
    const header=group.querySelector('.map-group-heading'),list=group.querySelector('.map-matches');
    return {name:header.querySelector('h4').textContent,subtitleClipped:!within(header.querySelector('small'),header),titleClipped:!within(header.querySelector('h4'),header),footerClipped:!within(group.querySelector('.map-group-footer'),group),internalScroll:list.scrollHeight>list.clientHeight+1,matches:[...list.querySelectorAll('.map-match')].map(row=>({id:row.dataset.id,clipped:!within(row,group),namesClipped:[...row.querySelectorAll('.map-team>span')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent)}))};
   }));
   assert.ok(membership.some(g=>g.matches.length>8),'Official large group regression must exceed the old eight-row cap');
   for(const group of membership){assert.ok(!group.subtitleClipped&&!group.titleClipped&&!group.footerClipped&&!group.internalScroll,group.name+': large group clipped');for(const row of group.matches){assert.ok(!row.clipped);assert.deepEqual(row.namesClipped,[]);}}
   assert.deepEqual(membership.flatMap(g=>g.matches.map(m=>m.id)).sort(),memberOfficial.feed.matches.map(m=>m.id).sort());
   await page.locator('.membership .map-match').last().scrollIntoViewIfNeeded();
   assert.ok(await page.locator('.membership .map-match').last().isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log('PASS full '+membership.flatMap(g=>g.matches).length+' official membership matches, including 24-row group, at '+width+'px');
  }
  await page.screenshot({path:'docs/screenshots/large-group-complete.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await fs.writeFile('docs/diagram-layout-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),officialEvent:event,checks,lightMode:true,largeOfficialGroup:{event:membershipEvent,matches:memberOfficial.feed.matches.length,noNestedScroll:true},uncaughtErrors:errors},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
