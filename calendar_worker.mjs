// Cloudflare Pages: fixture and team APIs; other requests stay static.
export const COMPETITIONS = {
  PD: ['La Liga', 'esp.1', false], SA: ['Serie A', 'ita.1', false],
  PL: ['Premier League', 'eng.1', false], FL1: ['Ligue 1', 'fra.1', false],
  DED: ['Eredivisie', 'ned.1', false], PPL: ['Primeira Liga', 'por.1', false],
  BL1: ['Bundesliga', 'ger.1', false], CL: ['Champions League', 'uefa.champions', false],
  EL: ['Europa League', 'uefa.europa', false],
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
      venue:String(competition?.venue?.fullName || '')});
  }
  return result;
}
function json(value, status=200) {
  return Response.json(value, {status, headers:{'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex'}});
}
async function upstreamJson(upstream) {
  const response = await fetch(upstream, {headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(9000), redirect:'manual'});
  if (!response.ok) throw new Error('Fuente HTTP '+response.status);
  if (Number(response.headers.get('Content-Length') || 0) > 2_000_000) throw new Error('Respuesta demasiado grande');
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('Respuesta demasiado grande');
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
export async function fixtures(request, ctx={waitUntil:()=>{}}) {
  if (request.method !== 'GET') return json({error:'Método no permitido'},405);
  const url = new URL(request.url);
  const day = url.searchParams.get('fecha') || madridDay(Date.now());
  const choice = url.searchParams.get('competicion') || 'clubes';
  if (!validDate(day)) return json({error:'Selecciona una fecha válida (AAAA-MM-DD).'},400);
  const codes = choice === 'clubes' || choice === 'selecciones' ?
    Object.keys(COMPETITIONS).filter(c => COMPETITIONS[c][2] === (choice === 'selecciones')) :
    COMPETITIONS[choice] ? [choice] : [];
  if (!codes.length) return json({error:'Competición no disponible.'},400);
  // Groups keep each request below the free plan's subrequest limit.
  const cache = globalThis.caches?.default;
  const key = new Request(url.origin+'/api/partidos?fecha='+day+'&competicion='+choice+'&v=2');
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
  const cache=globalThis.caches?.default, key=new Request(url.origin+'/api/equipo?id='+id+'&v=1'); let old;
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
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/partidos') return fixtures(request,ctx);
    if (new URL(request.url).pathname === '/api/equipo') return teamHistory(request,ctx);
    return env.ASSETS.fetch(request);
  }
};
