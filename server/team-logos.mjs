import {runtimeConfig} from './config.mjs';
import {readFile,writeFile,rename,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {teamLogoSources,safeLogoURL,localLogoPath} from '../src/logo-sources.js';
import {publicFetch} from './providers/common.mjs';
import {parseAssignment,VAL} from './providers/history.mjs';
let lolDirectory=null;
async function metadata(team){
 if(/^valorant:cn:\d+$/.test(team.id)){const p=await publicFetch(VAL+'VAL_Team_'+team.id.split(':').at(-1)+'.json',true);return p.msg;}
 if(/^lol:cn:\d+$/.test(team.id)){if(!lolDirectory)lolDirectory=publicFetch('https://lpl.qq.com/web201612/data/LOL_MATCH2_TEAM_LIST.js').then(text=>parseAssignment(text,'TeamList').msg).catch(e=>{lolDirectory=null;throw e;});const list=await lolDirectory;return list[team.id.split(':').at(-1)];}
 return null;
}
function imageType(bytes,type){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'webp';
 if(type?.includes('image/svg+xml')&&/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(bytes.toString('utf8').slice(0,1200)))return 'svg';
 throw new Error('Official logo response is not a supported image');
}
export function createLogoCache({directory=runtimeConfig.logoDirectory,fetcher=fetch,resolveMetadata=metadata,now=Date.now}={}){
 const dir=resolve(directory),path=resolve(dir,'team-logos.json');let index={version:1,teams:{},updatedAt:null},initWork=null,writeQueue=Promise.resolve(),closing=false;const downloads=new Map(),teamWork=new Map(),phaseWork=new Map(),failed=new Map();
 const init=()=>initWork||(initWork=(async()=>{await mkdir(dir,{recursive:true}).catch(e=>{if(e.code!=='EEXIST')throw e;});try{const saved=JSON.parse(await readFile(path,'utf8'));if(saved.version===1&&saved.teams)index=saved;}catch(e){if(e.code!=='ENOENT')console.warn('[Logo] cache index unavailable');}})());
 function persist(){index.updatedAt=new Date(now()).toISOString();const copy=JSON.stringify(index);writeQueue=writeQueue.catch(()=>{}).then(async()=>{const tmp=path+'.tmp';await writeFile(tmp,copy);await rename(tmp,path);});return writeQueue;}
 async function download(value){
  const url=safeLogoURL(value);if(!url)return null;if(failed.get(url)>now()-600000)return null;if(downloads.has(url))return downloads.get(url);
  const job=(async()=>{try{
   const response=await fetcher(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'image/png,image/svg+xml,image/webp,image/jpeg',Referer:new URL(url).origin+'/'}});
   if(!response.ok||response.url&&!safeLogoURL(response.url))throw new Error('Official logo is unavailable');
   const reader=response.body.getReader(),parts=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new Error('Official logo exceeds size limit');}parts.push(Buffer.from(value));}
   const bytes=Buffer.concat(parts),extension=imageType(bytes,response.headers.get('content-type')),filename='team-logo-'+createHash('sha256').update(url).digest('hex').slice(0,32)+'.'+extension;
   await writeFile(resolve(dir,filename),bytes);failed.delete(url);return '/assets/'+filename;
  }catch{failed.set(url,now());return null;}finally{downloads.delete(url);}})();downloads.set(url,job);return job;
 }
 async function hydrateTeam(team){
  if(teamWork.has(team.id))return teamWork.get(team.id);
  const job=(async()=>{await init();let sources={dark:safeLogoURL(team.logos?.dark),light:safeLogoURL(team.logos?.light)};
   if(!sources.dark&&!sources.light){sources=teamLogoSources({...team,id:team.id.startsWith('cs2:')?team.id.slice(4):team.id},team.id.split(':')[0]);}
   const old=index.teams[team.id];if(!sources.dark&&!sources.light){if(old)return old;try{sources=teamLogoSources(await resolveMetadata(team)||{},team.id.split(':')[0]);}catch{return null;}}
   if(!sources.dark&&!sources.light)return old||null;sources.dark||=sources.light;sources.light||=sources.dark;
   const record={...old,sources:{...old?.sources},name:team.name};let changed=false;
   await Promise.all(['dark','light'].map(async mode=>{if(record.sources[mode]===sources[mode]&&localLogoPath(record[mode])){try{await stat(resolve(dir,record[mode].split('/').at(-1)));return;}catch{}}
    const asset=await download(sources[mode]);if(asset){record[mode]=asset;record.sources[mode]=sources[mode];changed=true;}}));
   if(changed){record.retrievedAt=new Date(now()).toISOString();index.teams[team.id]=record;await persist();}
   return index.teams[team.id]||null;
  })().finally(()=>teamWork.delete(team.id));teamWork.set(team.id,job);return job;
 }
 async function hydrateTeams(teams){if(closing)return;const list=Object.values(teams||{});let next=0;await Promise.all(Array.from({length:Math.min(6,list.length)},async()=>{while(!closing&&next<list.length){const team=list[next++];try{await hydrateTeam(team);}catch{}}}));}
 async function decorateTeams(teams){await init();const output={};for(const [id,t]of Object.entries(teams||{})){const cached=index.teams[id];output[id]=cached?{...t,logos:{dark:cached.dark,light:cached.light},logoSources:cached.sources}:t;}return output;}
 async function decorateFeed(feed){
  const job=hydrateTeams(feed.teams);const timer=()=>new Promise(resolve=>{const t=setTimeout(resolve,1200);t.unref?.();});await Promise.race([job,timer()]);
  return {...feed,teams:await decorateTeams(feed.teams)};
 }
 async function decorateStandings(standings){
  await init();
  const phases=await Promise.all((standings?.phases||[]).map(async phase=>{
   const missing=Object.values(phase.teams||{}).some(t=>!index.teams[t.id]&&!safeLogoURL(t.logos?.dark)&&!safeLogoURL(t.logos?.light));
   if(missing&&/^[A-Z0-9]{26}$/.test(phase.id)&&!(failed.get('phase:'+phase.id)>now()-600000)){
    let job=phaseWork.get(phase.id);
    if(!job){job=(async()=>{try{const raw=await publicFetch('https://prod-api.algstools.com/v1/stats/phases/'+phase.id+'/standings',true),byId=new Map((raw.standings||[]).map(t=>['apex:'+t.teamId,t])),teams={};for(const [id,t]of Object.entries(phase.teams||{}))teams[id]=byId.has(id)?{...t,logos:teamLogoSources(byId.get(id),'apex')}:t;await hydrateTeams(teams);}catch{failed.set('phase:'+phase.id,now());}finally{phaseWork.delete(phase.id);}})();phaseWork.set(phase.id,job);}
    await Promise.race([job,new Promise(resolve=>{const timer=setTimeout(resolve,1200);timer.unref?.();})]);
   }
   return {...phase,teams:(await decorateFeed({teams:phase.teams})).teams};
  }));return {...standings,phases};
 }
 async function close(){closing=true;while(phaseWork.size||teamWork.size||downloads.size)await Promise.allSettled([...phaseWork.values(),...teamWork.values(),...downloads.values()]);await writeQueue;}
 return {init,hydrateTeams,decorateFeed,decorateStandings,decorateTeams,close,index:()=>index,directory:dir};
}
export const logoCache=createLogoCache();
