(function(){
  'use strict';
  const root=document.querySelector('[data-fixtures]');if(!root)return;
  const form=root.querySelector('form'),date=form.elements.fecha,filter=form.elements.competicion;
  const status=root.querySelector('[data-fixtures-status]'),list=root.querySelector('[data-fixtures-list]');
  const countryOnly=root.querySelector('[data-country-only]'),countryOnlyKey='lajornada.only-country';
  let onlyCountry=false,view=[],totalMatches=0,partialDay=false,pendingDay=false,calendarReady=false;
  try{onlyCountry=localStorage.getItem(countryOnlyKey)==='1';}catch{}
  const zone='Europe/Madrid';let controller,version=0;
  const dayButtons=[...root.querySelectorAll('[data-day-step]')];
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const time=new Intl.DateTimeFormat('es-ES',{timeZone:zone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function matchDate(value){const p=Object.fromEntries(time.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+' '+p.hour+':'+p.minute;}
  function matchCount(value){return value+' '+(value===1?'partido':'partidos');}
  function setStatus(value){if(status.textContent!==value)status.textContent=value;}
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function team(name,icon,national,id,code){const n=el('a',undefined,'fixture-team team-link');const q=new URLSearchParams({competicion:code});q.set(id?'id':'nombre',id||name);n.href='/equipo/?'+q;n.title='Ver últimos y próximos partidos de '+name;if(icon){const img=el('img');img.src=icon;img.alt='';img.width=24;img.height=national?16:24;img.loading='lazy';img.referrerPolicy='no-referrer';img.className=national?'team-icon flag-icon':'team-icon';img.addEventListener('error',()=>img.remove(),{once:true});n.append(img);}n.append(el('span',name));return n;}
  function applyCountryFilter(){
    const country=CountryHighlight.selected,enabled=onlyCountry&&!!country;
    if(countryOnly){countryOnly.textContent=country?'Solo '+country.name:'Solo mi país';countryOnly.disabled=!country;countryOnly.setAttribute('aria-pressed',String(enabled));}
    if(!calendarReady)return;
    let shown=0,pending=0,unknown=0;
    for(const {box,rows} of view){
      let visible=0;
      for(const row of rows){
        const state=MatchUI.countryState(row);row.hidden=enabled&&state!=='match';
        if(!row.hidden)visible++;
        if(state==='pending')pending++;else if(state==='unknown')unknown++;
      }
      box.hidden=enabled&&visible===0;shown+=visible;
    }
    list.setAttribute('aria-busy',String(enabled&&pending>0));
    const day=date.value.slice(8,10)+'/'+date.value.slice(5,7)+'/'+date.value.slice(2,4);
    if(!enabled){setStatus(matchCount(totalMatches)+' · '+day+(pendingDay?' · completando selecciones':partialDay?' · algunas competiciones no disponibles':''));return;}
    if(!shown&&!pending&&!unknown&&!partialDay){setStatus('No hay partidos con jugadores de '+country.name+' · '+day);return;}
    let message=shown+' de '+matchCount(totalMatches)+' · '+day;
    if(pending)message+=' · comprobando plantillas de '+matchCount(pending);
    if(unknown)message+=' · '+matchCount(unknown)+' sin plantilla completa';
    if(pendingDay)message+=' · completando selecciones';else if(partialDay)message+=' · algunas competiciones no disponibles';
    setStatus(message);
  }
  function setOnlyCountry(value,persist=true){
    const cleared=value&&!CountryHighlight.selected;
    onlyCountry=!!(value&&CountryHighlight.selected&&countryOnly);
    if(persist||cleared)try{localStorage.setItem(countryOnlyKey,onlyCountry?'1':'0');}catch{}
    if(onlyCountry)for(const {rows} of view)for(const row of rows)MatchUI.checkCountry(row);
    applyCountryFilter();
  }
  function render(data){
    const competitions=data.flatMap(d=>d.competitions||[]);const problems=competitions.filter(c=>c.error);
    const count=competitions.reduce((n,c)=>n+c.matches.length,0);const fragment=document.createDocumentFragment(),nextView=[];
    for(const c of competitions){
      if(!c.matches.length&&competitions.length>1)continue;
      const box=el('section',undefined,'fixture-competition'),rows=[];box.append(el('h3',c.name));
      const actions=el('div',undefined,'competition-actions');for(const [route,label]of [['clasificacion','Tabla de posiciones'],['goleadores','Tabla de goleadores']]){const a=el('a',label);a.href='/'+route+'/?competicion='+encodeURIComponent(c.code);actions.append(a);}box.append(actions);
      for(const m of c.matches){
        const row=el('article',undefined,'fixture-row');const when=el('div',undefined,'fixture-time');const clock=el('time',matchDate(m.date));clock.dateTime=m.date;when.append(clock,el('small',m.status));
        const score=m.home_score==null||m.away_score==null?'—':m.home_score+' – '+m.away_score;
        m.competition=c.code;
        row.append(when,team(m.home,m.home_icon,m.national,m.home_id,c.code),MatchUI.scoreLink(m,score),team(m.away,m.away_icon,m.national,m.away_id,c.code));MatchUI.finishRow(row,m);box.append(row);rows.push(row);
      }
      fragment.append(box);nextView.push({box,rows});
    }
    if(!count)fragment.append(el('p',problems.length?'Los partidos no están disponibles en este momento. Puedes elegir otra fecha o competición.':data.some(d=>d.pending_groups?.length)?'Completando los partidos de selecciones para esta fecha…':'No hay partidos publicados para esta fecha y competición. Puedes cambiar la fecha o usar Anterior y Siguiente.','calendar-empty'));
    view=nextView;totalMatches=count;pendingDay=data.some(d=>d.pending_groups?.length);partialDay=problems.length>0||pendingDay;calendarReady=true;
    list.replaceChildren(fragment);setOnlyCountry(onlyCountry,false);root.setAttribute('aria-busy','false');
  }
  function begin(){
    const myVersion=++version;controller?.abort();controller=new AbortController();
    dayButtons.forEach(b=>b.disabled=true);root.setAttribute('aria-busy','true');return {myVersion,signal:controller.signal};
  }
  function finish(myVersion){if(myVersion===version){root.setAttribute('aria-busy','false');dayButtons.forEach(b=>b.disabled=false);}}
  function updateAddress(){const u=new URL(location.href);u.searchParams.set('fecha',date.value);u.searchParams.set('competicion',filter.value);history.replaceState(null,'',u);}
  async function readDay(day,choice,signal){
    const groups=choice==='todas'?['clubes','selecciones']:[choice];
    return Promise.all(groups.map(async group=>{
      const r=await fetch('/api/partidos?fecha='+encodeURIComponent(day)+'&competicion='+encodeURIComponent(group),{signal});const d=await r.json();
      if(!Array.isArray(d.competitions))throw Error('Calendario no disponible');return d;
    }));
  }
  const findDay=FixtureNavigation.createNavigator(async(code,day,signal)=>{
    const r=await fetch('/api/partidos?calendario=1&fecha='+encodeURIComponent(day)+'&competicion='+encodeURIComponent(code),{signal});
    if(!r.ok)throw Error('Calendario no disponible');return r.json();
  });
  async function load(updateUrl=true,preserve=false){
    if(!form.reportValidity())return;
    const keep=preserve&&calendarReady,previousStatus=status.textContent;
    const {myVersion,signal}=begin();
    if(!keep){calendarReady=false;view=[];totalMatches=0;partialDay=false;pendingDay=false;status.textContent='Consultando partidos…';list.replaceChildren(el('p','Cargando la jornada seleccionada…','calendar-empty'));}
    if(updateUrl)updateAddress();
    try{
      const data=await readDay(date.value,filter.value,signal);
      if(myVersion===version)render(data);
    }catch(e){
      if(e.name==='AbortError'||myVersion!==version)return;
      if(keep){pendingDay=false;setStatus(previousStatus.replace(' · completando selecciones','')+' · No se ha podido actualizar. Se conserva la última consulta.');}
      else{status.textContent='No se han podido cargar los partidos.';const retry=el('button','Reintentar','button');retry.type='button';retry.addEventListener('click',()=>load());list.replaceChildren(el('p','Puedes volver a intentarlo o elegir otra fecha y competición.','calendar-empty'),retry);}
    }
    finally{finish(myVersion);}
  }
  async function step(direction){
    if(!form.reportValidity())return;
    const choice=filter.value,{myVersion,signal}=begin();
    const codes=[...filter.options].filter(o=>o.dataset.group&&
      (choice==='todas'||o.dataset.group===choice||o.value===choice)).map(o=>o.value);
    try{
      const found=await findDay(date.value,direction,codes,(day,s)=>readDay(day,choice,s),signal);
      if(found&&myVersion===version){date.value=found.date;updateAddress();render(found.data);}
    }catch{/* Keep the current date and matches if the next day cannot be confirmed. */}
    finally{finish(myVersion);}
  }
  form.addEventListener('submit',e=>{e.preventDefault();load();});filter.addEventListener('change',()=>load());date.addEventListener('change',()=>load());
  dayButtons.forEach(b=>b.addEventListener('click',()=>step(Number(b.dataset.dayStep))));
  root.querySelector('[data-today]').addEventListener('click',()=>{date.value=fmt.format(Date.now());load();});
  countryOnly?.addEventListener('click',()=>setOnlyCountry(!onlyCountry));
  MatchUI.onCountryUpdate(row=>{if(list.contains(row))applyCountryFilter();});
  CountryHighlight.onChange(()=>setOnlyCountry(onlyCountry,false));
  window.addEventListener('storage',event=>{if(event.key===countryOnlyKey)setOnlyCountry(event.newValue==='1',false);});
  const params=new URLSearchParams(location.search);date.value=params.get('fecha')||fmt.format(Date.now());
  if(params.get('competicion')&&[...filter.options].some(o=>o.value===params.get('competicion')))filter.value=params.get('competicion');
  setOnlyCountry(onlyCountry,false);
  let seed;
  try{seed=JSON.parse(root.querySelector('[data-fixture-bootstrap]')?.textContent||'null');}catch{}
  if(seed?.date===date.value&&seed.choice===filter.value&&Array.isArray(seed.competitions)&&seed.competitions.every(c=>Array.isArray(c.matches))){render([seed]);if(seed.pending_groups?.length)load(false,true);}
  else load(false);
  setInterval(()=>{if(!document.hidden)load(false,true);},15*60*1000);
})();
