// Domestic rooms checked against platform pages on 2026-10-03.
const domesticRooms={
  "valorant": [
    {
      "name": "虎牙 · 无畏契约赛事",
      "url": "https://www.huya.com/660679",
      "note": "赛事直播间 · 具体场次以平台安排为准"
    }
  ],
  "cs2": [
    {
      "name": "虎牙 · ESL CS2 主频道",
      "url": "https://www.huya.com/483917",
      "note": "ESL CS2 赛事直播间 · 具体场次以平台安排为准"
    },
    {
      "name": "虎牙 · CS2 海外赛事",
      "url": "https://www.huya.com/18525099",
      "note": "CS2 赛事直播间 · 具体场次以平台安排为准"
    }
  ],
  "lol": [
    {
      "name": "虎牙 · 英雄联盟赛事",
      "url": "https://www.huya.com/660000",
      "note": "赛事直播间 · 具体场次以平台安排为准"
    },
    {
      "name": "斗鱼 · 英雄联盟赛事",
      "url": "https://www.douyu.com/288016",
      "note": "赛事直播间 · 具体场次以平台安排为准"
    },
    {
      "name": "哔哩哔哩 · 英雄联盟赛事",
      "url": "https://live.bilibili.com/6",
      "note": "赛事直播间 · 具体场次以平台安排为准"
    }
  ],
  "apex": [
    {
      "name": "虎牙 · Apex 赛事",
      "url": "https://www.huya.com/657368",
      "note": "Apex 赛事直播间 · 具体场次以平台安排为准"
    }
  ]
};
const names={valorant:'无畏契约赛事',cs2:'CS2赛事',lol:'英雄联盟赛事',apex:'ALGS'};
export function watchLinks(match){const query=encodeURIComponent(names[match.game]);const portal={valorant:{name:'无畏契约中国官网',url:'https://val.qq.com/',note:'中国赛事官方入口 · 转播安排以官网为准'},lol:{name:'英雄联盟官方赛事直播',url:'https://lpl.qq.com/es/live.shtml',note:'中国赛事官方入口 · 转播安排以官网为准'},cs2:{name:'CS2 完美世界赛事中心',url:'https://www.csgo.com.cn/match',note:'国内官方赛事入口 · 可查看转播安排'},apex:{name:'EA · ALGS 官方赛事',url:'https://algs.ea.com/en',note:'官方赛事与直播安排 · 国际入口'}}[match.game];
 const official=[portal];if(match.externalStreamUrl&&/^https:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]+$/.test(match.externalStreamUrl))official.unshift({name:'赛事官方转播 · Twitch',url:match.externalStreamUrl,note:'由赛事官方赛程提供的频道 · 国际平台'});
 for(const s of match.streams||[]){const channel=s.parameter||s.channel;if(s.provider==='twitch'&&/^[a-zA-Z0-9_]+$/.test(channel))official.unshift({name:s.name||'官方转播 · Twitch',url:'https://www.twitch.tv/'+channel,note:'由官方赛程提供 · 国际平台'});}
 const thirdParty=[...(domesticRooms[match.game]||[]),{name:'虎牙',url:'https://www.huya.com/search?hsk='+query,note:'平台搜索 · 自行选择正在转播的直播间'},{name:'斗鱼',url:'https://www.douyu.com/search/?kw='+query,note:'平台搜索 · 自行选择正在转播的直播间'},{name:'哔哩哔哩',url:'https://search.bilibili.com/live?keyword='+query,note:'直播搜索 · 自行选择正在转播的直播间'}];
 if(match.game==='apex')thirdParty.unshift({name:'ShowHand · 斗鱼中文解说',url:'https://www.douyu.com/6828159',note:'EA 官网列出的中文解说频道 · 当前场次以主播安排为准'});
 return {official,thirdParty};}
