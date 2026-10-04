import test from 'node:test';
import assert from 'node:assert/strict';
import {safeLogoURL,teamLogoSources} from '../src/logo-sources.js';
import {team} from '../server/providers/common.mjs';
import {badge} from '../src/components.js';
import {TEAMS} from '../src/data.js';
test('Only verified official image hosts accept HTTPS, with upgrades for their published HTTP and relative-protocol URLs',()=>{
 assert.equal(safeLogoURL('http://static.lolesports.com/teams/logo.png'),'https://static.lolesports.com/teams/logo.png');
 assert.equal(safeLogoURL('//img.crawler.qq.com/lolwebvideo/123/0'),'https://img.crawler.qq.com/lolwebvideo/123/0');
 for(const url of ['https://attacker.example/logo.png','http://localhost/logo','https://127.0.0.1/logo','https://static.lolesports.com@attacker.example/logo','data:image/svg+xml,test','javascript:alert(1)','https://static.lolesports.com:9999/teams/logo'])assert.equal(safeLogoURL(url),null);
});
test('Official domestic VCT dark/light variants preserve the correct colors for their background',()=>{
 const sources=teamLogoSources({teamDarkLogo:'https://esports.val.qq.com/val/gen/team/EDG_white.png',teamLightLogo:'https://esports.val.qq.com/val/gen/team/EDG_black.png'},'valorant');
 assert.ok(sources.dark.includes('white'));assert.ok(sources.light.includes('black'));
});
test('Live Riot, ALGS, domestic LoL and CS metadata resolve actual official team assets',()=>{
 assert.equal(teamLogoSources({image:'http://static.lolesports.com/teams/FUT.png'},'valorant').dark,'https://static.lolesports.com/teams/FUT.png');
 assert.equal(teamLogoSources({logoDark:'https://content.algstools.com/white.png',logoLight:'https://content.algstools.com/black.png'},'apex').light,'https://content.algstools.com/black.png');
 assert.ok(teamLogoSources({TeamLogo:'//img.crawler.qq.com/lolwebvideo/123/0'},'lol').dark);
 assert.ok(teamLogoSources({id:'f239109c-ffef-4e83-830e-5ca340ee432b'},'cs2').dark.startsWith('https://assets.blast.tv/images/teams/f239109c-ffef-4e83-830e-5ca340ee432b'));
 assert.deepEqual(teamLogoSources({id:'../../private'},'cs2'),{});
});
test('Normalized team metadata retains logo source URLs without changing team identity or names',()=>{
 const teams={},id=team('abc',{id:'abc',name:'Paper Rex',code:'PRX',image:'http://static.lolesports.com/teams/PRX.png'},'valorant',teams);
 assert.equal(id,'valorant:abc');assert.equal(teams[id].short,'PRX');assert.equal(teams[id].logos.dark,'https://static.lolesports.com/teams/PRX.png');
});
test('Badges render only local cached assets, retain an accessible adjacent-name fallback and do not embed arbitrary remote images',()=>{
 TEAMS['valorant:logo-test']={name:'Test',short:'T',mark:'T',color:'#abc',logos:{dark:'/assets/team-logo-aabb.svg',light:'/assets/team-logo-ccdd.png'}};
 try{const html=badge('valorant:logo-test');assert.ok(html.includes('class="team-logo team-logo-dark"'));assert.ok(html.includes('/assets/team-logo-aabb.svg'));assert.ok(html.includes('team-logo-fallback'));assert.ok(html.includes('data-team-badge="valorant:logo-test"'));
 TEAMS['valorant:logo-test'].logos={dark:'https://attacker.example/logo.png'};assert.ok(!badge('valorant:logo-test').includes('<img'));assert.ok(!badge(null).includes('<img'));
 }finally{delete TEAMS['valorant:logo-test'];}
});
