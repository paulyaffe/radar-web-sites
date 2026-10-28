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
  function flagName(node,uruguayan){
    if(!uruguayan||node.querySelector('.uruguay-flag'))return node;
    const flag=el('img',undefined,'uruguay-flag');flag.src='https://a.espncdn.com/i/teamlogos/countries/500/uru.png';
    flag.alt='Uruguay';flag.title='Uruguay';flag.width=18;flag.height=12;flag.referrerPolicy='no-referrer';
    node.append(flag);return node;
  }
  function scorers(match,cls='fixture-goals'){
    if(!Array.isArray(match.goals)||!match.goals.length)return null;
    const box=el('div',undefined,cls);box.setAttribute('aria-label','Goleadores');
    for(const side of ['home','away']){
      const column=el('div',undefined,'goals-'+side);
      for(const goal of match.goals.filter(g=>g.side===side)){
        const item=el('span'),name=el('span',goal.name);name.dataset.athleteId=goal.athlete_id || '';
        flagName(name,match.uruguayan_players?.some(p=>p.id===goal.athlete_id));
        item.append(name,el('span',goalText(goal).slice(goal.name.length)));column.append(item);
      }
      box.append(column);
    }
    return box;
  }
  function markUruguay(row,match){
    row.classList.toggle('uruguay-match',match.has_squad_uruguayan===true);
    row.title=match.has_squad_uruguayan?'Uruguay en plantilla: '+(match.squad_uruguayan_players || []).map(p=>p.name).join(', '):'';
    const players=[...(match.uruguayan_players || []),...(match.squad_uruguayan_players || [])];
    for(const name of row.querySelectorAll('[data-athlete-id]'))flagName(name,players.some(p=>p.id===name.dataset.athleteId));
  }
  const squads=new Map(),queue=[];let active=0;
  async function squad(id){
    if(!/^[1-9]\d{0,8}$/.test(String(id||'')))return null;
    const cached=squads.get(id);if(cached&&Date.now()-cached.time<10*60000)return cached.promise;
    const promise=fetch('/api/plantilla?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(25000)})
      .then(async response=>{if(!response.ok)throw Error('Plantilla no disponible');const data=await response.json();
        if(data.basis!=='first_team_squad'||data.team?.id!==String(id)||!data.available||!Array.isArray(data.players))throw Error('Plantilla no válida');return data;})
      .catch(()=>{squads.delete(id);return null;});
    squads.set(id,{time:Date.now(),promise});return promise;
  }
  async function checkUruguay(match){
    const results=await Promise.all([squad(match.home_id),squad(match.away_id)]);
    const players=results.flatMap((data,index)=>(data?.uruguayan_players || []).map(p=>({...p,side:index?'away':'home'})));
    return {...match,has_squad_uruguayan:players.length?true:results.every(Boolean)?false:null,squad_uruguayan_players:players};
  }
  function drain(){
    while(active<3&&queue.length){
      const {row,match}=queue.shift();if(row.isConnected===false)continue;
      active++;
      checkUruguay(match).then(data=>{if(data&&row.isConnected!==false)markUruguay(row,data);})
        .finally(()=>{active--;drain();});
    }
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);queue.push({row:entry.target,match:entry.target.uruguayMatch});}
    drain();
  },{rootMargin:'250px'}):null;
  function watchUruguay(row,match){
    markUruguay(row,match);
    if(!match.home_id&&!match.away_id)return;
    if(observer){row.uruguayMatch=match;observer.observe(row);}
    else{queue.push({row,match});drain();}
  }
  function finishRow(row,match){
    const goals=scorers(match);if(goals)row.append(goals);
    watchUruguay(row,match);
    const url=href(match);if(!url)return;
    row.classList.add('clickable-match');
    row.addEventListener('click',event=>{if(!event.target.closest('a,button,input,select'))location.assign(url);});
  }
  window.MatchUI={href,scoreLink,goalText,scorers,finishRow,flagName,markUruguay,watchUruguay,squad};
})();
