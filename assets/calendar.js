(function(){
  'use strict';
  const root=document.querySelector('[data-fixtures]');if(!root)return;
  const form=root.querySelector('form'),date=form.elements.fecha,filter=form.elements.competicion;
  const status=root.querySelector('[data-fixtures-status]'),list=root.querySelector('[data-fixtures-list]');
  const zone='Europe/Madrid';let controller,version=0;
  const dayButtons=[...root.querySelectorAll('[data-day-step]')];
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const time=new Intl.DateTimeFormat('es-ES',{timeZone:zone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function matchDate(value){const p=Object.fromEntries(time.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+' '+p.hour+':'+p.minute;}
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function team(name,icon,national,id,code){const n=el('a',undefined,'fixture-team team-link');const q=new URLSearchParams({competicion:code});q.set(id?'id':'nombre',id||name);n.href='/equipo/?'+q;n.title='Ver últimos y próximos partidos de '+name;if(icon){const img=el('img');img.src=icon;img.alt='';img.width=24;img.height=national?16:24;img.loading='lazy';img.referrerPolicy='no-referrer';img.className=national?'team-icon flag-icon':'team-icon';img.addEventListener('error',()=>img.remove(),{once:true});n.append(img);}n.append(el('span',name));return n;}
  function render(data){
    const competitions=data.flatMap(d=>d.competitions||[]);const problems=competitions.filter(c=>c.error);
    const count=competitions.reduce((n,c)=>n+c.matches.length,0);const fragment=document.createDocumentFragment();
    status.textContent=count+' partidos · '+date.value.slice(8,10)+'/'+date.value.slice(5,7)+'/'+date.value.slice(2,4);
    if(!count&&problems.length)status.textContent='';
    for(const c of competitions){
      if(!c.matches.length&&competitions.length>1)continue;
      const box=el('section',undefined,'fixture-competition');box.append(el('h3',c.name));
      const actions=el('div',undefined,'competition-actions');for(const [route,label]of [['clasificacion','Tabla de posiciones'],['goleadores','Tabla de goleadores']]){const a=el('a',label);a.href='/'+route+'/?competicion='+encodeURIComponent(c.code);actions.append(a);}box.append(actions);
      for(const m of c.matches){
        const row=el('article',undefined,'fixture-row');const when=el('div',undefined,'fixture-time');const clock=el('time',matchDate(m.date));clock.dateTime=m.date;when.append(clock,el('small',m.status));
        const score=m.home_score==null||m.away_score==null?'—':m.home_score+' – '+m.away_score;
        row.append(when,team(m.home,m.home_icon,m.national,m.home_id,c.code),el('strong',score,'fixture-score'),team(m.away,m.away_icon,m.national,m.away_id,c.code));box.append(row);
      }
      fragment.append(box);
    }
    list.replaceChildren(fragment);root.setAttribute('aria-busy','false');
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
  async function load(updateUrl=true){
    if(!form.reportValidity())return;
    const {myVersion,signal}=begin();
    root.setAttribute('aria-busy','true');status.textContent='';list.replaceChildren();
    if(updateUrl)updateAddress();
    try{
      const data=await readDay(date.value,filter.value,signal);
      if(myVersion===version)render(data);
    }catch(e){if(e.name==='AbortError'||myVersion!==version)return;status.textContent='';list.replaceChildren();}
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
  const params=new URLSearchParams(location.search);date.value=params.get('fecha')||fmt.format(Date.now());
  if(params.get('competicion')&&[...filter.options].some(o=>o.value===params.get('competicion')))filter.value=params.get('competicion');
  load(false);
  setInterval(()=>{if(!document.hidden)load(false);},15*60*1000);
})();
