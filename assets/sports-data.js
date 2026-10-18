(function(){
  'use strict';
  const tableRoot=document.querySelector('[data-competition-table]');if(!tableRoot)return;
  const clock=new Intl.DateTimeFormat('es-ES',{timeZone:zone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;}
  function dateLabel(value,confirmed=true){const p=Object.fromEntries(clock.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+(confirmed?' '+p.hour+':'+p.minute:' · Hora sin confirmar');}
  function icon(src,national){const n=el('img');n.src=src;n.alt='';n.width=24;n.height=national?16:24;n.className='team-icon'+(national?' flag-icon':'');n.loading='lazy';n.referrerPolicy='no-referrer';n.addEventListener('error',()=>n.remove(),{once:true});return n;}
  function team(t){const n=el(t.id?'a':'span',undefined,'table-team');if(t.id)n.href='/equipo/?id='+encodeURIComponent(t.id);if(t.icon)n.append(icon(t.icon,t.national));n.append(el('span',t.name));return n;}
  function addFlag(name,flag,nationality){if(!flag||name.querySelector('img'))return;const image=icon(flag,true);image.classList.add('nationality-flag');image.alt=nationality||'';image.title=nationality||'';image.width=18;image.height=12;name.append(image);}
  function scorerName(player){const name=el('span',undefined,'scorer-name');name.append(el('span',player.name));if(player.athlete_id)name.dataset.athleteId=player.athlete_id;addFlag(name,player.flag,player.nationality);return name;}
  async function loadPlayerFlags(container,players,signal){
    const ids=[...new Set(players.filter(p=>p.athlete_id&&!p.flag).map(p=>p.athlete_id))];
    const chunks=[];for(let i=0;i<ids.length;i+=10)chunks.push(ids.slice(i,i+10));
    await Promise.allSettled(chunks.map(async chunk=>{
      const response=await fetch('/api/banderas?jugadores='+encodeURIComponent(chunk.join(',')),{signal});if(!response.ok)return;const data=await response.json();
      if(signal.aborted||!container.isConnected)return;
      for(const p of data.players||[])for(const name of container.querySelectorAll('[data-athlete-id]'))if(name.dataset.athleteId===p.id)addFlag(name,p.flag,p.nationality);
    }));
  }
  function makeTable(headers,rows,caption){
    const region=el('div',undefined,'table-scroll');region.setAttribute('role','region');region.setAttribute('aria-label',caption);region.tabIndex=0;
    const table=el('table',undefined,'sports-table'+(headers.includes('Pts')?' positions-table':'')+(headers.includes('Goles')?' scorers-table':'')),thead=el('thead'),head=el('tr'),body=el('tbody');table.append(el('caption',caption,'sr-only'));
    headers.forEach(h=>{const th=el('th',h);th.scope='col';head.append(th);});thead.append(head);
    rows.forEach(values=>{const row=el('tr');values.forEach((value,i)=>{const cell=el(i===1?'th':'td');if(i===1)cell.scope='row';cell.append(value instanceof Node?value:document.createTextNode(String(value ?? '—')));row.append(cell);});body.append(row);});
    table.append(thead,body);region.append(table);return region;
  }
  if(tableRoot){
    const form=tableRoot.querySelector('form'),select=form.elements.competicion,kind=tableRoot.dataset.competitionTable,status=tableRoot.querySelector('[data-data-status]'),list=tableRoot.querySelector('[data-data-list]'),title=tableRoot.querySelector('h1');let controller,version=0;
    const params=new URLSearchParams(location.search);if([...select.options].some(o=>o.value===params.get('competicion')))select.value=params.get('competicion');
    async function load(){
      const v=++version;controller?.abort();controller=new AbortController();tableRoot.setAttribute('aria-busy','true');status.textContent='';list.replaceChildren();
      const q=new URLSearchParams({competicion:select.value});history.replaceState(null,'','?'+q);
      tableRoot.querySelectorAll('[data-table-link]').forEach(a=>{a.href='/'+a.dataset.tableLink+'/?'+q;a.setAttribute('aria-current',a.dataset.tableLink===kind?'page':'false');});
      try{
        const r=await fetch('/api/tabla?'+q+'&tipo='+kind,{signal:controller.signal}),data=await r.json();if(!r.ok)throw Error(data.error||'No se puede cargar esta tabla.');if(v!==version)return;
        title.textContent=data.name;document.title=data.name+' · '+(kind==='clasificacion'?'Tabla de posiciones':'Goleadores')+' | Marcador claro';
        status.textContent=data.season?'Temporada '+(data.season.match(/20\d{2}(?:[/-]\d{2,4})?/)?.[0]||data.season):'';const fragment=document.createDocumentFragment();
        if(kind==='clasificacion'){
          for(const group of data.groups){if(data.groups.length>1)fragment.append(el('h2',group.name,'table-group-title'));
            fragment.append(makeTable(['#','Equipo','Pts','PJ','G','E','P','GF','GC','DG'],group.rows.map(t=>[t.rank,team(t.team),t.points,t.played,t.won,t.drawn,t.lost,t.for,t.against,t.difference]),data.name+' · '+group.name));
          }
        }else{
          let rank=0,last;
          const rows=data.scorers.map((p,i)=>{if(p.goals!==last)rank=i+1;last=p.goals;return [rank,scorerName(p),p.goals,team(p.team),p.played];});
          if(rows.length)fragment.append(makeTable(['#','Jugador','Goles','Equipo','PJ'],rows,'Goleadores de '+data.name));
        }
        if(data.updated)fragment.append(el('p','Actualizado '+dateLabel(data.updated)+' · España peninsular','updated-note'));list.replaceChildren(fragment);
        if(kind==='goleadores')loadPlayerFlags(list,data.scorers,controller.signal);
      }catch(e){if(e.name==='AbortError'||v!==version)return;status.textContent='';list.replaceChildren();}
      finally{if(v===version)tableRoot.setAttribute('aria-busy','false');}
    }
    form.addEventListener('submit',e=>{e.preventDefault();load();});select.addEventListener('change',load);load();
    setInterval(()=>{if(!document.hidden)load();},15*60*1000);
  }
})();
