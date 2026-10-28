(function(){
  'use strict';
  const palettes={sky:['#d9f0fc','#a8d5ec','#173e53'],yellow:['#fff0ad','#ddc455','#493b0b'],red:['#f9dce0','#e5a5ae','#632b35'],blue:['#dce8ff','#a6bee9','#233e6b'],navy:['#dfe3f2','#acb5d5','#293452'],green:['#d9efdf','#9dcbac','#234b32'],orange:['#ffe3c5','#e6bc85','#5b3b16'],maroon:['#efdae2','#d2a1b2','#5f293e'],black:['#e2e5e8','#aeb7c0','#2d3742'],white:['#f1f3f6','#bbc4d0','#293543']};
  const key='lajornada.highlight-country',aliases=new Map(),countries=new Map(),listeners=[];
  const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const [code,name,names,shirt] of window.FootballCountries){
    const country={code,name,shirt,colours:palettes[shirt],flag:/^[A-Z]{2}$/.test(code)?'https://flagcdn.com/w40/'+code.toLowerCase()+'.png':'https://a.espncdn.com/i/teamlogos/countries/500/'+names.at(-1)+'.png'};
    countries.set(code,country);for(const alias of [code,name,...names])aliases.set(clean(alias),country);
  }
  let selected=countries.get('UY');
  try{const saved=localStorage.getItem(key);if(saved===''||countries.has(saved))selected=countries.get(saved)||null;}catch{}
  function countryOf(player){
    if(!player)return null;
    const named=aliases.get(clean(player.nationality));if(named)return named;
    const flag=String(player.flag||'').match(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/countries\/\d+\/([a-z0-9-]+)\.png(?:\?.*)?$/i);
    return aliases.get(clean(flag?.[1])) || (player.uruguayan===true?countries.get('UY'):null);
  }
  function matches(player){return !!selected&&countryOf(player)?.code===selected.code;}
  function paintPlayer(item){
    const player=item.highlightPlayer,name=item.highlightName;if(!name)return;
    const on=matches(player);item.classList.toggle('country-player',on);
    for(const flag of name.querySelectorAll('.highlight-flag'))flag.remove();
    if(on&&!name.querySelector('.nationality-flag')){
      const flag=document.createElement('img');flag.className='highlight-flag';flag.src=selected.flag;flag.alt=selected.name;flag.title=selected.name;
      flag.width=18;flag.height=12;flag.referrerPolicy='no-referrer';flag.addEventListener('error',()=>flag.remove(),{once:true});name.append(flag);
    }
  }
  function watchPlayer(item,name,player){item.setAttribute('data-nationality-player','');item.highlightName=name;item.highlightPlayer=player;paintPlayer(item);}
  function repaint(){
    const colours=selected?.colours||palettes.white;
    ['--country-bg','--country-edge','--country-ink'].forEach((variable,i)=>document.body?.style.setProperty(variable,colours[i]));
    for(const item of document.querySelectorAll('[data-nationality-player]'))paintPlayer(item);
    for(const listener of listeners)listener();
  }
  function choose(code,persist=true){
    if(code!==''&&!countries.has(code))return false;selected=countries.get(code)||null;
    if(select)select.value=selected?.code||'';
    if(persist)try{localStorage.setItem(key,code);}catch{}
    repaint();return true;
  }
  const select=document.querySelector('[data-highlight-country]');
  if(select){
    const options=document.createDocumentFragment(),off=document.createElement('option');off.value='';off.textContent='Sin resaltar';options.append(off);
    for(const country of [...countries.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'))){const option=document.createElement('option');option.value=country.code;option.textContent=country.name;options.append(option);}
    select.replaceChildren(options);select.value=selected?.code||'';select.addEventListener('change',()=>choose(select.value));
  }
  window.CountryHighlight={get selected(){return selected;},countries,countryOf,matches,watchPlayer,repaint,choose,onChange:callback=>listeners.push(callback)};
  repaint();
  window.addEventListener('storage',event=>{if(event.key===key)choose(event.newValue===null?'UY':event.newValue,false);});
})();
