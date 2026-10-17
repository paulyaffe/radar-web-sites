(function(){
  'use strict';
  const tableRoot=document.querySelector('[data-competition-table]'),tennisRoot=document.querySelector('[data-tennis]');if(!tableRoot&&!tennisRoot)return;
  const zone='Europe/Madrid',dateFmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const clock=new Intl.DateTimeFormat('es-ES',{timeZone:zone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;}
  function dateLabel(value,confirmed=true){const p=Object.fromEntries(clock.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+(confirmed?' '+p.hour+':'+p.minute:' · Hora sin confirmar');}
  function icon(src,national){const n=el('img');n.src=src;n.alt='';n.width=24;n.height=national?16:24;n.className='team-icon'+(national?' flag-icon':'');n.loading='lazy';n.referrerPolicy='no-referrer';n.addEventListener('error',()=>n.remove(),{once:true});return n;}
  function team(t){const n=el(t.id?'a':'span',undefined,'table-team');if(t.id)n.href='/equipo/?id='+encodeURIComponent(t.id);if(t.icon)n.append(icon(t.icon,t.national));n.append(el('span',t.name));return n;}
  function makeTable(headers,rows,caption){
    const region=el('div',undefined,'table-scroll');region.setAttribute('role','region');region.setAttribute('aria-label',caption);region.tabIndex=0;
    const table=el('table',undefined,'sports-table'+(headers.includes('Pts')?' positions-table':'')),thead=el('thead'),head=el('tr'),body=el('tbody');table.append(el('caption',caption,'sr-only'));
    headers.forEach(h=>{const th=el('th',h);th.scope='col';head.append(th);});thead.append(head);
    rows.forEach(values=>{const row=el('tr');values.forEach((value,i)=>{const cell=el(i===1?'th':'td');if(i===1)cell.scope='row';cell.append(value instanceof Node?value:document.createTextNode(String(value ?? '—')));row.append(cell);});body.append(row);});
    table.append(thead,body);region.append(table);return region;
  }
  if(tableRoot){
    const form=tableRoot.querySelector('form'),select=form.elements.competicion,kind=tableRoot.dataset.competitionTable,status=tableRoot.querySelector('[data-data-status]'),list=tableRoot.querySelector('[data-data-list]'),title=tableRoot.querySelector('h1');let controller,version=0;
    const params=new URLSearchParams(location.search);if([...select.options].some(o=>o.value===params.get('competicion')))select.value=params.get('competicion');
    async function load(){
      const v=++version;controller?.abort();controller=new AbortController();tableRoot.setAttribute('aria-busy','true');status.textContent='Cargando…';list.replaceChildren();
      const q=new URLSearchParams({competicion:select.value});history.replaceState(null,'','?'+q);
      tableRoot.querySelectorAll('[data-table-link]').forEach(a=>{a.href='/'+a.dataset.tableLink+'/?'+q;a.setAttribute('aria-current',a.dataset.tableLink===kind?'page':'false');});
      try{
        const r=await fetch('/api/tabla?'+q+'&tipo='+kind,{signal:controller.signal}),data=await r.json();if(!r.ok)throw Error(data.error||'No se puede cargar esta tabla.');if(v!==version)return;
        title.textContent=data.name;document.title=data.name+' · '+(kind==='clasificacion'?'Tabla de posiciones':'Goleadores')+' | Marcador claro';
        status.textContent=data.season?'Temporada '+(data.season.match(/20\d{2}(?:[/-]\d{2,4})?/)?.[0]||data.season):'';const fragment=document.createDocumentFragment();
        if(data.error||data.stale)fragment.append(el('p',data.error||'Esta tabla no se ha renovado recientemente. Comprueba la fecha de actualización.','calendar-warning'));
        if(kind==='clasificacion'){
          for(const group of data.groups){if(data.groups.length>1)fragment.append(el('h2',group.name,'table-group-title'));
            fragment.append(makeTable(['#','Equipo','Pts','PJ','G','E','P','GF','GC','DG'],group.rows.map(t=>[t.rank,team(t.team),t.points,t.played,t.won,t.drawn,t.lost,t.for,t.against,t.difference]),data.name+' · '+group.name));
          }
          if(!data.groups.length)fragment.append(el('p','No hay una tabla de posiciones publicada para esta competición.','calendar-empty'));
        }else{
          let rank=0,last;
          const rows=data.scorers.map((p,i)=>{if(p.goals!==last)rank=i+1;last=p.goals;return [rank,p.name,team(p.team),p.played,p.goals];});
          if(rows.length)fragment.append(makeTable(['#','Jugador','Equipo','PJ','Goles'],rows,'Goleadores de '+data.name));
          else fragment.append(el('p','No hay goleadores publicados para esta competición.','calendar-empty'));
        }
        if(data.updated)fragment.append(el('p','Actualizado '+dateLabel(data.updated)+' · España peninsular','updated-note'));list.replaceChildren(fragment);
      }catch(e){if(e.name==='AbortError'||v!==version)return;status.textContent=e.message;list.replaceChildren(el('p','Prueba de nuevo en unos minutos.','calendar-warning'));}
      finally{if(v===version)tableRoot.setAttribute('aria-busy','false');}
    }
    form.addEventListener('submit',e=>{e.preventDefault();load();});select.addEventListener('change',load);load();
    setInterval(()=>{if(!document.hidden)load();},15*60*1000);
  }
  if(tennisRoot){
    const form=tennisRoot.querySelector('form'),date=form.elements.fecha,tour=form.elements.circuito,mode=form.elements.modalidad,status=tennisRoot.querySelector('[data-data-status]'),list=tennisRoot.querySelector('[data-data-list]');let controller,version=0;
    const params=new URLSearchParams(location.search);date.value=params.get('fecha')||dateFmt.format(Date.now());if(['todos','atp','wta'].includes(params.get('circuito')))tour.value=params.get('circuito');if(['todas','singles','doubles'].includes(params.get('modalidad')))mode.value=params.get('modalidad');
    function player(p){const n=el('span',undefined,'tennis-player'+(p.winner?' tennis-winner':''));p.flags.forEach(f=>n.append(icon(f,true)));n.append(el('span',p.name));return n;}
    function render(data,errors){
      let matches=data.flatMap(d=>d.matches).filter(m=>mode.value==='todas'||m.doubles===(mode.value==='doubles'));matches.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
      status.textContent=matches.length+' partidos · '+dateLabel(date.value+'T12:00:00Z').slice(0,8)+' · España peninsular';const fragment=document.createDocumentFragment();
      if(errors.length||data.some(d=>d.stale))fragment.append(el('p','No se ha podido renovar todo el calendario. La lista puede estar incompleta.','calendar-warning'));
      const groups=new Map();for(const m of matches){const key=m.tour+' · '+m.tournament+' · '+(m.doubles?'Dobles':'Individuales');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
      for(const [key,rows]of groups){const box=el('section',undefined,'fixture-competition');box.append(el('h2',key.replace(/^atp/,'ATP').replace(/^wta/,'WTA')));
        for(const m of rows){const row=el('article',undefined,'tennis-match'),meta=el('div',undefined,'tennis-meta');meta.append(el('time',dateLabel(m.date,m.time_confirmed)),el('small',m.status));row.append(meta);
          m.players.forEach(p=>{const line=el('div',undefined,'tennis-line'),sets=el('span',undefined,'tennis-sets');p.sets.forEach(s=>{const set=el('span',s.score??'—');if(s.tie!==null)set.append(el('sup',s.tie));sets.append(set);});line.append(player(p),sets);row.append(line);});box.append(row);
        }fragment.append(box);
      }
      if(!matches.length)fragment.append(el('p',errors.length?'No se pueden confirmar los partidos de este día.':'No hay partidos publicados para esta fecha y modalidad.','calendar-empty'));
      list.replaceChildren(fragment);tennisRoot.setAttribute('aria-busy','false');
    }
    async function load(){
      if(!form.reportValidity())return;const v=++version;controller?.abort();controller=new AbortController();status.textContent='Cargando tenis…';tennisRoot.setAttribute('aria-busy','true');list.replaceChildren();history.replaceState(null,'','?'+new URLSearchParams({fecha:date.value,circuito:tour.value,modalidad:mode.value}));
      const groups=tour.value==='todos'?['atp','wta']:[tour.value];const values=await Promise.allSettled(groups.map(async t=>{const r=await fetch('/api/tenis?'+new URLSearchParams({fecha:date.value,circuito:t}),{signal:controller.signal});const d=await r.json();if(!r.ok||!Array.isArray(d.matches))throw Error(d.error||'No disponible');return d;}));
      if(v!==version)return;render(values.filter(x=>x.status==='fulfilled').map(x=>x.value),values.filter(x=>x.status==='rejected'));
    }
    form.addEventListener('submit',e=>{e.preventDefault();load();});[date,tour,mode].forEach(n=>n.addEventListener('change',load));
    tennisRoot.querySelectorAll('[data-day-step]').forEach(b=>b.addEventListener('click',()=>{const d=new Date(date.value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(b.dataset.dayStep));date.value=d.toISOString().slice(0,10);load();}));
    tennisRoot.querySelector('[data-today]').addEventListener('click',()=>{date.value=dateFmt.format(Date.now());load();});load();setInterval(()=>{if(!document.hidden)load();},15*60*1000);
  }
})();
