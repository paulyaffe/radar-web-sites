// Cloudflare Pages: fixture and team APIs; other requests stay static.
export const COMPETITIONS = {
  PD: ['La Liga', 'esp.1', false], SA: ['Serie A', 'ita.1', false],
  PL: ['Premier League', 'eng.1', false], FL1: ['Ligue 1', 'fra.1', false],
  DED: ['Eredivisie', 'ned.1', false], PPL: ['Primeira Liga', 'por.1', false],
  BL1: ['Bundesliga', 'ger.1', false], CL: ['Champions League', 'uefa.champions', false],
  EL: ['Europa League', 'uefa.europa', false],
  MLS: ['MLS', 'usa.1', false], MEX: ['Liga MX', 'mex.1', false],
  URU: ['Liga AUF Uruguaya', 'uru.1', false],
  ARG: ['Liga Profesional Argentina', 'arg.1', false],
  BRA: ['Brasileirão Serie A', 'bra.1', false],
  FRIENDLY: ['Amistosos internacionales', 'fifa.friendly', true],
  WORLD: ['Mundial', 'fifa.world', true], EURO: ['Eurocopa', 'uefa.euro', true],
  NATIONS: ['UEFA Nations League', 'uefa.nations', true],
  WQ_EU: ['Clasificación Mundial · Europa', 'fifa.worldq.uefa', true],
  WQ_SA: ['Clasificación Mundial · Sudamérica', 'fifa.worldq.conmebol', true],
  WQ_NA: ['Clasificación Mundial · Concacaf', 'fifa.worldq.concacaf', true],
  WQ_AF: ['Clasificación Mundial · África', 'fifa.worldq.caf', true],
  WQ_AS: ['Clasificación Mundial · Asia', 'fifa.worldq.afc', true],
  WQ_OC: ['Clasificación Mundial · Oceanía', 'fifa.worldq.ofc', true],
  COPA: ['Copa América', 'conmebol.america', true],
  GOLD: ['Copa Oro', 'concacaf.gold', true],
  AFCON: ['Copa Africana de Naciones', 'caf.nations', true],
  ASIAN: ['Copa Asiática', 'afc.asian.cup', true],
};
const TZ = 'Europe/Madrid';
const FRESH_MS = 15 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat('sv-SE', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'});
export function madridDay(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : '';
}
export function validDate(value) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value || '') &&
    Number.isFinite(Date.parse(value + 'T12:00:00Z')) &&
    new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
}
export function teamIcon(team, national) {
  const value = team?.logo || team?.logos?.[0]?.href || '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.espncdn.com') ||
        !url.pathname.startsWith('/i/teamlogos/') ||
        (national && !url.pathname.includes('/countries/'))) return '';
    return url.href;
  } catch { return ''; }
}
function score(value) {
  const s = typeof value === 'object' && value ? value.value : value;
  return /^\d{1,2}$/.test(String(s ?? '')) ? Number(s) : null;
}
function teamId(value) { return /^[1-9]\d{0,8}$/.test(String(value || '')) ? String(value) : ''; }
export function eventMinute(event) {
  const value=String(event?.clock?.displayValue || '').replace(/[’′']/g,'').trim();
  if(!/^\d{1,3}(?:\+\d{1,2})?$/.test(value))return '';
  const added=String(event?.addedClock?.displayValue || '').replace(/[’′']/g,'').trim();
  return value+(!value.includes('+') && /^[1-9]\d?$/.test(added)?'+'+added:'')+'′';
}
export function normalizeGoals(details, homeId, awayId) {
  const rows=[],seen=new Set();
  for(const event of (Array.isArray(details)?details:[]).slice(0,300)) {
    if(event.scoringPlay!==true || event.shootout===true)continue;
    const athlete=event.athletesInvolved?.[0] || event.participants?.[0]?.athlete;
    // ESPN's team identifies the beneficiary, including own goals. Only the
    // first participant scores; subsequent participants can be assistants.
    const team=teamId(event.team?.id),id=teamId(athlete?.id);
    const name=String(athlete?.shortName || athlete?.displayName || '').slice(0,100);
    if(!name || ![homeId,awayId].includes(team) || !team)continue;
    const minute=eventMinute(event),key=[team,id||name,minute,event.ownGoal===true].join(':');
    if(seen.has(key))continue;seen.add(key);
    rows.push({athlete_id:id,name,team_id:team,side:team===homeId?'home':'away',minute,
      penalty:event.penaltyKick===true,own_goal:event.ownGoal===true});
  }
  return rows;
}
export function normalizeEvents(data, code, day, nationalOverride) {
  if (!Array.isArray(data?.events)) throw new Error('Respuesta sin calendario');
  const national = nationalOverride ?? COMPETITIONS[code]?.[2] ?? false;
  const result = [];
  for (const event of data.events.slice(0,200)) {
    if (!madridDay(event.date) || (day && madridDay(event.date) !== day)) continue;
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find(t => t.homeAway === 'home');
    const away = competition?.competitors?.find(t => t.homeAway === 'away');
    if (!home?.team?.displayName || !away?.team?.displayName) continue;
    const status = event.status?.type || competition.status?.type || {};
    const postponed = /POSTPON|CANCEL|ABANDON|SUSPEND|DELAY/i.test(status.name || '');
    const played = !postponed && (status.state === 'in' || status.state === 'post');
    const finished = status.completed === true && status.state === 'post' && !postponed;
    const label = /POSTPON/i.test(status.name || '') ? 'Aplazado' :
      /CANCEL|ABANDON/i.test(status.name || '') ? 'Cancelado' :
      postponed ? 'Suspendido o retrasado' : finished ? 'Finalizado' :
      status.state === 'in' ? 'En curso · dato de la fuente' : 'Programado';
    result.push({id:String(event.id), date:event.date, competition:code,
      competition_name:COMPETITIONS[code]?.[0] || String(event.league?.name || 'Otra competición'),
      home:home.team.displayName, away:away.team.displayName,
      home_id:teamId(home.team.id), away_id:teamId(away.team.id),
      home_icon:teamIcon(home.team,national), away_icon:teamIcon(away.team,national),
      national, home_score:played ? score(home.score) : null,
      away_score:played ? score(away.score) : null, finished, status:label,
      state:status.state, time_confirmed:event.timeValid !== false && competition.timeValid !== false,
      home_penalties:played ? score(home.shootoutScore) : null,
      away_penalties:played ? score(away.shootoutScore) : null,
      venue:String(competition?.venue?.fullName || ''),
      goals:played?normalizeGoals(competition.details,teamId(home.team.id),teamId(away.team.id)):[]});
  }
  return result;
}
function json(value, status=200) {
  return Response.json(value, {status, headers:{'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex'}});
}
async function upstreamJson(upstream, limit=2_000_000) {
  const response = await fetch(upstream, {headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(9000), redirect:'manual'});
  if (!response.ok) { await response.body?.cancel(); throw new Error('Fuente HTTP '+response.status); }
  if (Number(response.headers.get('Content-Length') || 0) > limit) { await response.body?.cancel(); throw new Error('Respuesta demasiado grande'); }
  const raw = await response.text();
  if (raw.length > limit) throw new Error('Respuesta demasiado grande');
  return JSON.parse(raw);
}
async function queryDay(code, day, selectedDay) {
  const upstream = new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/' + COMPETITIONS[code][1] + '/scoreboard');
  upstream.searchParams.set('dates', day.replaceAll('-',''));
  return normalizeEvents(await upstreamJson(upstream), code, selectedDay);
}
async function competitionDay(code, day, old) {
  const yesterday = new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
  // Include the previous UTC date to catch kickoffs after midnight in Madrid.
  const values = await Promise.allSettled([queryDay(code,day,day), queryDay(code,yesterday,day)]);
  const rows = new Map();
  for (const value of values) if (value.status === 'fulfilled') for (const m of value.value) rows.set(m.id,m);
  const failed = values.some(v => v.status === 'rejected');
  if (failed) console.warn('Calendario '+code+': '+values.filter(v=>v.status==='rejected').map(v=>String(v.reason?.message||'error')).join('; '));
  if (failed && old?.matches) for (const m of old.matches) if (!rows.has(m.id) && madridDay(m.date) === day) rows.set(m.id,m);
  return {code, name:COMPETITIONS[code][0], national:COMPETITIONS[code][2],
    updated:failed ? old?.updated || null : new Date().toISOString(),
    stale:failed && Boolean(old), error:failed ? 'No se ha podido consultar todo el día. La lista puede estar incompleta.' : null,
    source:'https://www.espn.com/soccer/scoreboard/_/league/'+COMPETITIONS[code][1],
    matches:[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
// The provider publishes either a whitelist of playing days or competition
// phases. Phase boundaries are not fixtures: use actual events in that case.
export function calendarDates(data) {
  const dates = new Set();
  for (const event of data?.events || []) {
    const teams = event.competitions?.[0]?.competitors || [];
    if (!teams.some(t=>t.homeAway==='home' && t.team?.displayName) ||
        !teams.some(t=>t.homeAway==='away' && t.team?.displayName)) continue;
    const day = madridDay(event.date); if (validDate(day)) dates.add(day);
  }
  return dates;
}
export async function competitionCalendar(code, day) {
  const base = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'+COMPETITIONS[code][1]+'/scoreboard?dates=';
  const data = await upstreamJson(base+day.replaceAll('-',''));
  const league = data.leagues?.[0];
  if (league?.calendarType === 'day' && league.calendarIsWhitelist === true &&
      Array.isArray(league.calendar) && league.calendar.every(d=>typeof d==='string' && validDate(d.slice(0,10)))) {
    const dates = calendarDates(data);
    for (const value of league.calendar) {
      // Whitelist entries label a source day, rather than a kickoff. Include
      // the following Madrid day too; the client verifies real fixtures.
      const d = value.slice(0,10); dates.add(d);
      dates.add(new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10));
    }
    const from = league.calendarStartDate?.slice(0,10), to = league.calendarEndDate?.slice(0,10);
    if (validDate(from) && validDate(to) && from <= day && day < to)
      return {dates:[...dates].sort(),from,to};
  }
  const year = Number(day.slice(0,4));
  const annual = await upstreamJson(base+year+'&limit=1000',8_000_000);
  if (!Array.isArray(annual.events) || annual.events.length >= 1000) throw Error('Calendario anual incompleto');
  const dates = calendarDates(annual);
  // The previous UTC year's final evening can fall on 1 January in Madrid.
  const boundary = await upstreamJson(base+(year-1)+'1231');
  for (const d of calendarDates(boundary)) if (d.slice(0,4) === String(year)) dates.add(d);
  return {dates:[...dates].sort(),from:year+'-01-01',to:(year+1)+'-01-01'};
}
async function fixtureCalendar(url, code, day, ctx) {
  if (!COMPETITIONS[code]) return json({error:'Selecciona una competición concreta.'},400);
  const cache = globalThis.caches?.default;
  const key = new Request(url.origin+'/api/partidos?calendario=1&competicion='+code+'&fecha='+day+'&v=1');
  try {
    const old = await cache?.match(key), data = old && await old.json();
    if (data && Date.now()-Date.parse(data.checked_at)<FRESH_MS) return json(data);
  } catch { /* cache is optional */ }
  try {
    const payload = {competition:code,...await competitionCalendar(code,day),complete:true,checked_at:new Date().toISOString()};
    if (cache) ctx.waitUntil(cache.put(key,new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=900'}})).catch(()=>{}));
    return json(payload);
  } catch (e) { console.warn('Fechas '+code+': '+String(e.message)); return json({complete:false,error:'Calendario no disponible.'},503); }
}
export async function fixtures(request, ctx={waitUntil:()=>{}}) {
  if (request.method !== 'GET') return json({error:'Método no permitido'},405);
  const url = new URL(request.url);
  const day = url.searchParams.get('fecha') || madridDay(Date.now());
  const choice = url.searchParams.get('competicion') || 'clubes';
  if (!validDate(day)) return json({error:'Selecciona una fecha válida (AAAA-MM-DD).'},400);
  if (url.searchParams.get('calendario') === '1') return fixtureCalendar(url,choice,day,ctx);
  const codes = choice === 'clubes' || choice === 'selecciones' ?
    Object.keys(COMPETITIONS).filter(c => COMPETITIONS[c][2] === (choice === 'selecciones')) :
    COMPETITIONS[choice] ? [choice] : [];
  if (!codes.length) return json({error:'Competición no disponible.'},400);
  // Groups keep each request below the free plan's subrequest limit.
  const cache = globalThis.caches?.default;
  const key = new Request(url.origin+'/api/partidos?fecha='+day+'&competicion='+choice+'&v=4');
  let cached;
  try { const response = await cache?.match(key); cached = response && await response.json(); } catch { /* cache is optional */ }
  if (cached && Date.now()-Date.parse(cached.checked_at) < FRESH_MS) return json(cached);
  const competitions = await Promise.all(codes.map(c => competitionDay(c,day,cached?.competitions?.find(x=>x.code===c))));
  const complete = competitions.every(c=>!c.error);
  const payload = {date:day, timezone:TZ, checked_at:new Date().toISOString(), complete,
    competitions, attribution:'Calendario y marcadores: ESPN. Horarios sujetos a cambios. No es un servicio oficial en directo.'};
  if (cache && competitions.some(c=>!c.error)) {
    ctx.waitUntil(cache.put(key,new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json',
      'Cache-Control':'public, max-age=86400'}})).catch(()=>{}));
  }
  return json(payload, competitions.every(c=>c.error && !c.matches.length) ? 503 : 200);
}

// Resolve names from the periodic OpenFootball copy only inside its league.
// Known spelling variants still have to match a team in ESPN's league roster.
export function nameKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/f\.c\./g,'fc').replace(/[^a-z0-9 ]/g,' ')
    .split(/\s+/).filter(s=>s && !/^(fc|cf|afc|ac|as|acf|bc|cfc|ss|ssc|us|ud|sc|sbv|cd|cs|gd|calcio|\d+)$/.test(s)).join(' ');
}
const ALIASES = {
  'deportivo a coruna':'deportivo', 'deportivo alaves':'alaves', 'espanyol barcelona':'espanyol', 'villareal':'villarreal', 'ca osasuna':'osasuna',
  'internazionale milano':'internazionale', 'olympique lyonnais':'lyon', 'olympique de marseille':'marseille',
  'racing club de lens':'lens', 'strasbourg alsace':'strasbourg', 'rc strasbourg alsace':'strasbourg', 'stade brestois':'brest',
  'lille osc':'lille', 'angers sco':'angers', 'ogc nice':'nice', 'es troyes':'troyes',
  'ajax':'ajax amsterdam', 'az':'az alkmaar', 'twente':'twente', 'cambuur leeuwarden':'cambuur',
  'willem ii tilburg':'willem ii', 'sport lisboa e benfica':'benfica', 'sporting clube de braga':'braga',
  'sporting clube de portugal':'sporting', 'estrela da amadora':'estrela', 'estoril praia':'estoril',
  'vitoria guimaraes':'vitoria de guimaraes', 'koln':'cologne', 'fsv mainz':'mainz',
  'bayern munchen':'bayern munich', 'hamburger sv':'hamburg sv', 'sv werder bremen':'werder bremen'
};
export function resolveTeam(data, name) {
  const key = nameKey(name); const target = ALIASES[key] || key;
  const teams = (data?.sports || []).flatMap(s=>(s.leagues || []).flatMap(l=>(l.teams || []).map(t=>t.team)));
  const matches = teams.filter(t=>t && [t.displayName,t.shortDisplayName,t.name,t.location].some(n=>nameKey(n) === target));
  if (matches.length !== 1 || !teamId(matches[0].id)) throw Error('No se ha podido identificar este equipo en la fuente.');
  return teamId(matches[0].id);
}
async function cachedRoster(origin, code, ctx) {
  const cache = globalThis.caches?.default;
  const key = new Request(origin+'/api/equipo?plantilla='+code+'&v=1');
  try { const old = await cache?.match(key); if(old) return await old.json(); } catch {}
  const data = await upstreamJson('https://site.api.espn.com/apis/site/v2/sports/soccer/'+COMPETITIONS[code][1]+'/teams?limit=100');
  if (!Array.isArray(data?.sports)) throw Error('Plantilla no disponible.');
  if (cache) ctx.waitUntil(cache.put(key,new Response(JSON.stringify(data),{headers:{'Cache-Control':'public, max-age=86400'}})).catch(()=>{}));
  return data;
}
export function scheduleRows(data, id) {
  if (teamId(data?.team?.id) !== id || typeof data.team.isNational !== 'boolean' || typeof data.team.displayName !== 'string') throw Error('El equipo de la respuesta no coincide.');
  const rows = [];
  if (!Array.isArray(data.events)) throw Error('Respuesta sin partidos.');
  for (const event of data.events.slice(0,400)) {
    const code = Object.keys(COMPETITIONS).find(c=>COMPETITIONS[c][1] === event.league?.slug) || '';
    for (const row of normalizeEvents({events:[event]},code,undefined,data.team.isNational)) {
      if (row.home_id === id || row.away_id === id) rows.push(row);
    }
  }
  return rows;
}
export function selectFive(rows, future, now=Date.now()) {
  const unique = [...new Map(rows.map(m=>[m.id,m])).values()];
  return unique.filter(m=>future ? !m.finished && m.state === 'pre' && m.status !== 'Cancelado' && Date.parse(m.date)>=now :
    m.finished && Date.parse(m.date)<=now)
    .sort((a,b)=>future ? Date.parse(a.date)-Date.parse(b.date) : Date.parse(b.date)-Date.parse(a.date)).slice(0,5);
}
async function schedulePart(id, future, old) {
  const rows = []; let data, error;
  try {
    const base='https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/'+id+'/schedule';
    const fetched = await upstreamJson(base+'?fixture='+future);
    rows.push(...scheduleRows(fetched,id));
    data = fetched;
    const year = Number(data.season?.year);
    // Early in a season, include the preceding season to find five real results.
    if (!future && selectFive(rows,false).length<5 && year>=2001 && year<=2099) {
      const previous = await upstreamJson(base+'?fixture=false&season='+(year-1));
      rows.push(...scheduleRows(previous,id));
    }
  } catch (e) { error='No se ha podido renovar toda esta lista.'; console.warn('Equipo '+id+': '+String(e.message)); }
  if (error && old?.matches) rows.push(...old.matches.filter(m=>!rows.some(r=>r.id === m.id)));
  return {data, part:{matches:selectFive(rows,future), updated:error ? old?.updated || null : new Date().toISOString(),
    stale:Boolean(error && old), error:error || null}};
}
export async function teamHistory(request, ctx={waitUntil:()=>{}}) {
  if(request.method !== 'GET') return json({error:'Método no permitido'},405);
  const url=new URL(request.url), supplied=url.searchParams.get('id'), name=url.searchParams.get('nombre');
  const code=url.searchParams.get('competicion'); let id=teamId(supplied);
  if ((supplied && !id) || (!id && (!name || name.length>100 || !COMPETITIONS[code]))) return json({error:'Equipo no válido.'},400);
  try {
    if (!id) id=resolveTeam(await cachedRoster(url.origin,code,ctx),name);
  } catch { return json({error:'No se ha podido identificar el equipo. Vuelve a intentarlo desde el calendario por fecha.'},503); }
  const cache=globalThis.caches?.default, key=new Request(url.origin+'/api/equipo?id='+id+'&v=2'); let old;
  try { const response=await cache?.match(key); old=response && await response.json(); } catch {}
  if(old && Date.now()-Date.parse(old.checked_at)<FRESH_MS) return json(old);
  const [past,future]=await Promise.all([schedulePart(id,false,old?.past),schedulePart(id,true,old?.future)]);
  const data=past.data || future.data;
  if (!data?.team || teamId(data.team.id)!==id) {
    if(old) return json({...old,complete:false,past:{...old.past,stale:true,error:'No se ha podido renovar esta lista.'},future:{...old.future,stale:true,error:'No se ha podido renovar esta lista.'}});
    return json({error:'La fuente no está disponible. Inténtalo más tarde.'},503);
  }
  const national=data.team.isNational;
  const payload={team:{id,name:data.team.displayName,icon:teamIcon(data.team,national),national},
    past:past.part,future:future.part,checked_at:new Date().toISOString(),
    complete:!past.part.error && !future.part.error,
    source:'https://www.espn.com/soccer/team/results/_/id/'+id,
    attribution:'Datos de ESPN. Todas las competiciones disponibles para este equipo. Horarios sujetos a cambios.'};
  if(cache && payload.complete) ctx.waitUntil(cache.put(key,new Response(JSON.stringify(payload),{headers:{'Cache-Control':'public, max-age=86400'}})).catch(()=>{}));
  return json(payload);
}
function statNumber(stats, name) {
  const raw=stats?.find(s=>s.name===name)?.value;
  return raw !== null && raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : null;
}
function simpleTeam(team, national=false) {
  return {id:teamId(team?.id),name:String(team?.displayName || team?.name || ''),icon:teamIcon(team,national),national};
}
export function normalizeStandings(data, code) {
  const groups=[]; const national=COMPETITIONS[code][2];
  function visit(node, depth=0) {
    if(depth>5 || !node) return;
    if(Array.isArray(node.standings?.entries)) {
      const rows=node.standings.entries.slice(0,100).filter(e=>e.team?.displayName).map(e=>({team:simpleTeam(e.team,national),
        rank:statNumber(e.stats,'rank'),played:statNumber(e.stats,'gamesPlayed'),won:statNumber(e.stats,'wins'),
        drawn:statNumber(e.stats,'ties'),lost:statNumber(e.stats,'losses'),for:statNumber(e.stats,'pointsFor'),
        against:statNumber(e.stats,'pointsAgainst'),difference:statNumber(e.stats,'pointDifferential'),points:statNumber(e.stats,'points')}))
        .sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity));
      if(rows.length)groups.push({name:String(node.name || node.standings.name || COMPETITIONS[code][0]),rows});
    }
    for(const child of (node.children || []).slice(0,100))visit(child,depth+1);
  }
  visit(data); return groups;
}
export function normalizeScorers(data, code) {
  if(!Array.isArray(data?.stats))throw Error('Respuesta sin estadísticas');
  const leaders=data.stats.find(s=>s.name==='goalsLeaders')?.leaders || [];
  return leaders.slice(0,100).filter(l=>l.athlete?.displayName && statNumber(l.athlete.statistics,'totalGoals')!==null)
    .map(l=>({name:l.athlete.displayName,athlete_id:teamId(l.athlete.id),...athleteNationality(l.athlete),team:simpleTeam(l.athlete.team,COMPETITIONS[code][2]),
      goals:statNumber(l.athlete.statistics,'totalGoals'),played:statNumber(l.athlete.statistics,'appearances')}))
    .sort((a,b)=>b.goals-a.goals);
}
async function cachedData(url,key,ctx,build,freshMs=FRESH_MS) {
  const cache=globalThis.caches?.default;const request=new Request(url.origin+key);let old;
  try{const r=await cache?.match(request);old=r && await r.json();}catch{}
  if(old && Date.now()-Date.parse(old.checked_at || old.updated)<freshMs)return json(old);
  try{
    const payload={updated:new Date().toISOString(),stale:false,...await build(),checked_at:new Date().toISOString()};
    if(cache)ctx.waitUntil(cache.put(request,new Response(JSON.stringify(payload),{headers:{'Cache-Control':'public, max-age=86400'}})).catch(()=>{}));
    return json(payload);
  }catch(e){
    console.warn('Datos deportivos: '+String(e.message));
    return old ? json({...old,stale:true,error:'No se ha podido actualizar. Se muestra la última copia disponible.'}) : json({error:'No se pueden consultar los datos ahora. Inténtalo de nuevo.'},503);
  }
}
function playerPhoto(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && url.hostname.endsWith('.espncdn.com') &&
      url.pathname.startsWith('/i/headshots/soccer/')?url.href:'';
  }catch{return '';}
}
function playerEvents(player) {
  const events=[];
  for(const play of (player.plays || []).slice(0,40)) {
    if(play.shootout===true)continue;
    const minute=eventMinute(play);
    for(const [type,present]of [['goal',play.didScore&&!play.ownGoal],['own_goal',play.ownGoal],
      ['assist',play.didAssist],['red',play.redCard],['yellow',play.yellowCard],
      ['out',play.substitution&&player.starter&&player.subbedOut],['in',play.substitution&&player.subbedIn]]) {
      if(present)events.push({type,minute});
    }
  }
  for(const [type,present]of [['in',player.subbedIn],['out',player.subbedOut]])
    if(present&&!events.some(e=>e.type===type))events.push({type,minute:''});
  return events;
}
function normalizePlayer(player) {
  const athlete=player.athlete || {},id=teamId(athlete.id);
  const number=String(player.jersey || athlete.jersey || '');
  const code=String(player.position?.abbreviation || '').slice(0,12);
  const position=/^(G|GK)$/.test(code)?'Portero':/^(CD(?:-[LR])?|CB(?:-[LR])?|LB|RB|D|DL|DR|DC)$/.test(code)?'Defensa':
    /^(AM|DM|CM|LM|RM|M|LWB|RWB)/.test(code)?'Centrocampista':code==='SUB'?'Suplente':/^(F|ST|CF|LW|RW)/.test(code)?'Delantero':'';
  return {id,name:String(athlete.displayName || athlete.fullName || '').slice(0,100),
    short_name:String(athlete.shortName || athlete.displayName || '').slice(0,100),
    number:/^\d{1,3}$/.test(number)?number:'',position,position_code:code,
    starter:player.starter===true,place:Number(player.formationPlace)||null,
    photo:playerPhoto(athlete.headshot?.href || athlete.headshot || player.media?.headshot?.href),
    events:playerEvents(player)};
}
// Formation places and roles describe the published initial formation, not
// tracking coordinates or the players' positions at the end of the match.
export function formationRows(players, formation) {
  if(!/^\d(?:-\d){1,4}$/.test(formation))return [];
  const counts=formation.split('-').map(Number),starters=players.filter(p=>p.starter);
  if(counts.some(n=>n<1||n>5)||counts.reduce((a,b)=>a+b,0)!==10||starters.length!==11)return [];
  const keeper=starters.filter(p=>/^(G|GK)$/.test(p.position_code));
  if(keeper.length!==1)return [];
  function depth(p){
    const c=p.position_code;
    if(/^(CD(?:-[LR])?|CB(?:-[LR])?|LB|RB|D|DL|DR|DC)$/.test(c))return 10;
    if(/^DM/.test(c))return 20;
    if(/^(CM|LM|RM|M|LWB|RWB)/.test(c))return 30;
    if(/^AM/.test(c))return 40;
    if(/^(F|ST|CF|LW|RW)/.test(c))return 50;
    return null;
  }
  const field=starters.filter(p=>p!==keeper[0]);
  if(field.some(p=>depth(p)===null) || field.filter(p=>depth(p)===10).length!==counts[0])return [];
  const side=p=>/^(LB|LWB|LW|LM|DL)$/.test(p.position_code)?-2:/(?:-L)$/.test(p.position_code)?-1:
    /^(RB|RWB|RW|RM|DR)$/.test(p.position_code)?2:/(?:-R)$/.test(p.position_code)?1:0;
  field.sort((a,b)=>depth(a)-depth(b)||(a.place||0)-(b.place||0));
  const rows=[[keeper[0].id]];let offset=0;
  for(const count of counts){
    const row=field.slice(offset,offset+count).sort((a,b)=>side(a)-side(b));
    rows.push(row.map(p=>p.id));offset+=count;
  }
  return new Set(starters.map(p=>p.id)).size===11 && starters.every(p=>p.id)?rows:[];
}
export function normalizeMatchDetails(data, code, id) {
  const header=data?.header,competition=header?.competitions?.[0];
  if(String(header?.id)!==id || String(competition?.id)!==id)throw Error('El partido no coincide.');
  if(header.league?.slug && header.league.slug!==COMPETITIONS[code][1])throw Error('La competición no coincide.');
  const match=normalizeEvents({events:[{...header,date:competition.date,status:competition.status}]},code)[0];
  if(!match)throw Error('Partido sin equipos o fecha.');
  const lineups=[];
  for(const side of ['home','away']) {
    const roster=data.rosters?.find(r=>teamId(r.team?.id)===match[side+'_id']);
    const players=(roster?.roster || []).slice(0,60).map(normalizePlayer).filter(p=>p.id&&p.name);
    const formation=String(roster?.formation || '').slice(0,15);
    lineups.push({side,team:{id:match[side+'_id'],name:match[side],icon:match[side+'_icon'],national:match.national},
      formation:/^\d(?:-\d){1,4}$/.test(formation)?formation:'',players,
      rows:formationRows(players,formation),coach:String(roster?.coach?.displayName || roster?.coaches?.[0]?.displayName || '').slice(0,100)});
  }
  return {match:{...match,venue:String(data.gameInfo?.venue?.fullName || match.venue).slice(0,160)},lineups,
    source:'https://www.espn.com/soccer/lineups/_/gameId/'+id,
    attribution:'Goles y alineaciones iniciales: ESPN. La cobertura depende del partido.'};
}
export async function matchDetails(request,ctx={waitUntil:()=>{}}) {
  if(request.method!=='GET')return json({error:'Método no permitido'},405);
  const url=new URL(request.url),code=url.searchParams.get('competicion'),id=teamId(url.searchParams.get('id'));
  if(!id||!COMPETITIONS[code])return json({error:'Partido o competición no válidos.'},400);
  return cachedData(url,'/api/partido?competicion='+code+'&id='+id+'&v=1',ctx,async()=>
    normalizeMatchDetails(await upstreamJson('https://site.api.espn.com/apis/site/v2/sports/soccer/'+
      COMPETITIONS[code][1]+'/summary?event='+id,4_000_000),code,id),60*1000);
}
export async function competitionTable(request,ctx={waitUntil:()=>{}},env={}) {
  if(request.method!=='GET')return json({error:'Método no permitido'},405);
  const url=new URL(request.url),code=url.searchParams.get('competicion'),type=url.searchParams.get('tipo');
  if(!COMPETITIONS[code] || !['clasificacion','goleadores'].includes(type))return json({error:'Competición o tabla no válida.'},400);
  if(code==='FRIENDLY' && type==='clasificacion')return json({competition:code,name:COMPETITIONS[code][0],type,season:'',groups:[],scorers:[],stale:false});
  return cachedData(url,'/api/tabla?competicion='+code+'&tipo='+type+'&v=3',ctx,async()=>{
    const slug=COMPETITIONS[code][1];
    let data,snapshot;
    try{
      data=await upstreamJson(type==='clasificacion'?'https://site.web.api.espn.com/apis/v2/sports/soccer/'+slug+'/standings':
        'https://site.api.espn.com/apis/site/v2/sports/soccer/'+slug+'/statistics');
    }catch(e){
      if(type!=='clasificacion'||!env.ASSETS)throw e;
      const copy=await env.ASSETS.fetch(new Request(url.origin+'/clasificaciones.json'));
      if(!copy.ok)throw e;
      snapshot=(await copy.json()).competitions?.[code];
      if(!snapshot?.data || !snapshot.updated)throw e;
      data=snapshot.data;
    }
    if(type==='clasificacion' && !Array.isArray(data?.children) && !data?.standings)throw Error('Respuesta sin clasificación');
    const season=data.season;const seasonLabel=typeof season==='object'?season?.displayName || season?.name || season?.year : season;
    // ESPN can identify a league and season while publishing no player statistics.
    const noScorerCoverage=type==='goleadores' && !Array.isArray(data.stats) && Boolean(data.league && data.season);
    return {competition:code,name:COMPETITIONS[code][0],type,season:String(seasonLabel || ''),
      groups:type==='clasificacion'?normalizeStandings(data,code):[],scorers:type==='goleadores'&&!noScorerCoverage?normalizeScorers(data,code):[],
      ...(noScorerCoverage?{available:false}:{}),
      ...(snapshot?{updated:snapshot.updated,stale:Boolean(snapshot.error)||Date.now()-Date.parse(snapshot.updated)>6*3600000,
        ...(snapshot.error?{error:'No se ha podido renovar esta tabla. Se conserva su fecha original.'}:{})}:{})};
  });
}
export function athleteNationality(athlete) {
  return {flag:teamIcon({logo:athlete?.flag?.href},true),
    nationality:typeof athlete?.citizenship==='string'?athlete.citizenship:String(athlete?.flag?.alt || '')};
}
async function playerNationality(id,origin,ctx) {
  const cache=globalThis.caches?.default,key=new Request(origin+'/api/banderas?jugador='+id+'&v=1');
  try{const cached=await cache?.match(key);if(cached)return await cached.json();}catch{}
  try{
    const data=await upstreamJson('https://site.api.espn.com/apis/common/v3/sports/soccer/all/athletes/'+id);
    if(teamId(data?.athlete?.id)!==id)throw Error('Jugador no coincidente');
    const player={id,...athleteNationality(data.athlete)};
    if(cache)ctx.waitUntil(cache.put(key,new Response(JSON.stringify(player),{headers:{'Cache-Control':'public, max-age=86400'}})).catch(()=>{}));
    return player;
  }catch{return {id,flag:'',nationality:''};}
}
export async function playerFlags(request,ctx={waitUntil:()=>{}}) {
  if(request.method!=='GET')return json({error:'Método no permitido'},405);
  const url=new URL(request.url),values=(url.searchParams.get('jugadores') || '').split(',');
  if(!values.length||values.length>10||values.some(id=>!teamId(id)||teamId(id)!==id))return json({error:'Jugadores no válidos'},400);
  const ids=[...new Set(values)];
  return json({players:await Promise.all(ids.map(id=>playerNationality(id,url.origin,ctx)))});
}
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/partidos') return fixtures(request,ctx);
    if (new URL(request.url).pathname === '/api/equipo') return teamHistory(request,ctx);
    if (new URL(request.url).pathname === '/api/partido') return matchDetails(request,ctx);
    if (new URL(request.url).pathname === '/api/tabla') return competitionTable(request,ctx,env);
    if (new URL(request.url).pathname === '/api/banderas') return playerFlags(request,ctx);
    return env.ASSETS.fetch(request);
  }
};
