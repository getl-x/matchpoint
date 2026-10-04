import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,open,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
export function loadConfig(env=process.env){
 const value=env.PORT||'4177';if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535)throw new Error('PORT 必须是 1 到 65535 的整数');
 const flag=env.MATCHPOINT_ARCHIVE_SYNC??'true';if(!['true','false'].includes(flag))throw new Error('MATCHPOINT_ARCHIVE_SYNC 必须为 true 或 false');
 const dataDirectory=resolve(env.MATCHPOINT_DATA_DIR||join(root,'data'));
 return {root,port:Number(value),host:env.HOST||'127.0.0.1',archiveSync:flag==='true',dataDirectory,archiveDirectory:join(dataDirectory,'archive'),logoDirectory:env.MATCHPOINT_DATA_DIR?join(dataDirectory,'logos'):join(root,'assets')};
}
export const runtimeConfig=loadConfig();
export async function initializeStorage(config=runtimeConfig){
 for(const directory of new Set([config.dataDirectory,config.archiveDirectory,join(config.archiveDirectory,'events'),join(config.dataDirectory,'feeds'),join(config.dataDirectory,'reminders'),config.logoDirectory])){
  await mkdir(directory,{recursive:true});const probe=join(directory,'.write-probe-'+randomUUID());let file;
  try{file=await open(probe,'wx');await file.close();file=null;await unlink(probe);}catch(error){if(file)await file.close().catch(()=>{});await unlink(probe).catch(()=>{});throw new Error('数据目录无法写入：'+directory,{cause:error});}
 }
}
