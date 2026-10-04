import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../src/calendar.js');
const match={id:'valorant:abc',status:'upcoming',game:'valorant',startsAt:'2026-10-05T12:30:00+08:00',event:'无畏契约冠军赛',stage:'总决赛',teams:['a','b'],sourceUrl:'https://valorantesports.com/'};
test('Calendar uses official UTC start and user selected alarm without inventing end time',async()=>{
 const {createCalendar}=await load(),ics=createCalendar(match,{minutes:30,teams:{a:{short:'EDG'},b:{short:'PRX'}},now:new Date('2026-10-04T00:00:00Z')});
 assert.match(ics,/DTSTART:20261005T043000Z/);assert.match(ics,/TRIGGER:-PT30M/);assert.match(ics,/SUMMARY:EDG VS PRX/);assert.ok(!ics.includes('DTEND'));assert.match(ics,/UID:.*@matchpoint/);assert.ok(ics.endsWith('\r\n'));
});
test('Calendar escapes untrusted text and folds UTF-8 lines to at most 75 bytes',async()=>{
 const {createCalendar}=await load(),ics=createCalendar({...match,event:'比赛'.repeat(60)+'\nBEGIN:BAD,;\\'},{minutes:15,teams:{},now:new Date('2026-10-04T00:00:00Z')});
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,line);assert.ok(!ics.includes('\r\nBEGIN:BAD'));assert.match(ics.replace(/\r\n /g,''),/\\nBEGIN:BAD\\,\\;\\\\/);
});
test('Calendar rejects unpublished, already started and invalid reminder times',async()=>{
 const {createCalendar}=await load();for(const minutes of [0,1441,1.5])assert.throws(()=>createCalendar(match,{minutes}),/分钟/);
 assert.throws(()=>createCalendar({...match,startsAt:'bad'},{minutes:15}),/时间/);
 assert.throws(()=>createCalendar({...match,status:'finished'},{minutes:15}),/未开始/);
 assert.throws(()=>createCalendar({...match,startsAt:'2020-01-01T00:00:00Z'},{minutes:15}),/未开始/);
});
