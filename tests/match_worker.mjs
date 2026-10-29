import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker,{normalizeGoals,eventMinute,normalizeMatchDetails,formationRows,matchDetails,matchNationalities} from '../calendar_worker.mjs';

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
{
  const mls=JSON.parse(fs.readFileSync(new URL('./fixtures/match-mls-761908.json',import.meta.url),'utf8'));
  const match=normalizeMatchDetails(mls,'MLS','761908'),miami=match.lineups.find(l=>l.team.id==='20232'),cincinnati=match.lineups.find(l=>l.team.id==='18267');
  assert.equal(miami.formation,'4-3-3');
  assert.deepEqual(miami.rows.map(r=>r.length),[1,4,3,3],'Left/right forwards must not suppress Inter Miami’s published pitch');
  assert.deepEqual(cincinnati.rows.map(r=>r.length),[1,3,5,2]);
  assert.deepEqual(miami.rows.at(-1).map(id=>miami.players.find(p=>p.id===id).name),['Germán Berterame','Luis Suárez','Lionel Messi'],'Wide forwards stay on their published sides');
  for(const lineup of [miami,cincinnati])assert.equal(new Set(lineup.rows.flat()).size,11);
  for(const code of ['LF','RF'])assert.equal(miami.players.find(p=>p.position_code===code).position,'Delantero');
  const backThree=structuredClone(miami.players),codes={'314952':'CD-L','173666':'CD','231241':'LWB','315617':'CD-R','297328':'CM','174466':'RWB'};
  for(const player of backThree)if(codes[player.id])player.position_code=codes[player.id];
  const threeRows=formationRows(backThree,'3-4-3');
  assert.deepEqual(threeRows.map(r=>r.length),[1,3,4,3],'The same wide-forward codes work with a three-player defence');
  assert.deepEqual(threeRows.at(-1),miami.rows.at(-1));
  const unknown=structuredClone(miami.players);unknown.find(p=>p.position_code==='LF').position_code='UNKNOWN';
  assert.deepEqual(formationRows(unknown,'4-3-3'),[],'Unknown positions still fall back to a list without inventing a layout');
}
const malicious=structuredClone(fixture);malicious.rosters[0].roster[0].athlete.headshot={href:'https://evil.invalid/x.png'};
assert.ok([...result.lineups,...normalizeMatchDetails(malicious,'CL','401915313').lineups].every(l=>l.players.every(p=>!Object.hasOwn(p,'photo'))),'Player photos are omitted regardless of their source URL');

{
  const squad=JSON.parse(fs.readFileSync(new URL('./fixtures/first-team-real.json',import.meta.url),'utf8'));
  const raw=structuredClone(fixture);
  for(const team of raw.rosters)for(const player of team.roster)player.athlete.citizenship='Argentina';
  const sample=()=>{const match=normalizeMatchDetails(raw,'CL','401915313');match.lineups[1].players=[];return match;};
  const previousFetch=globalThis.fetch,previousCaches=globalThis.caches,requests=[];
  globalThis.caches=undefined;
  globalThis.fetch=async value=>{
    const url=new URL(value);requests.push(url.href);
    if(url.pathname.endsWith('/teams/86/roster')){
      assert.equal(url.searchParams.get('season'),'2026');
      return Response.json({...squad,athletes:[{items:squad.athletes.filter(p=>p.id!=='257237')}]});
    }
    assert.ok(url.pathname.endsWith('/athletes/257237'),'Only the keeper omitted from the roster needs an individual lookup');
    return Response.json({athlete:squad.athletes.find(p=>p.id==='257237')});
  };
  try{
    const before=sample(),enriched=await matchNationalities(sample(),'2026','https://site.test',{waitUntil(){} });
    const players=enriched.lineups[0].players,bench=players.filter(p=>!p.starter);
    assert.equal(players.find(p=>p.id==='251634').position,'Defensa');
    assert.equal(players.find(p=>p.id==='402479').position,'Delantero');
    assert.equal(players.find(p=>p.id==='257237').position,'Portero');
    assert.deepEqual([...new Set(bench.map(p=>p.position))].sort(),['Centrocampista','Defensa','Delantero','Portero']);
    assert.ok(players.every(p=>p.nationality==='Argentina'),'Position enrichment cannot replace an already known nationality');
    assert.deepEqual(enriched.lineups[0].rows,before.lineups[0].rows,'Usual positions do not rearrange the starting formation');
    for(const starter of before.lineups[0].players.filter(p=>p.starter))assert.equal(players.find(p=>p.id===starter.id).position,starter.position);
    assert.equal(requests.length,2,'One squad request resolves all other bench positions');
    globalThis.fetch=async()=>{throw Error('offline');};
    const retained=await matchNationalities(sample(),'2026','https://offline.test',{waitUntil(){}},enriched);
    assert.deepEqual(retained.lineups[0].players.filter(p=>!p.starter).map(p=>p.position),bench.map(p=>p.position),'Keep the last verified positions if the source fails');
    const unknown=await matchNationalities(sample(),'2026','https://offline.test',{waitUntil(){}});
    assert.ok(unknown.lineups[0].players.filter(p=>!p.starter).every(p=>p.position===''),'Unavailable positions are never guessed or labelled Substitute');
    const direct=structuredClone(raw);direct.rosters[0].roster.find(p=>p.athlete.id==='257237').athlete.position={abbreviation:'G'};
    assert.equal(normalizeMatchDetails(direct,'CL','401915313').lineups[0].players.find(p=>p.id==='257237').position,'Portero','An embedded athlete position works without a roster lookup');
  }finally{globalThis.fetch=previousFetch;globalThis.caches=previousCaches;}
}

const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
const cache=new Map(),waiting=[];let calls=0;
globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,value)=>cache.set(key.url,value.clone())}};
const identified=structuredClone(fixture);for(const team of identified.rosters)for(const player of team.roster){player.athlete.citizenship='Spain';if(!player.starter)player.athlete.position={abbreviation:'M'};}
globalThis.fetch=async url=>{calls++;assert.equal(new URL(url).hostname,'site.api.espn.com');assert.equal(new URL(url).searchParams.get('event'),'401915313');return Response.json(identified);};
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
