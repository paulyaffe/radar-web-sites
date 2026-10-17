(function(){
  'use strict';
  const root=document.querySelector('[data-fixtures]');if(!root)return;
  const form=root.querySelector('form'),date=form.elements.fecha,filter=form.elements.competicion;
  const status=root.querySelector('[data-fixtures-status]'),list=root.querySelector('[data-fixtures-list]');
  const zone='Europe/Madrid';let controller,version=0;
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const time=new Intl.DateTimeFormat('es-ES',{timeZone:zone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function matchDate(value){const p=Object.fromEntries(time.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+' '+p.hour+':'+p.minute;}
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function team(name,icon,national){const n=el('span',undefined,'fixture-team');if(icon){const img=el('img');img.src=icon;img.alt='';img.width=24;img.height=national?16:24;img.loading='lazy';img.referrerPolicy='no-referrer';img.className=national?'team-icon flag-icon':'team-icon';img.addEventListener('error',()=>img.remove(),{once:true});n.append(img);}n.append(el('span',name));return n;}
  function render(data){
    const competitions=data.flatMap(d=>d.competitions||[]);const problems=competitions.filter(c=>c.error);
    const count=competitions.reduce((n,c)=>n+c.matches.length,0);const fragment=document.createDocumentFragment();
    const dates=competitions.map(c=>c.updated).filter(Boolean).sort();
    status.textContent=count+' partidos publicados para '+new Intl.DateTimeFormat('es-ES',{timeZone:zone,dateStyle:'full'}).format(new Date(date.value+'T12:00:00Z'))+'. Horas de España peninsular.';
    if(problems.length){const warning=el('p','No se ha podido consultar completamente: '+problems.map(c=>c.name).join(', ')+'. La lista puede estar incompleta.','calendar-warning');warning.setAttribute('role','status');fragment.append(warning);}
    if(!count){fragment.append(el('p',problems.length?'No podemos confirmar los partidos de esta fecha. Prueba de nuevo más tarde.':'La fuente no publica partidos para esta fecha en las competiciones seleccionadas.','calendar-empty'));}
    for(const c of competitions){
      if(!c.matches.length)continue;
      const box=el('section',undefined,'fixture-competition');box.append(el('h3',c.name));
      if(c.stale)box.append(el('p','Última copia disponible: '+(c.updated||'sin fecha')+'. No se ha renovado la fuente.','score-meta'));
      for(const m of c.matches){
        const row=el('article',undefined,'fixture-row');const when=el('div',undefined,'fixture-time');const clock=el('time',matchDate(m.date));clock.dateTime=m.date;when.append(clock,el('small',m.status));
        const score=m.home_score==null||m.away_score==null?'—':m.home_score+' – '+m.away_score;
        row.append(when,team(m.home,m.home_icon,m.national),el('strong',score,'fixture-score'),team(m.away,m.away_icon,m.national));box.append(row);
      }
      const source=el('a','Calendario de '+c.name+' en ESPN','source-link');source.href=c.source;source.rel='noopener';box.append(source);fragment.append(box);
    }
    if(dates.length)fragment.append(el('p','Consulta correcta más antigua de esta lista: '+new Intl.DateTimeFormat('es-ES',{timeZone:zone,dateStyle:'short',timeStyle:'short'}).format(new Date(dates[0]))+'. Los horarios y resultados pueden corregirse.','small'));
    list.replaceChildren(fragment);root.setAttribute('aria-busy','false');
  }
  async function load(updateUrl=true){
    if(!form.reportValidity())return;
    const myVersion=++version;controller?.abort();controller=new AbortController();
    root.setAttribute('aria-busy','true');status.textContent='Consultando partidos…';list.replaceChildren();
    if(updateUrl){const u=new URL(location.href);u.searchParams.set('fecha',date.value);u.searchParams.set('competicion',filter.value);history.replaceState(null,'',u);}
    const groups=filter.value==='todas'?['clubes','selecciones']:[filter.value];
    try{
      const data=await Promise.all(groups.map(async group=>{
        const r=await fetch('/api/partidos?fecha='+encodeURIComponent(date.value)+'&competicion='+encodeURIComponent(group),{signal:controller.signal});const d=await r.json();
        if(!Array.isArray(d.competitions))throw Error(d.error||'No se ha podido consultar el calendario.');return d;
      }));
      if(myVersion===version)render(data);
    }catch(e){if(e.name==='AbortError'||myVersion!==version)return;root.setAttribute('aria-busy','false');status.textContent='No se ha podido cargar el calendario. Vuelve a pulsar «Ver partidos».';list.replaceChildren(el('p','Esto no significa que no haya partidos en esa fecha.','calendar-warning'));}
  }
  form.addEventListener('submit',e=>{e.preventDefault();load();});filter.addEventListener('change',()=>load());date.addEventListener('change',()=>load());
  root.querySelectorAll('[data-day-step]').forEach(b=>b.addEventListener('click',()=>{const d=new Date(date.value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(b.dataset.dayStep));date.value=d.toISOString().slice(0,10);load();}));
  root.querySelector('[data-today]').addEventListener('click',()=>{date.value=fmt.format(Date.now());load();});
  const params=new URLSearchParams(location.search);date.value=params.get('fecha')||fmt.format(Date.now());
  if(params.get('competicion')&&[...filter.options].some(o=>o.value===params.get('competicion')))filter.value=params.get('competicion');
  load(false);
})();
