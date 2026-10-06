import {refreshTeamLogos,markTeamLogoLoaded} from './team-logos.js';
import {GAMES,GAME,TEAMS,today} from './data.js';
import {state,getMatches,getEvents,nearestEvent,save,acceptFeed,saveArchive,acceptArchiveIndex,acceptArchiveEvent} from './state.js';
import {icon,gameIcon,escape} from './ui.js';
import {badge,teamName,statusLabel,dateAdd} from './components.js';
import {scheduleView} from './views/schedule.js';
import {bracketView} from './views/bracket.js';
import {archiveView} from './views/archive.js';
import {watchLinks} from './watch.js';
import {createReminderController,reminderSettingsView} from './reminders.js';
import {downloadCalendar} from './calendar.js';
import {createAppUpdater} from './app-update.js';
const root=document.querySelector('#app'),dialog=document.querySelector('#modal');
let installEvent=null,lastFocus=null,detailId=null,archiveRequest=null,archiveReadAt=0,archiveUrlOpened=false;
let reminderModal=false,pendingMatch=location.pathname==='/following'?new URL(location.href).searchParams.get('match'):null,currentDay=today(),modalScrollPosition=null;
const reminders=createReminderController({state,save,onChange:()=>{if(reminderModal&&dialog.open)renderReminderSettings(true);if(state.route==='following')renderContent();}});
function renderReminderSettings(preserveDraft=false){
 const minutes=preserveDraft&&dialog.querySelector('#reminder-minutes'),calendar=dialog.querySelector('#reminder-calendar');
 const focused=dialog.contains(document.activeElement)?document.activeElement:null;
 const draft=minutes?{minutes:minutes.value,calendar:calendar.checked,focus:focused?{id:focused.id,action:focused.dataset.action,minutes:focused.dataset.minutes}:null}:null;
 openModal(reminderSettingsView(state,reminders.support()));
 if(draft){
  dialog.querySelector('#reminder-minutes').value=draft.minutes;dialog.querySelector('#reminder-calendar').checked=draft.calendar;
  dialog.querySelectorAll('.reminder-presets button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.minutes)===Number(draft.minutes))));
  if(draft.focus){
   const target=draft.focus.id?document.getElementById(draft.focus.id):[...dialog.querySelectorAll('[data-action]')].find(button=>button.dataset.action===draft.focus.action&&button.dataset.minutes===draft.focus.minutes);
   target?.focus({preventScroll:true});
  }
 }
}
function showReminderSettings(){detailId=null;reminderModal=true;renderReminderSettings();}
function reminderForm(){const minutes=Number(document.querySelector('#reminder-minutes').value);if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('请输入 1～1440 的整数分钟数');return {minutes,calendar:document.querySelector('#reminder-calendar').checked};}
async function reminderAction(action){
 try{
  if(action==='enable'){Object.assign(state.reminders,reminderForm());if(!save())throw new Error('设置无法保存，请允许浏览器存储');await reminders.enable();toast('已开启关注比赛的开赛提醒');}
  if(action==='disable'){await reminders.disable();toast('已关闭通知提醒');}
  if(action==='save'){await reminders.setPreferences(reminderForm());toast('提醒设置已保存');}
  if(action==='test'){await reminders.test();toast('测试通知已提交，请查看系统通知');}
 }catch(error){toast(error.message);}
}
function openRequestedMatch(){if(pendingMatch&&getMatches().some(m=>m.id===pendingMatch)){const id=pendingMatch;pendingMatch=null;showDetail(id);}}
function nav(route,name,i) {return `<a class="nav-link ${state.route===route?'active':''}" href="/${route}" data-action="navigate" data-route="${route}">${icon(i)}<span>${name}</span>${route==='following'&&state.follows.size?`<b>${state.follows.size}</b>`:''}${state.route===route?'<i></i>':''}</a>`;}
function shell() {
 return `<aside class="sidebar"><a href="/schedule" class="brand" data-action="navigate" data-route="schedule"><span class="brand-symbol"><img src="/assets/mark.svg" alt=""/></span><span><b>赛点<span>.</span></b><small>MATCHPOINT</small></span></a><div class="sidebar-section-label">你的赛事主场</div><nav class="main-nav">${nav('schedule','赛程中心','calendar')}${nav('bracket','晋级之路','bracket')}${nav('archive','赛事存档','trophy')}${nav('following','我的关注','star')}</nav><div class="sidebar-divider"></div><div class="sidebar-section-label game-heading">热门游戏 <span>4</span></div><nav class="game-nav">${GAMES.map(g=>`<button class="game-nav-item ${state.game===g.id?'selected':''}" style="--game:${g.color}" data-action="sidebar-game" data-game="${g.id}"><span class="sidebar-game-icon" style="--game:${g.color};--soft:${g.soft}">${gameIcon(g.id)}</span><span>${escape(g.name)}</span>${getMatches().some(m=>m.game===g.id&&m.status==='live')?'<i class="live-indicator"></i>':''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="install-card"><span class="install-card-icon">${icon('download')}</span><b>热爱，随时在线</b><p>将赛点添加到桌面<br>下一场，一触即达。</p><button data-action="install">安装赛点 ${icon('arrow')}</button></div><button class="sidebar-settings" data-action="about">${icon('globe')}关于赛点<span>v1.1</span></button></div></aside><div class="app-main"><header class="topbar"><div class="breadcrumb"><span class="mobile-brand"><img src="/assets/mark.svg" alt="赛点"/></span><span>赛事空间</span>${icon('right')}<b>${state.route==='bracket'?'晋级之路':state.route==='archive'?'赛事存档':state.route==='following'?'我的关注':'赛程中心'}</b></div><div class="topbar-right"><label class="search-box">${icon('search')}<input id="search" type="search" autocomplete="off" placeholder="搜索队伍、赛事…" aria-label="搜索队伍或赛事" value="${escape(state.search)}"/><kbd>/</kbd></label><span class="connection-state" id="connection"><i></i>${navigator.onLine?'官方公开数据':'离线 · 已缓存'}</span><button class="theme-toggle app-update-button" data-action="update-app" aria-label="更新应用" title="更新应用">${icon('refresh')}</button><button class="theme-toggle" data-action="theme" aria-label="${state.theme==='dark'?'切换浅色模式':'切换深色模式'}" title="${state.theme==='dark'?'切换浅色模式':'切换深色模式'}">${icon(state.theme==='dark'?'sun':'moon')}</button><button class="notification-button" data-action="notifications" aria-label="开赛提醒设置">${icon('bell')}${state.follows.size?'<i></i>':''}</button><span class="user-avatar" title="本地访客">M</span></div></header><main id="content">${contentView()}</main><nav class="mobile-nav">${nav('schedule','赛程','calendar')}${nav('bracket','晋级图','bracket')}${nav('archive','存档','trophy')}${nav('following','关注','star')}</nav></div>`;
}
function updateDay(){const next=today();if(next!==currentDay){if(state.date===currentDay)state.date=next;currentDay=next;}}
function render() {updateDay();root.innerHTML=shell();syncBracketZoom();ensureStandings();ensureArchive();document.title=`${state.route==='bracket'?'晋级之路':state.route==='archive'?'赛事存档':state.route==='following'?'我的关注':'赛程中心'} · 赛点 Matchpoint`;}
function renderContent() {updateDay();document.querySelector('#content').innerHTML=contentView();syncBracketZoom();ensureStandings();}

function toast(message){const el=document.createElement('div');el.className='toast';el.innerHTML=icon('check')+'<span>'+escape(message)+'</span>';document.querySelector('#toasts').append(el);setTimeout(()=>el.remove(),3600);}
function showAppUpdate(available){
 const existing=document.querySelector('.app-update-notice');
 if(!available){existing?.remove();return;}if(existing)return;
 const notice=document.createElement('div');notice.className='app-update-notice';notice.setAttribute('role','status');
 notice.innerHTML='<span>赛点有新版本</span><button class="button primary compact" data-action="update-app">更新应用 '+icon('refresh')+'</button>';
 document.body.append(notice);
}
const appUpdater=createAppUpdater({onChange:showAppUpdate});
// Native focus restoration must not move the reader; intentional navigation still starts at the top.
function restoreModalScroll(){if(modalScrollPosition&&state.route===modalScrollPosition.route)window.scrollTo({left:modalScrollPosition.x,top:modalScrollPosition.y,behavior:'instant'});}
function openModal(html){
 const opening=!dialog.open;
 if(opening){
  lastFocus=document.activeElement;modalScrollPosition={x:scrollX,y:scrollY,route:state.route};
  document.documentElement.style.setProperty('--modal-scrollbar-width',Math.max(0,innerWidth-document.documentElement.clientWidth)+'px');
 }
 dialog.innerHTML='<button class="modal-close" data-action="close" aria-label="关闭弹窗">'+icon('close')+'</button>'+html;
 if(opening){dialog.showModal();dialog.scrollTop=0;restoreModalScroll();}
}
function closeModal(){detailId=null;reminderModal=false;dialog.close();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});restoreModalScroll();}
function navigate(route,push=true){if(!['schedule','bracket','archive','following'].includes(route))route='schedule';state.route=route;state.search='';state.status='all';if(route==='following'){state.game='all';state.event='all';}if(route==='bracket'&&state.game!=='all')state.bracketGame=state.game;if(push)history.pushState({},'', '/'+route);render();window.scrollTo({top:0});}
function linkGroup(title,links){return '<section class="watch-group"><h3>'+title+'</h3><div class="watch-links">'+links.map((l,i)=>'<a class="watch-link" href="'+escape(l.url)+'" target="_blank" rel="noopener noreferrer"><span class="watch-logo">'+(title==='官方渠道'?icon('check'):icon('play'))+'</span><span><b>'+escape(l.name)+'</b><small>'+escape(l.note)+'</small></span>'+icon('arrow')+'</a>').join('')+'</div></section>';}
function originalNameInfo(m){if(!m.originalEvent||m.originalEvent===m.event)return '';const source=m.nameSource;return '<details class="original-name-info"><summary>查看赛事原名与中文名称来源 '+icon('chevron')+'</summary><p>赛事原名：'+escape(m.originalEvent)+'</p>'+(m.originalStage!==m.stage?'<p>阶段原名：'+escape(m.originalStage)+'</p>':'')+'<p>'+(m.namingType==='official'&&source?.url?'<a href="'+escape(source.url)+'" target="_blank" rel="noopener noreferrer">中文名称采用'+escape(source.name)+'</a>':'海外赛事采用中文译名，保留原名供核对。')+'</p></details>';}
function showDetail(id){reminderModal=false;const saved=state.route==='archive'&&state.archive.selected&&state.archive.loaded[state.archive.selected],historical=saved&&getMatches({[saved.record.game]:saved.feed}).find(m=>m.id===id),m=historical||getMatches().find(m=>m.id===id);if(!m)return;detailId=id;const source=historical?{...saved.feed.source,status:'ready'}:state.sources[m.game],apex=m.game==='apex',links=watchLinks(m);
 openModal('<div class="modal-eyebrow">MATCH DETAILS <span>官方公开赛程</span></div><div class="modal-league">'+escape(m.event)+'</div><p class="modal-subtitle">'+escape(m.stage)+' · '+escape(m.format)+'</p>'+originalNameInfo(m)+(apex?'<div class="apex-detail-heading"><span class="selector-mark" style="--game:#d96c69">'+gameIcon('apex')+'</span><h3>多队积分赛</h3>'+statusLabel(m.status)+'</div><p class="detail-note">'+(m.totalMaps?'官方已公布 '+m.totalMaps+' 局，已完成 '+m.completedMaps+' 局。':'局数以官方公布为准。')+'参赛队与排名请查看官方积分榜。</p>':'<div class="detail-teams"><div>'+badge(m.teams[0],'xl')+'<h3>'+teamName(m.teams[0])+'</h3><p>'+escape(TEAMS[m.teams[0]]?.name||'对阵尚未公布')+'</p></div><div class="detail-score"><b>'+(m.score?m.score[0]+'<span>:</span>'+m.score[1]:'VS')+'</b>'+statusLabel(m.status)+'</div><div>'+badge(m.teams[1],'xl')+'<h3>'+teamName(m.teams[1])+'</h3><p>'+escape(TEAMS[m.teams[1]]?.name||'对阵尚未公布')+'</p></div></div>')+'<div class="detail-info"><span>开赛时间<b>'+m.date+' '+m.time+'（北京时间）</b></span><span>数据来源<b>'+escape(source.name||'官方赛事页面')+'</b></span></div><div class="watch-heading"><h2>观看比赛</h2><span>'+ (m.status==='finished'?'比赛已结束 · 可前往查看回放':m.status==='upcoming'?'尚未开始 · 可提前选择平台':'平台转播安排以直播间为准')+'</span></div>'+linkGroup('官方渠道',links.official)+linkGroup('第三方平台',links.thirdParty)+'<p class="watch-note">官方页面与平台搜索入口已分别标注。具体场次、版权及是否正在直播，请以平台安排为准。</p><div class="detail-actions"><button class="button secondary" data-action="follow" data-id="'+escape(m.id)+'">'+icon('star')+(state.follows.has(m.id)?'取消关注':'关注比赛')+'</button><button class="button primary" data-action="open-bracket" data-game="'+m.game+'" data-event="'+escape(m.eventId)+'">'+icon('bracket')+(apex?'查看官方积分':'查看晋级之路')+'</button></div><p class="modal-footnote">'+(source.status==='cached'?'缓存数据 · 更新失败 · ':'')+'读取时间：'+escape(source.retrievedAt?new Date(source.retrievedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未公布')+' · <a href="'+escape(m.sourceUrl)+'" target="_blank" rel="noopener noreferrer">查看原始官方页面</a></p>');
 if(m.status==='upcoming'&&Date.parse(m.startsAt)>Date.now())dialog.querySelector('.detail-actions').insertAdjacentHTML('afterend','<div class="detail-reminder-links"><button data-action="notifications">'+icon('bell')+'设置开赛提醒</button><button data-action="calendar" data-id="'+escape(m.id)+'">'+icon('calendar')+'添加日历提醒（可选）</button></div>');
}
async function requestJSON(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'官方数据暂时不可读');return data;}
async function refreshFeeds(){if(state.refreshing)return;state.refreshing=true;renderContent();await Promise.allSettled(GAMES.map(async g=>{try{acceptFeed(g.id,await requestJSON('/api/feed?game='+g.id));}catch(error){state.sources[g.id]={...state.sources[g.id],status:state.feeds[g.id]?'cached':'error',error:navigator.onLine?error.message:'网络已断开，显示上次读取的官方数据'};}renderContent();if(dialog.open&&detailId)showDetail(detailId);openRequestedMatch();}));state.refreshing=false;renderContent();}
async function ensureStandings(){if(state.route!=='bracket'||state.bracketGame!=='apex'||!state.bracketEvent)return;const id=state.bracketEvent;if(state.standings[id])return;state.standings[id]={status:'loading'};try{const data=await requestJSON('/api/standings?event='+encodeURIComponent(id));for(const p of data.phases)Object.assign(TEAMS,p.teams);state.standings[id]={...data,status:'ready'};try{localStorage.setItem('matchpoint:apex-cache:'+id,JSON.stringify(data));}catch{}}catch(error){let cached;try{cached=JSON.parse(localStorage.getItem('matchpoint:apex-cache:'+id));}catch{}state.standings[id]=cached?.retrievedAt?{...cached,status:'ready',stale:true}:{status:'error',error:error.message};if(cached)for(const p of cached.phases)Object.assign(TEAMS,p.teams);}if(state.route==='bracket'&&state.bracketEvent===id)renderContent();}
function applyTheme(){document.documentElement.dataset.theme=state.theme;document.querySelector('meta[name="theme-color"]').content=state.theme==='dark'?'#101118':'#f8f9fc';}
async function install() {
 if(installEvent){await installEvent.prompt();const choice=await installEvent.userChoice;installEvent=null;if(choice.outcome==='accepted')toast('已提交安装，桌面见！');return;}
 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 openModal(`<div class="install-modal-icon"><img src="/assets/mark.svg" alt=""/></div><div class="modal-eyebrow">TAKE THE GAME WITH YOU</div><h2>${standalone?'赛点已经在你的桌面':'把热爱，带到桌面。'}</h2><p class="modal-subtitle">像应用一样打开赛点，随时查看下一场比赛。</p>${standalone?'<p class="detail-note">你正在独立应用窗口中使用赛点。</p>':`<div class="install-steps"><div><span>01</span><p>在 iPhone 的 <b>Safari</b> 中打开赛点</p></div><div><span>02</span><p>点按${icon('share')}<b>分享</b>按钮</p></div><div><span>03</span><p>选择 <b>添加到主屏幕</b>，然后点按添加</p></div></div><p class="detail-note">电脑端可在支持安装的浏览器菜单中选择「安装赛点」或「将页面安装为应用」。手机安装需要通过 HTTPS 地址访问；当前为本机预览。</p>`}<button class="button primary full" data-action="close">知道了 ${icon('check')}</button>`);
}

async function handleAction(button){const d=button.dataset;updateDay();
 switch(d.action){
 case 'navigate':navigate(d.route);break;
 case 'archive-game':state.archive.game=d.game;state.archive.year='all';state.archive.page=0;renderContent();break;
 case 'archive-filter':state.archive.filter=d.filter;state.archive.page=0;renderContent();break;
 case 'archive-page':state.archive.page=Math.max(0,state.archive.page+Number(d.offset));renderContent();break;
 case 'archive-open':await openArchive(d.event);break;
 case 'archive-back':state.archive.selected=null;state.archive.error=null;history.replaceState({},'','/archive');renderContent();break;
 case 'archive-sync':await loadArchiveIndex(true);break;
 case 'archive-export':exportArchive();break;
 case 'sidebar-game':if(state.route==='archive'){state.archive.game=d.game;state.archive.year='all';state.archive.page=0;state.archive.selected=null;renderContent();break;}state.game=d.game;state.event='all';state.bracketGame=d.game;state.bracketEvent=null;save();render();break;
 case 'select-game':state.game=d.game;state.event='all';save();render();break;
 case 'select-event':state.event=d.event;renderContent();break;
 case 'bracket-game':state.bracketGame=d.game;state.game=d.game;state.bracketEvent=null;state.zoom=1;state.zoomFit=true;save();render();break;
 case 'bracket-event':state.bracketEvent=d.event;state.zoomFit=true;renderContent();break;
 case 'select-date':state.date=d.date;renderContent();break;
 case 'pick-date':break;
 case 'shift-week':state.date=dateAdd(state.date,Number(d.offset));renderContent();break;
 case 'today':state.date=today();renderContent();break;
 case 'nearest-date':{const matches=getMatches().filter(m=>(state.game==='all'||m.game===state.game)&&(state.event==='all'||m.eventId===state.event));matches.sort((a,b)=>Math.abs(Date.parse(a.startsAt)-Date.parse(state.date+'T12:00:00+08:00'))-Math.abs(Date.parse(b.startsAt)-Date.parse(state.date+'T12:00:00+08:00')));if(matches.length){state.date=matches[0].date;state.status='all';state.search='';render();}else toast('当前来源尚未提供可查看的赛程');break;}
 case 'status':state.status=d.status;renderContent();break;
 case 'reset-filters':state.game='all';state.event='all';state.status='all';state.search='';render();break;
 case 'detail':showDetail(d.id);break;
 case 'follow':state.follows.has(d.id)?state.follows.delete(d.id):state.follows.add(d.id);save();render();if(dialog.open&&detailId)showDetail(detailId);toast(state.follows.has(d.id)?'已关注比赛':'已取消关注');reminders.sync().catch(error=>toast('关注已保存，提醒尚未同步：'+error.message));break;
 case 'open-bracket':if(state.archive.selected&&state.archive.loaded[state.archive.selected]?.record.id===d.event){closeModal();navigate('archive');break;}closeModal();state.bracketGame=d.game;state.bracketEvent=d.event;state.game=d.game;navigate('bracket');break;
 case 'zoom-fit':state.zoomFit=true;syncBracketZoom();break;
 case 'zoom':state.zoomFit=false;state.zoom=Math.max(.5,Math.min(1.3,Math.round((state.zoom+Number(d.step))*100)/100));syncBracketZoom();break;
 case 'theme':state.theme=state.theme==='dark'?'light':'dark';save();applyTheme();render();break;
 case 'refresh':if(state.bracketGame==='apex'&&state.bracketEvent)delete state.standings[state.bracketEvent];await refreshFeeds();break;
 case 'update-app':try{await appUpdater.update();}catch(error){toast(error.message);}break;
 case 'close':closeModal();break;
 case 'install':await install();break;
 case 'notifications':showReminderSettings();break;
 case 'reminder-preset':document.querySelector('#reminder-minutes').value=d.minutes;document.querySelectorAll('.reminder-presets button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));break;
 case 'reminder-enable':await reminderAction('enable');break;
 case 'reminder-disable':await reminderAction('disable');break;
 case 'reminder-save':await reminderAction('save');break;
 case 'reminder-test':await reminderAction('test');break;
 case 'calendar':{const match=getMatches().find(m=>m.id===d.id);if(!match)break;try{downloadCalendar(match,{minutes:state.reminders.minutes,teams:TEAMS});toast('已生成日历事件，请在系统中确认添加；改期后需重新更新。');}catch(error){toast(error.message);}break;}
 case 'about':detailId=null;openModal('<div class="modal-eyebrow">MATCHPOINT · V1.1</div><h2>每一场热爱，都有赛点。</h2><p class="modal-subtitle">CS2、无畏契约、英雄联盟与 Apex 官方公开赛事聚合。</p><div class="detail-note">赛程、比分、晋级关系及积分来自公开官方来源，数据每分钟检查更新。官网未公布的对阵会保留为空。支持深浅主题、关注和离线查看已读取的数据。</div><button class="button primary full" data-action="close">继续探索 '+icon('arrow')+'</button>');break;
 }
}
document.addEventListener('click',event=>{const menu=event.target.closest('.select-menu');document.querySelectorAll('.select-menu[open]').forEach(m=>{if(m!==menu)m.removeAttribute('open');});const button=event.target.closest('[data-action]');if(!button||button.tagName==='INPUT'||button.disabled)return;event.preventDefault();handleAction(button);});
document.addEventListener('input',event=>{if(event.target.id==='search'){state.search=event.target.value;if(state.route==='bracket'){navigate('schedule');state.search=event.target.value;}if(state.route==='archive')state.archive.page=0;renderContent();}});
document.addEventListener('change',event=>{if(event.target.dataset.archiveFilter==='year'){state.archive.year=event.target.value;state.archive.page=0;renderContent();return;}if(event.target.dataset.action==='pick-date'&&event.target.value){updateDay();state.date=event.target.value;renderContent();}});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!dialog.open){event.preventDefault();document.querySelector('#search').focus();}if((event.key==='Enter'||event.key===' ')&&event.target.classList.contains('match-row')){event.preventDefault();showDetail(event.target.dataset.id);}});
dialog.addEventListener('close',()=>{if(dialog.open)return;detailId=null;reminderModal=false;document.documentElement.style.removeProperty('--modal-scrollbar-width');restoreModalScroll();modalScrollPosition=null;});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
window.addEventListener('popstate',()=>navigate(location.pathname.slice(1),false));window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;});
window.addEventListener('online',()=>{render();refreshFeeds();});window.addEventListener('offline',()=>{for(const s of Object.values(state.sources)){if(s.status==='ready')s.status='cached';}render();toast('网络已断开，显示上次读取的官方赛程');});
document.addEventListener('load',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.teamLogo)markTeamLogoLoaded(img);},true);
document.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.teamLogo){img.classList.add('is-broken');img.closest('.team-badge')?.classList.remove('logo-ready-'+img.dataset.teamLogo);}},true);
async function syncOfficialLogos(){if(!await refreshTeamLogos())return;for(const node of document.querySelectorAll('[data-team-badge]')){const size=['medium','large','xl'].filter(c=>node.classList.contains(c)).join(' ');node.outerHTML=badge(node.dataset.teamBadge,size);}}
applyTheme();render();refreshFeeds();syncOfficialLogos();setInterval(()=>{if(!document.hidden&&navigator.onLine)syncOfficialLogos();},10000);setInterval(()=>{if(!document.hidden&&navigator.onLine){if(state.route==='bracket'&&state.bracketGame==='apex')delete state.standings[state.bracketEvent];refreshFeeds();if(!state.reminders.busy&&(state.reminders.enabled||state.reminders.pendingRemoval))reminders.sync().catch(()=>{});}},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)refreshFeeds();});
reminders.prepare().then(()=>reminders.sync()).catch(error=>{if(state.reminders.enabled){state.reminders.syncError=error.message;renderContent();}});
window.addEventListener('online',()=>reminders.sync().catch(()=>{}));
window.addEventListener('storage',event=>{if(event.key==='matchpoint:preferences:v2'){reminders.reconcile();render();if(reminderModal&&dialog.open)showReminderSettings();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)reminders.sync().catch(()=>{});});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{}));

function syncBracketZoom(){
 const canvases=[...document.querySelectorAll('.official-canvas[data-graph-width]')];if(!canvases.length)return;
 if(state.zoomFit){const available=canvases[0].closest('.bracket-scroll').clientWidth-16,largest=Math.max(...canvases.map(c=>Number(c.dataset.graphWidth)));const readable=canvases.some(c=>c.classList.contains('stage-card-canvas')||c.classList.contains('mindmap-canvas'));state.zoom=available<650?.9:Math.max(readable?.85:.5,Math.min(1,Math.floor(available/largest*100)/100));}
 for(const canvas of canvases){canvas.style.transform='scale('+state.zoom+')';canvas.parentElement.style.width=Number(canvas.dataset.graphWidth)*state.zoom+'px';canvas.parentElement.style.height=Number(canvas.dataset.graphHeight)*state.zoom+'px';}
 const label=document.querySelector('[data-zoom-label]');if(label)label.textContent=Math.round(state.zoom*100)+'%';
}
let graphDrag=null;
document.addEventListener('pointerdown',event=>{const area=event.target.closest('.bracket-scroll');if(!area||event.pointerType!=='mouse'||event.button!==0||event.target.closest('button,a'))return;graphDrag={area,x:event.clientX,y:event.clientY,left:area.scrollLeft,top:area.scrollTop,id:event.pointerId};area.classList.add('is-dragging');area.setPointerCapture(event.pointerId);event.preventDefault();});
document.addEventListener('pointermove',event=>{if(!graphDrag||graphDrag.id!==event.pointerId)return;graphDrag.area.scrollLeft=graphDrag.left-(event.clientX-graphDrag.x);graphDrag.area.scrollTop=graphDrag.top-(event.clientY-graphDrag.y);});
function stopGraphDrag(){if(!graphDrag)return;graphDrag.area.classList.remove('is-dragging');if(graphDrag.area.hasPointerCapture(graphDrag.id))graphDrag.area.releasePointerCapture(graphDrag.id);graphDrag=null;}
document.addEventListener('pointerup',stopGraphDrag);document.addEventListener('pointercancel',stopGraphDrag);window.addEventListener('resize',syncBracketZoom);

function contentView(){return state.route==='archive'?archiveView(state):state.route==='bracket'?bracketView(state):scheduleView(state,getMatches());}
function ensureArchive(){if(state.route!=='archive')return;if(state.archive.status==='idle')loadArchiveIndex();}
async function loadArchiveIndex(sync=false){if(archiveRequest)return archiveRequest;state.archive.status=sync?'syncing':'loading';const work=(async()=>{try{if(sync){const response=await fetch('/api/archive/sync',{method:'POST'});if(!response.ok)throw new Error('官方存档同步暂时不可用');}acceptArchiveIndex(await requestJSON('/api/archive'));archiveReadAt=Date.now();}catch(error){state.archive.status=state.archive.index?'ready':'error';state.archive.error=state.archive.index?'更新失败，显示上次保存的存档目录。':error.message;}finally{archiveRequest=null;if(state.route==='archive')renderContent();}if(!archiveUrlOpened&&state.route==='archive'){archiveUrlOpened=true;const id=new URL(location.href).searchParams.get('event');if(id&&state.archive.index?.records.some(r=>r.id===id))await openArchive(id);}})();archiveRequest=work;return work;}
async function openArchive(id){if(state.archive.loadingId)return;state.archive.loadingId=id;state.archive.error=null;renderContent();try{const payload=await requestJSON('/api/archive/event?id='+encodeURIComponent(id));acceptArchiveEvent(id,payload);}catch(error){const cached=state.archive.loaded[id];if(cached){acceptArchiveEvent(id,cached);state.archive.error='网络不可用，显示已保存的官方存档。';}else{state.archive.error=error.message;state.archive.loadingId=null;}}if(state.archive.selected===id){state.zoomFit=true;history.replaceState({},'','/archive?event='+encodeURIComponent(id));}if(state.route==='archive')renderContent();}
function exportArchive(){const payload=state.archive.loaded[state.archive.selected];if(!payload)return;const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(payload.record.name+'-官方存档.json').replace(/[\\/:*?"<>|]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
setInterval(()=>{if(state.route==='archive'&&!state.archive.selected&&!archiveRequest&&navigator.onLine&&Date.now()-archiveReadAt>3500&&(state.archive.index?.progress.running||state.archive.index?.progress.discovering))loadArchiveIndex();},4000);
