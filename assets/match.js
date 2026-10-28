(function(){
  'use strict';
  const root=document.querySelector('[data-match-detail]');if(!root)return;
  const status=root.querySelector('[data-match-status]'),content=root.querySelector('[data-match-content]');
  const params=new URLSearchParams(location.search),query=new URLSearchParams({id:params.get('id')||'',competicion:params.get('competicion')||''});
  const formatter=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});let rendered=false;
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function when(value,confirmed=true){const p=Object.fromEntries(formatter.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+(confirmed?' '+p.hour+':'+p.minute:' · Hora sin confirmar');}
  function image(src,cls,width,height){const img=el('img',undefined,cls);img.src=src;img.alt='';img.width=width;img.height=height;img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});return img;}
  function teamLink(team){
    const a=el('a',undefined,'match-team');a.href='/equipo/?id='+encodeURIComponent(team.id);
    if(team.icon)a.append(image(team.icon,'team-icon'+(team.national?' flag-icon':''),28,team.national?18:28));
    a.append(el('span',team.name));return a;
  }
  const eventLabels={goal:['⚽','Gol'],own_goal:['⚽','Gol en propia puerta'],assist:['↗','Asistencia'],yellow:['🟨','Tarjeta amarilla'],red:['🟥','Tarjeta roja'],in:['↑','Entra'],out:['↓','Sale']};
  function badges(player){
    const box=el('span',undefined,'player-events');
    for(const event of player.events||[]){
      const spec=eventLabels[event.type];if(!spec)continue;
      const badge=el('span',spec[0]+(event.minute?' '+event.minute:''),'player-event event-'+event.type);
      badge.title=spec[1]+(event.minute?' '+event.minute:'');badge.setAttribute('aria-label',badge.title);box.append(badge);
    }
    return box;
  }
  function playerNode(player,pitch=false){
    const item=el(pitch?'div':'li',undefined,pitch?'pitch-player':'lineup-player');item.setAttribute('data-player-id',player.id);item.title=player.name;
    const avatar=el('span',undefined,'player-avatar');avatar.append(el('span',player.number||'·','player-number'));
    if(player.photo)avatar.append(image(player.photo,'player-photo',40,40));
    const text=el('span',undefined,'player-caption'),name=el('span',pitch?player.short_name:player.name,'player-name');
    CountryHighlight.watchPlayer(item,name,player);text.append(name);
    if(!pitch&&player.position)text.append(el('small',(player.number?'N.º '+player.number+' · ':'')+player.position));
    text.append(badges(player));item.append(avatar,text);return item;
  }
  function lineupCard(lineup){
    const card=el('section',undefined,'lineup-card'),heading=el('div',undefined,'lineup-heading');
    heading.append(teamLink(lineup.team));if(lineup.formation)heading.append(el('span',lineup.formation,'formation-label'));card.append(heading);
    const starters=lineup.players.filter(p=>p.starter),bench=lineup.players.filter(p=>!p.starter);
    if(lineup.rows?.length){
      const pitch=el('div',undefined,'lineup-pitch');pitch.setAttribute('role','group');pitch.setAttribute('aria-label','Disposición inicial de '+lineup.team.name+', '+lineup.formation);
      pitch.append(el('span',undefined,'pitch-markings'));
      for(const ids of lineup.rows){const row=el('div',undefined,'pitch-line');for(const id of ids){const player=starters.find(p=>p.id===id);if(player)row.append(playerNode(player,true));}pitch.append(row);}
      card.append(pitch);
    }else if(starters.length){
      card.append(el('h3','Titulares'));const list=el('ul',undefined,'lineup-list');for(const player of starters)list.append(playerNode(player));card.append(list);
    }
    if(!lineup.players.length)card.append(el('p','Alineación aún no publicada.','lineup-unavailable'));
    if(bench.length){card.append(el('h3','Banquillo'));const list=el('ul',undefined,'lineup-list');for(const player of bench)list.append(playerNode(player));card.append(list);}
    if(lineup.coach)card.append(el('p','Entrenador: '+lineup.coach,'lineup-coach'));
    return card;
  }
  function render(data){
    const match=data.match;document.title=match.home+' – '+match.away+' | La Jornada';
    const fragment=document.createDocumentFragment(),header=el('section',undefined,'match-summary');
    const back=root.querySelector('[data-match-back]'),q=new URLSearchParams({competicion:match.competition,fecha:dayFormat.format(new Date(match.date))});
    back.href='/partidos/?'+q;
    header.append(el('h1',match.competition_name,'sport-title'));
    const date=el('time',when(match.date,match.time_confirmed),'match-date');date.dateTime=match.date;header.append(date,el('span',match.status,'match-state'));
    const scoreboard=el('div',undefined,'match-scoreboard');
    const result=el('div',undefined,'match-result');result.append(el('strong',match.home_score==null||match.away_score==null?'vs':match.home_score+' – '+match.away_score));
    if(match.home_penalties!=null&&match.away_penalties!=null)result.append(el('small','Pen. '+match.home_penalties+' – '+match.away_penalties));
    scoreboard.append(teamLink(data.lineups[0].team),result,teamLink(data.lineups[1].team));header.append(scoreboard);
    const goals=MatchUI.scorers(match,'match-goals',data.lineups.flatMap(l=>l.players));if(goals){goals.id='goles';header.append(goals);}
    if(match.venue)header.append(el('p',match.venue,'match-venue'));
    fragment.append(header);
    const section=el('section',undefined,'match-lineups');section.id='alineaciones';section.append(el('h2','Alineaciones iniciales'));
    const grid=el('div',undefined,'lineups-grid');for(const lineup of data.lineups)grid.append(lineupCard(lineup));section.append(grid);fragment.append(section);
    if(data.lineups.some(l=>l.players.some(p=>p.events?.length))){const legend=el('p','⚽ Gol · (p. p.) Propia puerta · (pen.) Penalti · ↑ Entra · ↓ Sale · ↗ Asistencia · 🟨 Amarilla · 🟥 Roja','lineup-legend');fragment.append(legend);}
    if(data.updated)fragment.append(el('p','Datos: '+when(data.updated)+' · Hora peninsular','match-updated'));
    content.replaceChildren(fragment);MatchUI.watchCountry(header,match);status.textContent='';rendered=true;
  }
  async function load(){
    root.setAttribute('aria-busy','true');status.textContent=rendered?'':'Cargando partido…';
    try{
      const response=await fetch('/api/partido?'+query,{signal:AbortSignal.timeout(20000)}),data=await response.json();
      if(!response.ok||!data.match||!Array.isArray(data.lineups))throw Error('Partido no disponible');render(data);
    }catch{if(!rendered){status.textContent='Partido no disponible.';const retry=el('button','Reintentar','button');retry.type='button';retry.addEventListener('click',load);content.replaceChildren(retry);}}
    finally{root.setAttribute('aria-busy','false');}
  }
  load();setInterval(()=>{if(!document.hidden)load();},60*1000);
})();
