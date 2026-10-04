import {localLogoPath} from './logo-sources.js';
let index={teams:{}},pending=null;
export function badgeLogos(team){const cached=index.teams[team?.id],own=team?.logos;return {dark:localLogoPath(own?.dark)||localLogoPath(cached?.dark),light:localLogoPath(own?.light)||localLogoPath(cached?.light)};}
export async function refreshTeamLogos(){
 if(pending)return pending;
 pending=(async()=>{try{const r=await fetch('/assets/team-logos.json',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)return false;const next=await r.json();if(next.version!==1||!next.teams)return false;const changed=next.updatedAt!==index.updatedAt;index=next;return changed;}catch{return false;}finally{pending=null;}})();return pending;
}

// Read the actual artwork: some official white/black filenames have reversed contents.
const logoSurfaces=new Map();
export async function markTeamLogoLoaded(img){
 try{if(img.decode)await img.decode();}catch{return;}
 if(!img.isConnected)return;
 const badge=img.closest('.team-badge'),mode=img.dataset.teamLogo;if(!badge||!mode)return;
 let surface=logoSurfaces.get(img.src);
 if(surface===undefined){
  surface='';try{
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,32,32);
   const pixels=ctx.getImageData(0,0,32,32).data;let weight=0,total=0;
   const linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
   for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3]/255;if(alpha<.1)continue;weight+=alpha;total+=alpha*(.2126*linear(pixels[i])+.7152*linear(pixels[i+1])+.0722*linear(pixels[i+2]));}
   if(weight){const luminance=total/weight;surface=luminance<.18?'#d9dfea':luminance>.5?'#252937':'';}
  }catch{}logoSurfaces.set(img.src,surface);
 }
 if(surface)badge.style.setProperty('--logo-'+mode+'-surface',surface);
 badge.classList.add('logo-ready-'+mode);
}
