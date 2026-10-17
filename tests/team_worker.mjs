import assert from 'node:assert/strict';
import worker, {teamHistory,resolveTeam,scheduleRows,selectFive} from '../calendar_worker.mjs';
const now=Date.now();
function event(id,offset,finished=true,home='86',away='83') {
  return {id,date:new Date(now+offset*86400000).toISOString(),timeValid:true,league:{slug:'esp.1',name:'LALIGA'},
    competitions:[{status:{type:{completed:finished,state:finished?'post':'pre',name:finished?'STATUS_FULL_TIME':'STATUS_SCHEDULED'}},
      competitors:[{homeAway:'home',score:{value:0},team:{id:home,displayName:'Real Madrid'}},
        {homeAway:'away',score:{value:2},team:{id:away,displayName:'Barcelona'}}]}]};
}
function schedule(events,national=false){return {season:{year:2026},team:{id:'86',displayName:'Real Madrid',isNational:national,logo:national?'https://a.espncdn.com/i/teamlogos/countries/500/esp.png':'https://a.espncdn.com/i/teamlogos/soccer/500/86.png'},events};}
const past=Array.from({length:7},(_,i)=>event(String(i),-i-1));
let rows=scheduleRows(schedule([...past,past[0],event('unrelated',-1,true,'1','2')]),'86');
assert.deepEqual(selectFive(rows,false,now).map(m=>m.id),['0','1','2','3','4']);
assert.equal(rows[0].home_score,0);assert.equal(rows[0].away_score,2);
assert.equal(rows[0].home_id,'86');assert.equal(rows[0].competition_name,'La Liga');
const upcoming=Array.from({length:7},(_,i)=>event('f'+i,i+1,false));
const canceled=event('canceled',0.5,false);canceled.competitions[0].status.type.name='STATUS_CANCELED';
const live=event('live',-0.01,false);live.competitions[0].status.type.state='in';
rows=scheduleRows(schedule([...upcoming.reverse(),canceled,live,event('old',-2,false)]),'86');
assert.deepEqual(selectFive(rows,true,now).map(m=>m.id),['f0','f1','f2','f3','f4']);
assert.equal(rows.find(m=>m.id==='f0').home_score,null,'Scheduled zeros must stay hidden');
const missingTime=event('unknown',1,false);missingTime.timeValid=false;
assert.equal(scheduleRows(schedule([missingTime]),'86')[0].time_confirmed,false);
assert.throws(()=>scheduleRows({...schedule([]),team:{id:'83'}},'86'));
const roster={sports:[{leagues:[{teams:[{team:{id:'86',displayName:'Real Madrid'}},{team:{id:'102',displayName:'Villarreal'}},{team:{id:'132',displayName:'Bayern Munich'}}]}]}]};
assert.equal(resolveTeam(roster,'Real Madrid FC'),'86');assert.equal(resolveTeam(roster,'FC Villareal'),'102');assert.equal(resolveTeam(roster,'FC Bayern München'),'132');
assert.throws(()=>resolveTeam(roster,'Madrid'),/identificar/,'Do not guess an ambiguous or incomplete name');
const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
const cache=new Map(),waiting=[];let calls=0;
globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,value)=>cache.set(key.url,value.clone())}};
const ctx={waitUntil:p=>waiting.push(p)};
globalThis.fetch=async value=>{calls++;const u=new URL(value);if(u.pathname.endsWith('/teams'))return Response.json(roster);return Response.json(schedule(u.searchParams.get('fixture')==='true'?upcoming:past));};
let response=await worker.fetch(new Request('https://site.test/api/equipo?nombre=Real+Madrid+FC&competicion=PD'),{},ctx);
assert.equal(response.status,200);let body=await response.json();assert.equal(body.complete,true);assert.equal(body.team.id,'86');assert.equal(body.past.matches.length,5);assert.equal(body.future.matches.length,5);assert.equal(calls,3);await Promise.all(waiting);
response=await teamHistory(new Request('https://site.test/api/equipo?id=86'),ctx);await response.json();assert.equal(calls,3,'Name and ID requests share the team cache');
response=await teamHistory(new Request('https://site.test/api/equipo?id=../83'),ctx);assert.equal(response.status,400);assert.equal(calls,3);
response=await teamHistory(new Request('https://site.test/api/equipo?nombre=Madrid&competicion=http://invalid'),ctx);assert.equal(response.status,400);
response=await teamHistory(new Request('https://site.test/api/equipo',{method:'POST'}),ctx);assert.equal(response.status,405);
cache.clear();calls=0;
globalThis.fetch=async value=>{calls++;const u=new URL(value);return Response.json(schedule(u.searchParams.get('fixture')==='true'?upcoming:u.searchParams.has('season')?past:past.slice(0,2)));};
response=await teamHistory(new Request('https://site.test/api/equipo?id=86'),ctx);body=await response.json();assert.equal(calls,3);assert.equal(body.past.matches.length,5,'Fill from the preceding season when needed');await Promise.all(waiting);
const key=[...cache.keys()].find(k=>k.includes('id=86'));const old=await cache.get(key).clone().json();old.checked_at='2000-01-01T00:00:00Z';cache.set(key,Response.json(old));
globalThis.fetch=async()=>{throw Error('offline');};
response=await teamHistory(new Request('https://site.test/api/equipo?id=86'),ctx);body=await response.json();assert.equal(body.complete,false);assert.equal(body.past.updated,old.past.updated);assert.equal(body.checked_at,old.checked_at);assert.equal(body.past.stale,true);assert.equal(body.future.matches.length,5);
cache.clear();response=await teamHistory(new Request('https://site.test/api/equipo?id=86'),ctx);assert.equal(response.status,503);
globalThis.fetch=originalFetch;globalThis.caches=originalCaches;
console.log('Equipos: últimos cinco reales, próximos cinco, otras competiciones, identidad, temporadas, caché y fallos comprobados.');
