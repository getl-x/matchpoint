import {logoCache} from './server/team-logos.mjs';
import {createServer} from 'node:http';
import {readFeed as officialFeed,readStandings as officialStandings} from './server/feeds.mjs';
import {archive,startArchiveSync,stopArchiveSync} from './server/archive.mjs';
import {runtimeConfig,initializeStorage} from './server/config.mjs';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const version=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8')).version;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webmanifest':'application/manifest+json; charset=utf-8','.json':'application/json; charset=utf-8'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'self'; frame-ancestors 'none'";
export function createAppServer({config=runtimeConfig,readFeed=officialFeed,readStandings=officialStandings,history=archive,logos=logoCache,now=Date.now}={}){
 let nextSyncAt=0;
 const json=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
 const app=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',csp);
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/healthz'){
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');json(res,405,{error:'Method not allowed'});return;}
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',version,uptime:Math.floor(process.uptime())}));return;
   }
   if(url.pathname.startsWith('/api/')){
    const sync=url.pathname==='/api/archive/sync';
    if((sync&&req.method!=='POST')||(!sync&&req.method!=='GET')){res.setHeader('Allow',sync?'POST':'GET');json(res,405,{error:'请求方法不支持'});return;}
    try{
     let payload;
     switch(url.pathname){
      case '/api/feed':{
       const game=url.searchParams.get('game');if(!['cs2','valorant','lol','apex'].includes(game)){json(res,400,{error:'请选择支持的游戏'});return;}
       payload=await logos.decorateFeed(await readFeed(game));break;
      }
      case '/api/archive':{
       const game=url.searchParams.get('game')||'all';if(!['all','cs2','valorant','lol','apex'].includes(game)){json(res,400,{error:'请选择支持的游戏'});return;}
       payload=await history.list(game);break;
      }
      case '/api/archive/event':{
       const id=url.searchParams.get('id')||'';if(!/^(cs2|valorant|lol|apex):[A-Za-z0-9:_-]{1,180}$/.test(id)){json(res,400,{error:'请选择官方历史赛事'});return;}
       const saved=await history.readEvent(id);payload={...saved,feed:await logos.decorateFeed(saved.feed),standings:saved.standings?await logos.decorateStandings(saved.standings):null};break;
      }
      case '/api/archive/sync':{
       if(now()<nextSyncAt){res.setHeader('Retry-After',Math.ceil((nextSyncAt-now())/1000));json(res,429,{error:'存档正在同步，请稍后重试'});return;}
       nextSyncAt=now()+60000;history.synchronize({retry:true}).catch(e=>console.warn('[Archive] sync:',e.message));payload=await history.list();break;
      }
      case '/api/standings':{
       const id=url.searchParams.get('event')||'';if(!/^apex:[A-Z0-9]{26}$/.test(id)){json(res,400,{error:'请选择官方赛事'});return;}
       payload=await logos.decorateStandings(await readStandings(id));break;
      }
      default:json(res,404,{error:'接口不存在'});return;
     }
     json(res,200,payload);
    }catch(error){console.warn('[API]',url.pathname,error.message);json(res,503,{error:error.message});}
    return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');res.writeHead(405);res.end();return;}
   let path=decodeURIComponent(url.pathname);if(['/','/schedule','/bracket','/archive','/following'].includes(path))path='/index.html';
   if(path.includes('\\')||path.split('/').some(segment=>segment==='.'||segment==='..')){res.writeHead(404);res.end('Not found');return;}
   if(!/^\/(index\.html|styles\.css|sw\.js|manifest\.webmanifest|assets\/[^/]+|src\/[a-zA-Z0-9/_.-]+)$/.test(path)){res.writeHead(404);res.end('Not found');return;}
   let file;
   if(path==='/assets/team-logos.json'||/^\/assets\/team-logo-[a-f\d]+\.(png|svg|webp|jpg)$/.test(path)){
    file=join(config.logoDirectory,path.split('/').at(-1));
    if(path==='/assets/team-logos.json'){try{await stat(file);}catch(error){if(error.code!=='ENOENT')throw error;json(res,200,{version:1,teams:{},updatedAt:null});return;}}
   }else if(path.startsWith('/assets/team-logo-')){res.writeHead(404);res.end('Not found');return;}
   else{file=resolve(config.root,'.'+path);const publicRoot=path.startsWith('/src/')?join(config.root,'src'):path.startsWith('/assets/')?join(config.root,'assets'):config.root;if(!file.startsWith(publicRoot+sep)){res.writeHead(404);res.end('Not found');return;}}
   if(!(await stat(file)).isFile()){res.writeHead(404);res.end('Not found');return;}
   const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400);res.end('Not found');}
 });
 app.headersTimeout=10000;app.requestTimeout=30000;app.keepAliveTimeout=5000;app.maxRequestsPerSocket=100;
 return app;
}
export const server=createAppServer();
export async function drainServer(app,{history=archive,logos=logoCache}={}){
 stopArchiveSync();
 await new Promise((resolve,reject)=>app.close(error=>error?reject(error):resolve()));
 await Promise.all([history.close(),logos.close()]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  await initializeStorage();
  server.listen(runtimeConfig.port,runtimeConfig.host,()=>{console.log('赛点 '+version+' 已启动：http://'+runtimeConfig.host+':'+runtimeConfig.port+'/schedule');if(runtimeConfig.archiveSync)startArchiveSync();});
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;console.log('正在停止服务并等待存档写入…');const timeout=setTimeout(()=>process.exit(1),10000);timeout.unref();drainServer(server).then(()=>{clearTimeout(timeout);process.exit(0);},error=>{console.error('关闭失败：',error.message);clearTimeout(timeout);process.exit(1);});});
 }catch(error){console.error(error.message);process.exitCode=1;}
}
