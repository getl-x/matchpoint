import {createSnapshotCache} from './snapshot-cache.mjs';
import {runtimeConfig} from './config.mjs';
import {join} from 'node:path';
import {riotFeed} from './providers/riot.mjs';
import {blastFeed} from './providers/blast.mjs';
import {apexFeed,apexStandings} from './providers/apex.mjs';
import {archive} from './archive.mjs';
const providers={valorant:()=>riotFeed('valorant'),lol:()=>riotFeed('lol'),cs2:blastFeed,apex:apexFeed};
const memory=createSnapshotCache(),persistent=createSnapshotCache({directory:join(runtimeConfig.dataDirectory,'feeds')});
export const cachedRead=memory.read;
export function readFeed(game){if(!providers[game])throw new Error('不支持的游戏');return persistent.read('feed:'+game,async()=>{const feed=await providers[game]();await archive.remember(feed).catch(e=>console.warn('[Archive] retention:',e.message));return feed;});}
export async function readStandings(id){const feed=await readFeed('apex');const event=feed.events.find(e=>e.id===id);if(!event)throw new Error('未找到公开赛事');return persistent.read('standings:'+id,()=>apexStandings(event));}
