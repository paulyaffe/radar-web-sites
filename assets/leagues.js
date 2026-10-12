(function(){
  'use strict';
  const container=document.getElementById('ligas-data');if(!container)return;
  const leagues={PD:['España','La Liga'],SA:['Italia','Serie A'],PL:['Inglaterra','Premier League'],FL1:['Francia','Ligue 1'],DED:['Países Bajos','Eredivisie'],PPL:['Portugal','Primeira Liga'],BL1:['Alemania','Bundesliga']};
  function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el;}
  async function refresh(){
    try{
      const response=await fetch('/deportes.json',{cache:'no-cache'});if(!response.ok)return;
      const data=await response.json();if(!data.leagues)return;
      const fragment=document.createDocumentFragment();
      for(const [code,[country,name]]of Object.entries(leagues)){
        if(container.dataset.league!=='all'&&container.dataset.league!==code)continue;
        const league=data.leagues[code];const box=element('div',undefined,'scoreboard');
        box.append(element('p',country,'eyebrow'),element('h2',name));
        if(!league){box.append(element('p','Sin datos para este intervalo.','score-meta'));fragment.append(box);continue;}
        box.append(element('p','Consulta: '+league.updated+' · Último partido finalizado: '+(league.latest_result||'Sin fecha'),'score-meta'));
        if(league.latest_result&&Date.now()-Date.parse(league.latest_result+'T00:00:00Z')>7*86400000)box.append(element('p','La fuente lleva más de siete días sin aportar resultados finalizados. Puede estar desactualizada.','editorial-note'));
        for(const m of league.matches.slice(0,12)){
          const row=element('div',undefined,'score-row');const score=m.home_score==null||m.away_score==null?'—':`${m.home_score} – ${m.away_score}`;
          row.append(element('span',m.home),element('strong',score),element('span',m.away));box.append(row,element('p',m.date+' · '+(m.finished?'Finalizado':'Programado; resultado sin confirmar'),'score-meta'));
        }
        box.append(element('p',league.attribution||'Fuente comunitaria','score-meta'));fragment.append(box);
      }
      container.replaceChildren(fragment);
    }catch{/* La copia HTML conserva los últimos datos correctos. */}
  }
  refresh();setInterval(refresh,120000);
})();
