import {badgeLogos} from './team-logos.js';
import { TEAMS, GAME } from './data.js';
import { escape, icon, gameIcon } from './ui.js';
export function badge(id,size='') {
 const t=TEAMS[id];if(!t)return '<span class="team-badge pending '+size+'" aria-hidden="true">?</span>';
 const logos=badgeLogos(t),dark=logos.dark||logos.light,light=logos.light||logos.dark,images=dark?['dark','light'].map(mode=>'<img class="team-logo team-logo-'+mode+'" data-team-logo="'+mode+'" src="'+escape(mode==='dark'?dark:light)+'" alt="" decoding="async" draggable="false"/>').join(''):'';
 return '<span class="team-badge '+(dark?'has-logo ':'')+(dark&&dark===light?'single-logo ':'')+size+'" data-team-badge="'+escape(id)+'" style="--team:'+t.color+'" aria-hidden="true">'+images+'<span class="team-logo-fallback">'+escape(t.mark)+'</span></span>';
}
export const teamName = id => escape(TEAMS[id]?.short || '待官方公布');
export function gameLabel(id) {
 const g=GAME(id); return `<span class="game-mini" style="--game:${g.color}">${gameIcon(id)}</span><span>${escape(g.name)}</span>`;
}
export function statusLabel(status){const labels={live:'进行中',finished:'已结束',upcoming:'未开始',cancelled:'已取消',postponed:'已延期',unknown:'状态待公布'};return '<span class="status '+(Object.hasOwn(labels,status)?status:'unknown')+'">'+(status==='live'?'<i></i>':icon(status==='finished'?'check':'clock'))+(labels[status]||labels.unknown)+'</span>';}
export function followButton(id,state,cls='') {
 const on=state.follows.has(id);
 return `<button class="follow-button ${on?'is-followed':''} ${cls}" data-action="follow" data-id="${escape(id)}" aria-label="${on?'取消关注':'关注比赛'}" aria-pressed="${on}" title="${on?'取消关注':'关注比赛'}">${icon('star')}</button>`;
}
export const dateAdd = (date,offset) => { const d=new Date(`${date}T12:00:00`); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
