import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker,{normalizeSquad,currentSquad,teamSquad} from '../calendar_worker.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/first-team-real.json',import.meta.url),'utf8'));
const data=normalizeSquad(fixture,'86');
assert.equal(data.available,true);assert.equal(data.basis,'first_team_squad');
assert.equal(data.players.length,fixture.athletes.length);
assert.ok(data.uruguayan_players.some(p=>p.name==='Federico Valverde'));
assert.equal(data.has_uruguayan,true);
const raw=structuredClone(fixture),first=raw.athletes[0];
first.citizenship='France';first.birthPlace={country:'Uruguay'};delete first.flag;
assert.equal(normalizeSquad(raw,'86').players.find(p=>p.id===first.id).uruguayan,false,'Birthplace alone is not nationality');
first.citizenship='Uruguay';first.status={type:'injured'};
assert.equal(normalizeSquad(raw,'86').players.find(p=>p.id===first.id).uruguayan,true,'Injured first-team players still count');
raw.athletes.push(first,{...first,id:'999991',status:{type:'transferred'}},{...first,id:'999992',team:{id:'999'}});
const unique=normalizeSquad(raw,'86');assert.equal(unique.players.length,fixture.athletes.length);
assert.ok(!unique.players.some(p=>['999991','999992'].includes(p.id)));
assert.throws(()=>normalizeSquad({...fixture,team:{id:'83'}},'86'),/coincidente/);
assert.throws(()=>normalizeSquad({team:fixture.team},'86'),/coincidente/);
assert.equal(normalizeSquad({...fixture,athletes:[]},'86').has_uruguayan,null,'No coverage is unknown, not no Uruguayans');
const grouped={...fixture,athletes:[{items:fixture.athletes}]};
assert.equal(normalizeSquad(grouped,'86').players.length,data.players.length);

const originalFetch=globalThis.fetch,originalCaches=globalThis.caches,cache=new Map(),pending=[];
const ctx={waitUntil:p=>pending.push(p)};let requests=[];
globalThis.caches={default:{match:async k=>cache.get(k.url)?.clone(),put:async(k,v)=>cache.set(k.url,v.clone())}};
globalThis.fetch=async value=>{
 const url=new URL(value);requests.push(url.href);
 assert.equal(url.hostname,'site.api.espn.com');
 if(url.pathname.endsWith('/all/teams/86'))return Response.json({team:{id:'86',leagueAbbrev:'esp.1'}});
 assert.ok(url.pathname.endsWith('/esp.1/teams/86/roster'));assert.equal(url.search,'','Current squad is not tied to a past match season');
 return Response.json(fixture);
};
try{
 for(const query of ['id=../86','id=https://evil.invalid','id=0','id=001',''])assert.equal((await teamSquad(new Request('https://site.test/api/plantilla?'+query),ctx)).status,400);
 assert.equal((await teamSquad(new Request('https://site.test/api/plantilla?id=86',{method:'POST'}),ctx)).status,405);assert.equal(requests.length,0);
 let response=await worker.fetch(new Request('https://site.test/api/plantilla?id=86'),{},ctx);
 assert.equal(response.status,200);let body=await response.json();assert.equal(body.has_uruguayan,true);await Promise.all(pending);
 assert.equal(requests.length,2);assert.ok(requests.every(u=>!u.includes('/summary')),'No line-up requests');
 await currentSquad('86','https://site.test',ctx);assert.equal(requests.length,2,'Share one squad across competitions and matches');
 const key=[...cache.keys()][0],old=await cache.get(key).clone().json();old.checked_at='2000-01-01T00:00:00Z';cache.set(key,Response.json(old));
 globalThis.fetch=async()=>{throw Error('offline');};
 body=await currentSquad('86','https://site.test',ctx);assert.equal(body.stale,true);assert.equal(body.updated,old.updated);assert.equal(body.players.length,old.players.length);
 cache.clear();response=await teamSquad(new Request('https://site.test/api/plantilla?id=86'),ctx);assert.equal(response.status,503);assert.equal((await response.json()).has_uruguayan,null);
 globalThis.fetch=async value=>new URL(value).pathname.endsWith('/all/teams/86')?Response.json({team:{id:'86',leagueAbbrev:'esp.1'}}):Response.json({...fixture,athletes:fixture.athletes.filter(p=>p.citizenship!=='Uruguay')});
 body=await currentSquad('86','https://site.test',ctx);assert.equal(body.has_uruguayan,false,'A player removed from the current squad no longer qualifies');
 assert.ok(!body.players.some(p=>p.name==='Federico Valverde'));
}finally{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;}
console.log('Plantillas: caso real, nacionalidad, lesionados, primer equipo, liga principal, cambios de plantilla, caché, identidad y fallos comprobados.');
