// These origins are used by the games' official esports pages and image feeds.
const HOSTS=new Set(['static.lolesports.com','esports.val.qq.com','content.algstools.com','assets.blast.tv','img.crawler.qq.com','shp.qpic.cn','game.gtimg.cn']);
export function safeLogoURL(value){
 try{if(typeof value!=='string'||!value)return null;const u=new URL(value.startsWith('//')?'https:'+value:value);if(!HOSTS.has(u.hostname)||u.username||u.password||u.port||!['http:','https:'].includes(u.protocol))return null;u.protocol='https:';return u.href;}catch{return null;}
}
export function teamLogoSources(t={},game){
 let dark=t.logoDark||t.teamDarkLogo||t.TeamLogoDeep||t.image||t.logo||t.logoUrl||t.TeamLogo;
 let light=t.logoLight||t.teamLightLogo||t.TeamLogo||t.lightImage||t.image||t.logo||t.logoUrl;
 if(game==='cs2'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(t.id||t.uuid||''))dark=light='https://assets.blast.tv/images/teams/'+(t.id||t.uuid)+'?width=128&format=png';
 dark=safeLogoURL(dark);light=safeLogoURL(light);if(!dark&&!light)return {};return {dark:dark||light,light:light||dark};
}
export const localLogoPath=value=>typeof value==='string'&&/^\/assets\/team-logo-[a-f\d]+\.(png|svg|webp|jpg)$/.test(value)?value:null;
