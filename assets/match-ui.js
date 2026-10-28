(function(){
  'use strict';
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function href(match){return /^[1-9]\d{0,8}$/.test(String(match.id||''))&&/^[A-Z_]{2,12}$/.test(match.competition||'')?'/partido/?'+new URLSearchParams({competicion:match.competition,id:match.id}):'';}
  function scoreLink(match,text){
    const url=href(match),node=el(url?'a':'strong',text,'fixture-score');
    if(url){node.href=url;node.classList.add('match-link');node.title='Goles y alineaciones';node.setAttribute('aria-label',match.home+' '+text+' '+match.away+'. Ver goles y alineaciones');}
    return node;
  }
  function goalText(goal){return goal.name+(goal.minute?' '+goal.minute:'')+(goal.own_goal?' (p. p.)':goal.penalty?' (pen.)':'');}
  function scorers(match,cls='fixture-goals',players=[]){
    if(!Array.isArray(match.goals)||!match.goals.length)return null;
    const box=el('div',undefined,cls);box.setAttribute('aria-label','Goleadores');
    for(const side of ['home','away']){
      const column=el('div',undefined,'goals-'+side);
      for(const goal of match.goals.filter(g=>g.side===side)){
        const item=el('span'),name=el('span',goal.name);name.dataset.athleteId=goal.athlete_id || '';
        const player=players.find(p=>p.id===goal.athlete_id)||(match.uruguayan_players||[]).find(p=>p.id===goal.athlete_id);
        CountryHighlight.watchPlayer(name,name,player||{id:goal.athlete_id});
        item.append(name,el('span',goalText(goal).slice(goal.name.length)));column.append(item);
      }
      box.append(column);
    }
    return box;
  }
  function markCountry(row){
    const players=(row.firstTeamSquads||[]).flatMap(data=>data?.players||[]),selected=players.filter(CountryHighlight.matches);
    row.classList.toggle('country-match',selected.length>0);
    row.title=selected.length?CountryHighlight.selected.name+' en plantilla: '+[...new Set(selected.map(p=>p.name))].join(', '):'';
    for(const name of row.querySelectorAll('[data-athlete-id]')){
      const player=players.find(p=>p.id===name.dataset.athleteId);
      if(player)CountryHighlight.watchPlayer(name,name,player);
    }
  }
  const squads=new Map(),queue=[];let active=0;
  async function squad(id){
    id=String(id||'');
    if(!/^[1-9]\d{0,8}$/.test(String(id||'')))return null;
    const cached=squads.get(id);if(cached&&Date.now()-cached.time<10*60000)return cached.promise;
    const promise=fetch('/api/plantilla?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(25000)})
      .then(async response=>{if(!response.ok)throw Error('Plantilla no disponible');const data=await response.json();
        if(data.basis!=='first_team_squad'||data.team?.id!==String(id)||!data.available||!Array.isArray(data.players))throw Error('Plantilla no válida');return data;})
      .catch(()=>{squads.delete(id);return null;});
    squads.set(id,{time:Date.now(),promise});return promise;
  }
  function drain(){
    while(active<3&&queue.length){
      const {row,match}=queue.shift();if(row.isConnected===false)continue;
      active++;
      Promise.all([squad(match.home_id),squad(match.away_id)]).then(results=>{if(row.isConnected!==false){row.firstTeamSquads=results;markCountry(row);}})
        .finally(()=>{active--;drain();});
    }
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);queue.push({row:entry.target,match:entry.target.nationalityMatch});}
    drain();
  },{rootMargin:'250px'}):null;
  function watchCountry(row,match){
    row.setAttribute('data-nationality-match','');row.nationalityMatch=match;markCountry(row);
    if(!match.home_id&&!match.away_id)return;
    if(observer){observer.observe(row);}
    else{queue.push({row,match});drain();}
  }
  function finishRow(row,match){
    const goals=scorers(match);if(goals)row.append(goals);
    watchCountry(row,match);
    const url=href(match);if(!url)return;
    row.classList.add('clickable-match');
    row.addEventListener('click',event=>{if(!event.target.closest('a,button,input,select'))location.assign(url);});
  }
  CountryHighlight.onChange(()=>{for(const row of document.querySelectorAll('[data-nationality-match]'))markCountry(row);});
  window.MatchUI={href,scoreLink,goalText,scorers,finishRow,markCountry,watchCountry,squad};
})();
