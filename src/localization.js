// Chinese display labels only. Match IDs, participants, times and results stay untouched.
const regions={Americas:'美洲赛区',America:'美洲赛区','North America':'北美赛区','Asia Pacific North':'亚太北部赛区','Asia Pacific South':'亚太南部赛区','Europe Middle East and Africa':'欧洲、中东及非洲赛区',EMEA:'欧洲、中东及非洲赛区',Pacific:'太平洋赛区',Global:'全球赛区',NA:'北美赛区',BR:'巴西赛区',LATAM:'拉丁美洲赛区',CN:'中国赛区'};
const cities={Shanghai:'上海',London:'伦敦',Paris:'巴黎',Berlin:'柏林',Seoul:'首尔',Bangkok:'曼谷',Santiago:'圣地亚哥','São Paulo':'圣保罗',Bucharest:'布加勒斯特',Belgrade:'贝尔格莱德',Budapest:'布达佩斯',Katowice:'卡托维兹',Cologne:'科隆',Austin:'奥斯汀'};
const number=n=>({1:'一',2:'二',3:'三',4:'四',5:'五',6:'六'}[n]||n);
function seasonLabel(text,game){return String(text||'').replace(/\bStage (\d+)\b/gi,(_,n)=>'第'+number(n)+'赛段').replace(/\bSplit (\d+) Playoffs\b/gi,(_,n)=>'分赛'+n+'季后赛').replace(/\bSplit (\d+) Pro League\b/gi,(_,n)=>'分赛'+n+'职业联赛').replace(/\bSplit (\d+)\b/gi,(_,n)=>game==='apex'?'分赛'+n:'第'+number(n)+'赛段').replace(/\bSeason Finals\b/gi,'赛季总决赛').replace(/\bSummer\b/gi,'夏季赛').replace(/\bSpring\b/gi,'春季赛').replace(/\bWinter\b/gi,'冬季赛').replace(/\bFall\b/gi,'秋季赛').trim();}
export function eventName(game,value,yearHint=''){
 const original=String(value||''),parts=original.split(/\s*·\s*/),year=original.match(/\b(20\d{2})\b/)?.[1]||String(yearHint||''),withoutYear=t=>t.replace(/\b20\d{2}\b/g,'').replace(/\s+/g,' ').trim(),prefix=year?year+' ':'';
 if(!original||/[\u3400-\u9fff]/.test(original))return original;
 if(game==='valorant'){
  const league=parts[0],season=withoutYear(parts.slice(1).join(' · '));
  if(league==='Champions'){const city=season.replace(/^Champions\s*/i,'');return prefix+'无畏契约'+(cities[city]||city)+'全球冠军赛';}
  if(league==='Masters'){const city=season.replace(/^Masters\s*/i,'');return prefix+'无畏契约'+(cities[city]||city)+'大师赛';}
  if(league==='Game Changers Championship')return prefix+'无畏契约改变者全球冠军赛';
  const gc=league.match(/^Game Changers (.+)$/);if(gc){const area=(regions[gc[1]]||gc[1]).replace(/赛区$/,'');return prefix+'无畏契约'+area+'改变者赛'+(season?' · '+seasonLabel(season,game):'');}
  const vct=league.match(/^VCT (.+)$/);if(vct){const area=(regions[vct[1]]||vct[1]).replace(/赛区$/,'');return prefix+'VCT '+area+'联赛'+(season?' · '+seasonLabel(season,game):'');}
 }
 if(game==='lol'){
  const leagues={DCGI:'德玛西亚杯国际邀请赛',WSCI:'全球挑战者之星邀请赛',CBLOL:'巴西职业联赛（CBLOL）',LCS:'北美职业联赛（LCS）',LPL:'英雄联盟职业联赛（LPL）',LCK:'韩国职业联赛（LCK）',LEC:'欧洲职业联赛（LEC）',LCP:'亚太职业联赛（LCP）','EMEA Masters':'欧洲、中东及非洲大师赛','CBLOL Promotion':'巴西职业联赛升降级赛','LCS Promotion':'北美职业联赛升降级赛','Asian Games':'亚运会英雄联盟项目',Worlds:'英雄联盟全球总决赛',MSI:'英雄联盟季中冠军赛','First Stand':'英雄联盟全球先锋赛'};
  if(leagues[parts[0]]){const season=seasonLabel(withoutYear(parts.slice(1).join(' · ')),game);return prefix+leagues[parts[0]]+(season?' · '+season:'');}
 }
 if(game==='cs2'){
  let m=original.match(/^ESL Pro League Season (\d+)\s*(20\d{2})?$/i);if(m)return prefix+'ESL 职业联赛第'+m[1]+'赛季';
  m=original.match(/^StarLadder StarSeries (Fall|Spring|Summer|Winter)\s*(20\d{2})?$/i);if(m)return prefix+'StarLadder 星系列赛'+seasonLabel(m[1],game);
  m=original.match(/^PGL (?:Masters )?(.+?)\s+(20\d{2})$/i);if(m)return prefix+'PGL '+(cities[m[1]]||m[1])+(/Masters/i.test(original)?'大师赛':'赛事');
  m=original.match(/^IEM (.+?)\s+(20\d{2})$/i);if(m)return prefix+'IEM '+(cities[m[1]]||m[1])+'站';
  const translated=original.replace(/\bBLAST Premier\b/g,'BLAST 超级联赛').replace(/\bBLAST Open\b/g,'BLAST 公开赛').replace(/\bBLAST Bounty\b/g,'BLAST 赏金赛').replace(/\bSeason (\d+)\b/gi,'第$1赛季');if(translated!==original)return translated;
 }
 if(game==='apex'){return 'ALGS '+parts.map(part=>{const y=part.match(/^Year (\d+)$/);if(y)return '第'+y[1]+'年';return regions[part]||seasonLabel(part,game).replace(/Pro League Qualifier/gi,'职业联赛资格赛').replace(/Last Chance Qualifier/gi,'最后机会资格赛').replace(/Championship/gi,'全球冠军赛');}).join(' · ');}
 return seasonLabel(original,game);
}
const stageTerms=[['3rd Place Playoff','季军赛'],['Third Place Decider','季军争夺战'],['3rd Place Decider','季军争夺战'],['Quarter Final','八强赛'],['Quarterfinals','八强赛'],['Quarterfinal','八强赛'],['Semi Final','半决赛'],['Semifinals','半决赛'],['Semifinal','半决赛'],['Grand Final','总决赛'],['Match Point Finals','赛点制决赛'],['Regional Finals','赛区决赛'],['Regional Final','赛区决赛'],['Regional Qualifier','赛区资格赛'],['Group Stage','小组赛'],['Group Finals','小组决赛'],['Survival Stage','生存赛阶段'],['Bracket Stage','淘汰赛阶段'],['Elimination Round','淘汰轮'],['Winners Round','胜者组'],['Losers Round','败者组'],['Upper Bracket','胜者组'],['Lower Bracket','败者组'],['Knockouts','淘汰赛'],['Knockout','淘汰赛'],['Groups','小组赛'],['Finals','决赛'],['Swiss','瑞士轮'],['Regular Season','常规赛'],['Round Robin','循环赛'],['Pro League','职业联赛'],['Last Chance Qualifier','最后机会资格赛'],['Pro League Qualifier','职业联赛资格赛'],['Qualification','资格赛'],['Round','轮次'],['Lobby','组'],['Match','对局']].sort((a,b)=>b[0].length-a[0].length);
export function stageName(value,game=''){
 let text=seasonLabel(value,game);if(!text)return '阶段待公布';
 text=text.replace(/\b([0-3])-([0-3]) Match (\d+)\b/gi,'$1胜$2负组 · 第$3场').replace(/\bWinners Round (\d+)(?: Lobby ([A-Z]))?\b/gi,(_,n,group)=>'胜者组第'+n+'轮'+(group?' · '+group+'组':'')).replace(/\bElimination Round (\d+)\b/gi,'淘汰轮第$1轮');
 text=text.replace(/\bGroup ([A-Z]) vs ([A-Z])\b/gi,'$1组对$2组').replace(/\bGroup ([A-Z])\b/gi,'$1组').replace(/\bPlayoffs\b/gi,game==='cs2'?'淘汰赛':'季后赛');
 for(const [en,cn] of stageTerms)text=text.replace(new RegExp('\\b'+en+'\\b','gi'),cn);
 text=text.replace(/\b([0-3]):([0-3])\b/g,'$1胜$2负组');
 return [...new Set(text.split(/\s*·\s*/).filter(Boolean))].join(' · ');
}
export function formatName(value){const text=String(value||'');let m=text.match(/^single-elim-(\d+)$/);if(m)return m[1]+'队单败淘汰赛';m=text.match(/^double-elim-(\d+)$/);if(m)return m[1]+'队双败淘汰赛';m=text.match(/^swiss-(\d+)$/);if(m)return m[1]+'队瑞士轮';return {custom:'官方自定义赛制'}[text]||text;}
export function localizeEvent(event,yearHint=''){
 const originalName=event.originalName||event.name;const name=event.nameZh||eventName(event.game,originalName,event.year||yearHint);return {...event,name,originalName,namingType:event.nameZh?'official':name!==originalName?'translation':'original'};
}
export function localizeMatch(match,event){const originalEvent=match.originalEvent||match.event,originalStage=match.originalStage||match.stage,originalMatchName=match.originalMatchName||match.matchName;return {...match,event:event?.name||eventName(match.game,originalEvent,match.date?.slice(0,4)),originalEvent,stage:stageName(originalStage,match.game),originalStage,matchName:originalMatchName?stageName(originalMatchName,match.game):match.matchName,originalMatchName,namingType:event?.namingType||'translation',nameSource:event?.nameSource,format:formatName(match.format)};}
