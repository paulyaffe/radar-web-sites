(function(){
  'use strict';
  const root=document.querySelector('[data-team-history]');if(!root)return;
  const heading=root.querySelector('h1'),status=root.querySelector('[data-team-status]'),content=root.querySelector('[data-team-content]');
  const params=new URLSearchParams(location.search),query=new URLSearchParams();
  const formatter=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function when(m){const p=Object.fromEntries(formatter.formatToParts(new Date(m.date)).map(x=>[x.type,x.value]));return p.day+'/'+p.month+'/'+p.year+(m.time_confirmed?' '+p.hour+':'+p.minute:' · Hora sin confirmar');}
  function team(name,icon,national,id,code){
    const n=el(id?'a':'span',undefined,'fixture-team'+(id?' team-link':''));
    if(id){const q=new URLSearchParams({id});if(code)q.set('competicion',code);n.href='/equipo/?'+q;n.title='Ver últimos y próximos partidos de '+name;}
    if(icon){const img=el('img');img.src=icon;img.alt='';img.width=24;img.height=national?16:24;img.loading='lazy';img.referrerPolicy='no-referrer';img.className=national?'team-icon flag-icon':'team-icon';img.addEventListener('error',()=>img.remove(),{once:true});n.append(img);}
    n.append(el('span',name));return n;
  }
  function section(part,future){
    const box=el('section',undefined,'team-history-section');box.append(el('h2',future?'Próximos 5 partidos':'Últimos 5 partidos'));
    for(const m of part.matches){
      const row=el('article',undefined,'fixture-row team-history-row'),time=el('div',undefined,'fixture-time');
      const clock=el('time',when(m));clock.dateTime=m.date;time.append(clock,el('small',m.competition_name),el('small',m.status));
      let result=future?'vs':m.home_score==null||m.away_score==null?'Sin resultado':m.home_score+' – '+m.away_score;
      const score=MatchUI.scoreLink(m,result);
      if(!future&&m.home_penalties!=null&&m.away_penalties!=null)score.append(el('small','Pen. '+m.home_penalties+' – '+m.away_penalties));
      row.append(time,team(m.home,m.home_icon,m.national,m.home_id,m.competition),score,team(m.away,m.away_icon,m.national,m.away_id,m.competition));MatchUI.finishRow(row,m);box.append(row);
    }
    return box;
  }
  function squadSection(){
    const box=el('section',undefined,'team-squad-section');box.setAttribute('aria-busy','true');box.append(el('h2','Primer equipo'));
    const list=el('ul',undefined,'team-squad-grid');box.append(list);return {box,list};
  }
  async function loadSquad(id,section){
    const data=await MatchUI.squad(id);
    if(data){
      for(const player of data.players){
        const item=el('li',undefined,'squad-player');
        item.append(el('span',player.number||'·','squad-number'));
        const caption=el('span',undefined,'squad-caption'),name=el('span',player.name,'squad-player-name');
        CountryHighlight.watchPlayer(item,name,player);caption.append(name);
        if(player.position)caption.append(el('small',player.position));item.append(caption);section.list.append(item);
      }
    }else section.box.append(el('p','Plantilla no disponible por ahora.','squad-unavailable'));
    section.box.setAttribute('aria-busy','false');
  }
  async function load(){
    if(params.has('id'))query.set('id',params.get('id'));else if(params.has('nombre'))query.set('nombre',params.get('nombre'));
    if(params.has('competicion'))query.set('competicion',params.get('competicion'));
    root.setAttribute('aria-busy','true');status.textContent='';
    try{
      const response=await fetch('/api/equipo?'+query,{signal:AbortSignal.timeout(25000)}),data=await response.json();
      if(!response.ok||!data.team||!data.past||!data.future)throw Error(data.error||'No se ha podido consultar este equipo.');
      document.title=data.team.name+' · plantilla y partidos | La Jornada';
      heading.replaceChildren(team(data.team.name,data.team.icon,data.team.national));
      status.textContent=(data.team.national?'Selección':'Club')+' · Hora peninsular';
      const grid=el('div',undefined,'team-history-grid');grid.append(section(data.past,false),section(data.future,true));
      const squad=squadSection();content.replaceChildren(squad.box,grid);loadSquad(data.team.id,squad);
    }catch(e){status.textContent='No se ha podido consultar este equipo.';const retry=el('button','Reintentar','button');retry.type='button';retry.addEventListener('click',load);content.replaceChildren(el('p','Comprueba el enlace del equipo o vuelve al calendario para elegir otro.','calendar-empty'),retry);}
    finally{root.setAttribute('aria-busy','false');}
  }
  load();
})();
