import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker,{normalizeGoals,eventMinute,normalizeMatchDetails,formationRows,matchDetails} from '../calendar_worker.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/match-real.json',import.meta.url),'utf8'));
const result=normalizeMatchDetails(fixture,'CL','401915313');
assert.equal(result.match.home_score,4);assert.equal(result.match.away_score,1);
assert.deepEqual(result.match.goals.map(g=>g.name),['B. Silva','A. Güler','K. Mbappé','T. Gomis','Y. Diomande']);
assert.deepEqual(result.match.goals.map(g=>g.side),['home','home','home','away','home']);
for(const lineup of result.lineups){
  assert.equal(lineup.players.filter(p=>p.starter).length,11);
  assert.equal(lineup.players.filter(p=>!p.starter).length,12);
  assert.deepEqual(lineup.rows.map(r=>r.length),[1,4,2,3,1]);
  assert.equal(new Set(lineup.rows.flat()).size,11);
  assert.equal(lineup.players.find(p=>p.id===lineup.rows[0][0]).position,'Portero');
}
assert.equal(result.lineups[0].players.find(p=>p.id==='402479').events.filter(e=>e.type==='goal').length,1);
assert.throws(()=>normalizeMatchDetails(fixture,'PD','401915313'),/competición/);
assert.throws(()=>normalizeMatchDetails(fixture,'CL','1234'),/partido/);
assert.equal(eventMinute({clock:{displayValue:"45'+3'"}}),'45+3′');
assert.equal(eventMinute({clock:{displayValue:"90'"},addedClock:{displayValue:"5'"}}),'90+5′');
assert.equal(eventMinute({clock:{displayValue:'undefined'}}),'');
const own={team:{id:'1'},scoringPlay:true,ownGoal:true,clock:{displayValue:"22'"},athletesInvolved:[{id:'5',shortName:'Defensa',team:{id:'2'}}]};
const penalty={team:{id:'2'},scoringPlay:true,penaltyKick:true,clock:{displayValue:"90'+3'"},participants:[{athlete:{id:'6',displayName:'Delantero'}},{athlete:{id:'7',displayName:'Asistente'}}]};
const goals=normalizeGoals([own,penalty,own,{...penalty,shootout:true},{...penalty,scoringPlay:false},{...own,team:{id:'999'}}],'1','2');
assert.equal(goals.length,2,'Deduplicate and exclude shootouts, non-goals and unrelated teams');
assert.equal(goals[0].side,'home');assert.equal(goals[0].own_goal,true);
assert.equal(goals[1].name,'Delantero');assert.equal(goals[1].penalty,true);
assert.equal(goals[1].minute,'90+3′');
const missing=structuredClone(fixture);missing.rosters=[];
assert.ok(normalizeMatchDetails(missing,'CL','401915313').lineups.every(l=>!l.players.length&&!l.rows.length));
assert.deepEqual(formationRows(result.lineups[0].players,'4-4-3'),[]);
assert.deepEqual(formationRows(result.lineups[0].players.slice(1),'4-2-3-1'),[]);
const defensiveMid=structuredClone(result.lineups[0].players);defensiveMid.find(p=>p.place===4).position_code='DM-L';
assert.deepEqual(formationRows(defensiveMid,'4-2-3-1').map(r=>r.length),[1,4,2,3,1]);
const malicious=structuredClone(fixture);malicious.rosters[0].roster[0].athlete.headshot={href:'https://evil.invalid/x.png'};
assert.equal(normalizeMatchDetails(malicious,'CL','401915313').lineups[0].players[0].photo,'');

const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
const cache=new Map(),waiting=[];let calls=0;
globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,value)=>cache.set(key.url,value.clone())}};
globalThis.fetch=async url=>{calls++;assert.equal(new URL(url).hostname,'site.api.espn.com');assert.equal(new URL(url).searchParams.get('event'),'401915313');return Response.json(fixture);};
const ctx={waitUntil:p=>waiting.push(p)},address='https://site.test/api/partido?competicion=CL&id=401915313';
try{
  for(const query of ['id=../401915313&competicion=CL','id=401915313&competicion=https://evil.invalid','id=1','competicion=CL']){
    assert.equal((await matchDetails(new Request('https://site.test/api/partido?'+query),ctx)).status,400);
  }
  assert.equal((await matchDetails(new Request(address,{method:'POST'}),ctx)).status,405);assert.equal(calls,0);
  let response=await worker.fetch(new Request(address),{},ctx);assert.equal(response.status,200);
  let body=await response.json();assert.equal(body.match.goals.length,5);assert.equal(calls,1);await Promise.all(waiting);
  response=await matchDetails(new Request('https://site.test/api/partido?id=401915313&competicion=CL'),ctx);
  assert.equal((await response.json()).lineups.length,2);assert.equal(calls,1,'Cache is independent of query order');
  const key=[...cache.keys()][0],old=await cache.get(key).clone().json();old.checked_at='2000-01-01T00:00:00Z';cache.set(key,Response.json(old));
  globalThis.fetch=async()=>{throw Error('offline');};
  response=await matchDetails(new Request(address),ctx);body=await response.json();
  assert.equal(body.stale,true);assert.equal(body.updated,old.updated);assert.equal(body.match.goals.length,5);
  cache.clear();assert.equal((await matchDetails(new Request(address),ctx)).status,503);
}finally{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;}
console.log('Partidos: caso real, goleadores, asistentes, propia puerta, penaltis, formación, banquillo, identidad, caché y fallos comprobados.');
