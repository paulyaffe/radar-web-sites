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
    if(!match.has_uruguayan)return;
    row.classList.add('uruguay-match');row.title='Uruguay: '+(match.uruguayan_players || []).map(p=>p.name).join(', ');
    for(const name of row.querySelectorAll('[data-athlete-id]'))flagName(name,match.uruguayan_players?.some(p=>p.id===name.dataset.athleteId));
  }
  const checks=new Map(),queue=[];let active=0;
  async function checkUruguay(match){
    const key=match.competition+':'+match.id,cached=checks.get(key);
    if(cached&&Date.now()-cached.time<60000)return cached.promise;
    const promise=fetch('/api/partido?'+new URLSearchParams({competicion:match.competition,id:match.id,uruguay:'1'}),{signal:AbortSignal.timeout(20000)})
      .then(async response=>{if(!response.ok)throw Error('Convocatoria no disponible');return(await response.json()).match;})
      .catch(()=>{checks.delete(key);return null;});
    checks.set(key,{time:Date.now(),promise});
    return promise;
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
  function finishRow(row,match){
    const goals=scorers(match);if(goals)row.append(goals);
    const url=href(match);if(!url)return;
    row.classList.add('clickable-match');
    row.addEventListener('click',event=>{if(!event.target.closest('a,button,input,select'))location.assign(url);});
    markUruguay(row,match);
    if(!match.lineups_published&&observer){row.uruguayMatch=match;observer.observe(row);}
  }
  window.MatchUI={href,scoreLink,goalText,scorers,finishRow,flagName,markUruguay};
})();
