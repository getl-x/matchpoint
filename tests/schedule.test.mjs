import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../src/data.js';

globalThis.location={pathname:'/schedule'};
globalThis.localStorage={getItem:()=>null};
const {scheduleView}=await import('../src/views/schedule.js');
const match=(id,date,status,game='valorant')=>({id:game+':'+id,game,eventId:game+':event',event:'Official event',stage:'Finals',format:game==='apex'?'多队积分赛':'BO3',date,time:'23:30',startsAt:date+'T15:30:00Z',status,teams:game==='apex'?[]:['team-a','team-b'],score:game==='apex'||status==='upcoming'?null:[1,0]});
const settings=(date='2026-10-05',extra={})=>({route:'schedule',date,game:'all',event:'all',status:'all',search:'',follows:new Set(),feeds:{},sources:Object.fromEntries(GAMES.map(g=>[g.id,{status:'ready'}])),...extra});
const liveCount=html=>(html.match(/class="live-card"/g)||[]).length;
const rowCount=html=>(html.match(/class="match-row"/g)||[]).length;
function midnight(t){t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-04T16:05:00Z')});}

test('Today includes all four games still officially live after Beijing midnight',t=>{
 midnight(t);
 const matches=GAMES.map(g=>match('overnight','2026-10-04','live',g.id));
 const html=scheduleView(settings('2026-10-05',{status:'live'}),matches);
 assert.equal(liveCount(html),4);
 assert.ok(!html.includes('当前筛选没有已公布的比赛'));
 assert.ok(matches.every(m=>m.date==='2026-10-04'),'Original official start dates remain unchanged');
});

test('Today does not pull previous-day upcoming or finished matches into the schedule',t=>{
 midnight(t);
 const matches=[match('live','2026-10-04','live'),match('ended','2026-10-04','finished'),match('pending','2026-10-04','upcoming'),match('today','2026-10-05','upcoming'),match('future','2026-10-06','live')];
 const html=scheduleView(settings(),matches);
 assert.equal(liveCount(html),1);
 assert.equal(rowCount(html),1);
 assert.ok(html.includes('data-id="valorant:today"'));
 assert.ok(!html.includes('data-id="valorant:ended"'));
 assert.ok(!html.includes('data-id="valorant:pending"'));
 assert.ok(!html.includes('data-id="valorant:future"'));
});

test('Historical and future dates retain strict date filtering for live matches',t=>{
 midnight(t);
 const matches=[match('earlier','2026-10-03','live'),match('overnight','2026-10-04','live'),match('today','2026-10-05','live')];
 const historical=scheduleView(settings('2026-10-04'),matches);
 assert.equal(liveCount(historical),1);
 assert.ok(historical.includes('data-id="valorant:overnight"'));
 assert.ok(!historical.includes('data-id="valorant:earlier"'));
 assert.equal(liveCount(scheduleView(settings('2026-10-06'),matches)),0);
});

test('Cross-midnight live matches still respect game, event, search and follow filters',t=>{
 midnight(t);
 const matches=[match('vct','2026-10-04','live'),match('cs','2026-10-04','live','cs2')];
 assert.equal(liveCount(scheduleView(settings('2026-10-05',{game:'valorant',event:'valorant:event',search:'Official'}),matches)),1);
 assert.equal(liveCount(scheduleView(settings('2026-10-05',{event:'different-event'}),matches)),0);
 assert.equal(liveCount(scheduleView(settings('2026-10-05',{search:'no match'}),matches)),0);
 assert.equal(liveCount(scheduleView(settings('2026-10-05',{route:'following',follows:new Set(['cs2:cs'])}),matches)),1);
});

test('A finished overnight match remains on its start date and leaves today once official status updates',t=>{
 midnight(t);
 const matches=[match('overnight','2026-10-04','finished')];
 assert.equal(rowCount(scheduleView(settings(),matches)),0);
 assert.equal(rowCount(scheduleView(settings('2026-10-04'),matches)),1);
});
