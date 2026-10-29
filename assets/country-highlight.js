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
  const input=document.querySelector('[data-highlight-country]'),picker=document.querySelector('[data-country-picker]'),list=document.querySelector('[data-country-options]'),toggle=document.querySelector('[data-country-toggle]');
  const choices=[{code:'',name:'Sin resaltar'},...[...countries.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'))];
  const prefix=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  let expanded=false,options=[],active=-1;
  let openHelp=null;
  const helpControls=[...document.querySelectorAll('[data-control-help]')].map(wrapper=>({wrapper,button:wrapper.querySelector('[data-help-toggle]'),panel:wrapper.querySelector('[data-help-panel]')})).filter(help=>help.button&&help.panel);
  function closeHelp(restoreFocus=false){
    if(!openHelp)return;
    const {button,panel}=openHelp;openHelp=null;panel.hidden=true;button.setAttribute('aria-expanded','false');
    if(restoreFocus)button.focus();
  }
  function sizeHelp(help){
    const rect=help.button.getBoundingClientRect();
    help.panel.style.width=Math.min(280,Math.max(0,rect.right-12))+'px';
    help.panel.style.maxHeight=Math.max(40,document.documentElement.clientHeight-rect.bottom-20)+'px';
  }
  for(const help of helpControls)help.button.addEventListener('click',()=>{
    const wasOpen=openHelp===help;closeHelp();closePicker();
    if(wasOpen)return;
    sizeHelp(help);help.panel.hidden=false;help.button.setAttribute('aria-expanded','true');openHelp=help;
  });
  document.addEventListener('pointerdown',event=>{if(openHelp&&!openHelp.wrapper.contains(event.target))closeHelp();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openHelp){event.preventDefault();closeHelp(true);}});
  window.addEventListener('resize',()=>{if(openHelp)sizeHelp(openHelp);});
  function closePicker(){
    expanded=false;if(list)list.hidden=true;
    if(input){input.value=selected?.name||'Sin resaltar';input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
    toggle?.setAttribute('aria-expanded','false');
  }
  function activate(index){
    active=index;
    for(const [i,option] of options.entries()){option.classList.toggle('is-active',i===active);option.setAttribute('aria-selected',String(i===active));}
    if(active<0)input.removeAttribute('aria-activedescendant');
    else{input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView?.({block:'nearest'});}
  }
  function showPicker(query=''){
    if(!input||!list)return;
    closeHelp();
    const start=prefix(query),found=choices.filter(country=>prefix(country.name).startsWith(start)),fragment=document.createDocumentFragment();
    options=[];
    for(const country of found){
      const option=document.createElement('li');option.id='country-option-'+(country.code||'none');option.className='country-option';option.setAttribute('role','option');option.textContent=country.name;
      option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>choose(country.code));fragment.append(option);options.push(option);
    }
    if(!found.length){const empty=document.createElement('li');empty.className='country-empty';empty.setAttribute('role','presentation');empty.textContent='Sin coincidencias';fragment.append(empty);}
    list.replaceChildren(fragment);list.hidden=false;expanded=true;input.setAttribute('aria-expanded','true');toggle?.setAttribute('aria-expanded','true');
    const current=found.findIndex(country=>country.code===(selected?.code||''));activate(found.length?(start?0:Math.max(0,current)):-1);
  }
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
    closePicker();
    if(persist)try{localStorage.setItem(key,code);}catch{}
    repaint();return true;
  }
  if(input&&picker&&list){
    closePicker();
    input.addEventListener('focus',()=>{showPicker();input.select();});
    input.addEventListener('click',()=>{if(!expanded)showPicker();if(input.value===(selected?.name||'Sin resaltar'))input.select();});
    input.addEventListener('input',event=>{if(!event.isComposing)showPicker(input.value);});
    input.addEventListener('compositionend',()=>showPicker(input.value));
    input.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();if(!expanded)showPicker();else if(options.length)activate((active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);
      }else if(event.key==='Enter'&&expanded){event.preventDefault();if(active>=0)options[active].click();}
      else if(event.key==='Escape'){event.preventDefault();closePicker();}
      else if(event.key==='Tab')closePicker();
    });
    toggle?.addEventListener('click',()=>{if(expanded)closePicker();else{input.focus();showPicker();}});
    picker.addEventListener('focusout',event=>{if(!picker.contains(event.relatedTarget))closePicker();});
    document.addEventListener('pointerdown',event=>{if(!picker.contains(event.target))closePicker();});
  }
  window.CountryHighlight={get selected(){return selected;},countries,countryOf,matches,watchPlayer,repaint,choose,onChange:callback=>listeners.push(callback)};
  repaint();
  window.addEventListener('storage',event=>{if(event.key===key)choose(event.newValue===null?'UY':event.newValue,false);});
})();
