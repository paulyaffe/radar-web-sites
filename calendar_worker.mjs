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
        against:statNumber(e.stats,'pointsAgainst'),difference:statNumber(e.stats,'pointDifferential'),points:statNumber(e.stats,'points')}));
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
async function cachedData(url,key,ctx,build) {
  const cache=globalThis.caches?.default;const request=new Request(url.origin+key);let old;
  try{const r=await cache?.match(request);old=r && await r.json();}catch{}
  if(old && Date.now()-Date.parse(old.checked_at || old.updated)<FRESH_MS)return json(old);
  try{
    const payload={updated:new Date().toISOString(),stale:false,...await build(),checked_at:new Date().toISOString()};
    if(cache)ctx.waitUntil(cache.put(request,new Response(JSON.stringify(payload),{headers:{'Cache-Control':'public, max-age=86400'}})).catch(()=>{}));
    return json(payload);
  }catch(e){
    console.warn('Datos deportivos: '+String(e.message));
    return old ? json({...old,stale:true,error:'No se ha podido actualizar. Se muestra la última copia disponible.'}) : json({error:'No se pueden consultar los datos ahora. Inténtalo de nuevo.'},503);
  }
}
export async function competitionTable(request,ctx={waitUntil:()=>{}},env={}) {
  if(request.method!=='GET')return json({error:'Método no permitido'},405);
  const url=new URL(request.url),code=url.searchParams.get('competicion'),type=url.searchParams.get('tipo');
  if(!COMPETITIONS[code] || !['clasificacion','goleadores'].includes(type))return json({error:'Competición o tabla no válida.'},400);
  if(code==='FRIENDLY' && type==='clasificacion')return json({competition:code,name:COMPETITIONS[code][0],type,season:'',groups:[],scorers:[],stale:false});
  return cachedData(url,'/api/tabla?competicion='+code+'&tipo='+type+'&v=2',ctx,async()=>{
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
    return {competition:code,name:COMPETITIONS[code][0],type,season:String(seasonLabel || ''),
      groups:type==='clasificacion'?normalizeStandings(data,code):[],scorers:type==='goleadores'?normalizeScorers(data,code):[],
      ...(snapshot?{updated:snapshot.updated,stale:Boolean(snapshot.error)||Date.now()-Date.parse(snapshot.updated)>6*3600000,
        ...(snapshot.error?{error:'No se ha podido renovar esta tabla. Se conserva su fecha original.'}:{})}:{})};
  });
}
export function normalizeTennis(data,tour,day) {
  if(!Array.isArray(data?.events))throw Error('Respuesta sin tenis');
  const rows=[];
  for(const event of data.events.slice(0,50))for(const group of (event.groupings || []).slice(0,8)){
    const doubles=/doubles/.test(group.grouping?.slug || '');
    for(const match of (group.competitions || []).slice(0,600)){
      if(madridDay(match.date)!==day || match.competitors?.length!==2)continue;
      const state=match.status?.type || {},played=state.state==='in'||state.state==='post';
      const players=[...match.competitors].sort((a,b)=>(a.order||0)-(b.order||0)).map(p=>({
        name:String(p.athlete?.displayName || p.roster?.displayName || p.team?.displayName || 'Por confirmar'),
        flags:(p.athlete?[p.athlete]:p.roster?.athletes || []).map(a=>teamIcon({logo:a.flag?.href},true)).filter(Boolean),
        winner:p.winner===true,sets:played?(p.linescores || []).slice(0,5).map(s=>({score:score(s),tie:score(s.tiebreak)})):[]
      }));
      rows.push({id:tour+'-'+event.id+'-'+match.id,date:match.date,time_confirmed:match.timeValid!==false,tour,
        tournament:String(event.name || tour.toUpperCase()),doubles,round:String(match.round?.displayName || ''),players,
        status:/RETIRED/i.test(state.name)?'Retiro':/WALKOVER/i.test(state.name)?'Incomparecencia':/POSTPON|DELAY|SUSPEND/i.test(state.name)?'Aplazado':
          /CANCEL/i.test(state.name)?'Cancelado':state.completed?'Finalizado':state.state==='in'?'En juego':'Programado'});
    }
  }
  return rows.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
export async function tennisFixtures(request,ctx={waitUntil:()=>{}}) {
  if(request.method!=='GET')return json({error:'Método no permitido'},405);
  const url=new URL(request.url),day=url.searchParams.get('fecha') || madridDay(Date.now()),tour=url.searchParams.get('circuito') || 'atp';
  if(!validDate(day)||!['atp','wta'].includes(tour))return json({error:'Fecha o circuito no válido.'},400);
  return cachedData(url,'/api/tenis?fecha='+day+'&circuito='+tour+'&v=1',ctx,async()=>{
    const previous=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10),rows=[];
    for(const date of [day,previous]){
      const data=await upstreamJson('https://site.api.espn.com/apis/site/v2/sports/tennis/'+tour+'/scoreboard?dates='+date.replaceAll('-',''),6_000_000);
      rows.push(...normalizeTennis(data,tour,day));
    }
    return {date:day,tour,timezone:TZ,matches:[...new Map(rows.map(m=>[m.id,m])).values()]};
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
    if (new URL(request.url).pathname === '/api/tabla') return competitionTable(request,ctx,env);
    if (new URL(request.url).pathname === '/api/tenis') return tennisFixtures(request,ctx);
    if (new URL(request.url).pathname === '/api/banderas') return playerFlags(request,ctx);
    return env.ASSETS.fetch(request);
  }
};
