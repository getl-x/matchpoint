import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

// Content identifies deployments even when package.version and sw.js stay unchanged.
// Downloaded team logos are data, so they must not trigger application updates.
export async function readAppVersion(root){
 const files=['index.html','styles.css','sw.js','manifest.webmanifest'];
 async function walk(directory){
  for(const entry of await readdir(join(root,directory),{withFileTypes:true})){
   const name=directory+'/'+entry.name;
   if(directory==='assets'&&(entry.name.startsWith('team-logos.json')||entry.name.startsWith('team-logo-')))continue;
   if(entry.isDirectory())await walk(name);else if(entry.isFile())files.push(name);
  }
 }
 await walk('src');await walk('assets');
 const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8')),hash=createHash('sha256').update(version+'\0'),resources=[];
 let html;
 for(const file of files.sort()){
  const bytes=await readFile(join(root,file));hash.update(file+'\0').update(bytes).update('\0');
  resources.push({url:'/'+file,hash:createHash('sha256').update(bytes).digest('hex')});if(file==='index.html')html=bytes.toString('utf8');
 }
 const build=hash.digest('hex');
 resources.find(resource=>resource.url==='/index.html').hash=createHash('sha256').update(html.replace('__MATCHPOINT_BUILD__',build)).digest('hex');
 return {version,build,resources};
}
