import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=['server.mjs','sw.js'];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())await walk(path);else if(/\.(mjs|js|cjs)$/.test(e.name))files.push(path);}}
for(const dir of ['src','server','scripts','tests'])await walk(dir);
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('Syntax checked: '+files.length+' JavaScript files');
