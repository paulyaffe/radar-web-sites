import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeMatchDetails,matchNationalities,matchDetails,isUruguayan} from '../calendar_worker.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/match-real.json',import.meta.url),'utf8'));
const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
const cache=new Map(),pending=[],ctx={waitUntil:p=>pending.push(p)};
globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,r)=>cache.set(key.url,r.clone())}};
const homeBench=fixture.rosters[0].roster.find(p=>!p.starter).athlete.id;
const awayStarter=fixture.rosters[1].roster.find(p=>p.starter).athlete.id;
let calls=[];
globalThis.fetch=async url=>{
  calls.push(String(url));const path=new URL(url).pathname;
  if(path.endsWith('/summary'))return Response.json(fixture);
  const team=fixture.rosters.find(r=>path.endsWith('/teams/'+r.team.id+'/roster'));
  if(!team)throw Error('Unexpected upstream');
  return Response.json({team:team.team,athletes:[...team.roster.map(p=>({id:p.athlete.id,
    citizenship:[homeBench,awayStarter].includes(p.athlete.id)?'Uruguay':'Spain'})),
    {id:'99999999',displayName:'Uruguayo fuera de la convocatoria',citizenship:'Uruguay'}]});
};
try{
  assert.equal(isUruguayan({nationality:'Uruguay'}),true);
  assert.equal(isUruguayan({nationality:'Spain',flag:'https://a.espncdn.com/i/teamlogos/countries/500/uru.png'}),true);
  assert.equal(isUruguayan({nationality:'Argentina'}),false);
  assert.equal(isUruguayan({flag:'https://evil.invalid/uru.png'}),false);
  let result=await matchNationalities(normalizeMatchDetails(fixture,'CL','401915313'),'2026','https://site.test',ctx);
  assert.equal(result.match.has_uruguayan,true);
  assert.equal(result.match.uruguayan_players.length,2);
  assert.equal(result.lineups[0].players.find(p=>p.id===homeBench).uruguayan,true);
  assert.equal(result.match.uruguayan_players.find(p=>p.id===homeBench).starter,false,'Unused substitutes count');
  assert.equal(result.match.uruguayan_players.find(p=>p.id===awayStarter).side,'away','Either team counts');
  assert.ok(!result.match.uruguayan_players.some(p=>p.id==='99999999'),'The club roster cannot add an uncalled player');
  assert.ok(calls.every(u=>u.endsWith('/roster?season=2026')));await Promise.all(pending);
  const before=calls.length;
  await matchNationalities(normalizeMatchDetails(fixture,'CL','401915313'),'2026','https://site.test',ctx);
  assert.equal(calls.length,before,'Nationalities are reused across matches');
  const response=await matchDetails(new Request('https://site.test/api/partido?competicion=CL&id=401915313&uruguay=1'),ctx);
  const brief=await response.json();assert.equal(response.status,200);assert.equal(brief.match.has_uruguayan,true);
  assert.equal(brief.match.uruguayan_players.length,2);assert.equal(brief.lineups,undefined);await Promise.all(pending);
  const empty=structuredClone(fixture);empty.rosters=[];calls=[];
  result=await matchNationalities(normalizeMatchDetails(empty,'CL','401915313'),'2026','https://site.test',ctx);
  assert.equal(result.match.has_uruguayan,false);assert.equal(result.match.lineups_published,false);assert.equal(calls.length,0);
  const known=structuredClone(fixture);for(const r of known.rosters)for(const p of r.roster)p.athlete.citizenship='Argentina';
  known.rosters[0].roster[0].athlete.citizenship='Uruguay';
  globalThis.fetch=async()=>{throw Error('offline');};
  result=await matchNationalities(normalizeMatchDetails(known,'CL','401915313'),'2026','https://site.test',ctx);
  assert.equal(result.match.has_uruguayan,true,'An upstream failure keeps known nationality');
  known.rosters[0].roster[0].athlete.citizenship='Argentina';
  result=await matchNationalities(normalizeMatchDetails(known,'CL','401915313'),'2026','https://site.test',ctx);
  assert.equal(result.match.has_uruguayan,false,'A match without Uruguayans stays unmarked');
  const prior=normalizeMatchDetails(known,'CL','401915313');prior.lineups[0].players[0].nationality='Uruguay';
  result=await matchNationalities(normalizeMatchDetails(fixture,'CL','401915313'),'2026','https://offline.test',ctx,prior);
  assert.equal(result.lineups[0].players[0].uruguayan,true,'Nationality lookup failures retain the last known nationality for called-up players');
}finally{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;}
console.log('Uruguay: titulares, suplentes sin entrar, ambos equipos, no convocados, nacionalidad, caché y alineaciones pendientes comprobados.');
