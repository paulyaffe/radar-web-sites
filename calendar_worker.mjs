// Cloudflare Pages: only /api/partidos uses this Worker; other requests stay static.
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
export function normalizeEvents(data, code, day) {
  if (!Array.isArray(data?.events)) throw new Error('Respuesta sin calendario');
  const national = COMPETITIONS[code][2];
  const result = [];
  for (const event of data.events.slice(0,200)) {
    if (madridDay(event.date) !== day) continue;
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find(t => t.homeAway === 'home');
    const away = competition?.competitors?.find(t => t.homeAway === 'away');
    if (!home?.team?.displayName || !away?.team?.displayName) continue;
    const status = event.status?.type || competition.status?.type || {};
    const postponed = /POSTPON|CANCEL|ABANDON|SUSPEND|DELAY/i.test(status.name || '');
    const played = !postponed && (status.state === 'in' || status.state === 'post');
    const finished = status.completed === true && !postponed;
    const label = /POSTPON/i.test(status.name || '') ? 'Aplazado' :
      /CANCEL|ABANDON/i.test(status.name || '') ? 'Cancelado' :
      postponed ? 'Suspendido o retrasado' : finished ? 'Finalizado' :
      status.state === 'in' ? 'En curso · dato de la fuente' : 'Programado';
    result.push({id:String(event.id), date:event.date, competition:code,
      home:home.team.displayName, away:away.team.displayName,
      home_icon:teamIcon(home.team,national), away_icon:teamIcon(away.team,national),
      national, home_score:played ? score(home.score) : null,
      away_score:played ? score(away.score) : null, finished, status:label,
      venue:String(competition?.venue?.fullName || '')});
  }
  return result;
}
function json(value, status=200) {
  return Response.json(value, {status, headers:{'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex'}});
}
async function queryDay(code, day, selectedDay) {
  const upstream = new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/' + COMPETITIONS[code][1] + '/scoreboard');
  upstream.searchParams.set('dates', day.replaceAll('-',''));
  const response = await fetch(upstream, {headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(9000), redirect:'manual'});
  if (!response.ok) throw new Error('Fuente HTTP '+response.status);
  if (Number(response.headers.get('Content-Length') || 0) > 2_000_000) throw new Error('Respuesta demasiado grande');
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('Respuesta demasiado grande');
  return normalizeEvents(JSON.parse(raw), code, selectedDay);
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
  const key = new Request(url.origin+'/api/partidos?fecha='+day+'&competicion='+choice+'&v=1');
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
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/partidos') return fixtures(request,ctx);
    return env.ASSETS.fetch(request);
  }
};
