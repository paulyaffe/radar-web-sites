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
  function scorers(match,cls='fixture-goals'){
    if(!Array.isArray(match.goals)||!match.goals.length)return null;
    const box=el('div',undefined,cls);box.setAttribute('aria-label','Goleadores');
    for(const side of ['home','away']){
      const column=el('div',undefined,'goals-'+side);
      for(const goal of match.goals.filter(g=>g.side===side))column.append(el('span',goalText(goal)));
      box.append(column);
    }
    return box;
  }
  function finishRow(row,match){
    const goals=scorers(match);if(goals)row.append(goals);
    const url=href(match);if(!url)return;
    row.classList.add('clickable-match');
    row.addEventListener('click',event=>{if(!event.target.closest('a,button,input,select'))location.assign(url);});
  }
  window.MatchUI={href,scoreLink,goalText,scorers,finishRow};
})();
