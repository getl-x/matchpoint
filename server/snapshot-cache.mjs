import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export function createSnapshotCache({directory=null,now=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map(),failures=new Map(),loaded=new Set();
 const file=key=>join(directory,createHash('sha256').update(key).digest('hex')+'.json');
 async function read(key,loader){
  if(pending.has(key))return pending.get(key);
  const work=(async()=>{
   if(directory&&!loaded.has(key)){loaded.add(key);try{const saved=JSON.parse(await readFile(file(key),'utf8'));if(saved.version===1&&saved.key===key&&((saved.value?.source?.retrievedAt&&Array.isArray(saved.value.matches))||(Array.isArray(saved.value?.phases)&&saved.value.retrievedAt)))cache.set(key,{value:saved.value,checkedAt:-Infinity});}catch(error){if(error.code!=='ENOENT')console.warn('[Official cache] unreadable snapshot:',key);}}
   const old=cache.get(key);if(old&&now()-old.checkedAt<60000)return {...old.value,stale:false};
   const stale=()=>({...old.value,stale:true,error:'官方来源暂时无法更新，显示上次读取结果'});
   if(failures.get(key)>now()-15000){if(old)return stale();throw new Error('官方来源暂时无法读取，请稍后重试');}
   try{
    const value=await loader();cache.set(key,{value,checkedAt:now()});failures.delete(key);
    if(directory){try{await mkdir(directory,{recursive:true});const target=file(key),tmp=target+'.tmp';await writeFile(tmp,JSON.stringify({version:1,key,value}),'utf8');await rename(tmp,target);}catch(error){console.warn('[Official cache] persistence:',error.message);}}
    return {...value,stale:false};
   }catch(error){failures.set(key,now());console.warn('[Official feed]',key,error.message);if(old)return stale();throw new Error('官方来源暂时无法读取，请稍后重试');}
  })().finally(()=>pending.delete(key));pending.set(key,work);return work;
 }
 return {read};
}
