import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeMatchDetails} from '../calendar_worker.mjs';

// Run the actual calendar, team and match scripts at their DOM/fetch boundary.
// This uses no browser, external requests, advertisements or Analytics events.
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.style={};this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},toggle:(name,on)=>{const parts=this.className.split(' ').filter(n=>n&&n!==name);if(on)parts.push(name);this.className=parts.join(' ');}};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return(this.text||'')+this.children.map(n=>n.textContent).join('');}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){this.text='';for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  addEventListener(name,fn){this.listeners[name]=fn;}
  focus(){this.listeners.focus?.({});}
  click(){this.listeners.click?.({});}
  select(){this.textSelected=true;}
  contains(target){return target===this||nodes(this).includes(target);}
  querySelector(selector){return this.selectors?.[selector]||this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){return this.many?.[selector]||nodes(this).filter(n=>selector==='[data-athlete-id]'?n.dataset.athleteId:selector.startsWith('.')?n.className.split(' ').includes(selector.slice(1)):selector.startsWith('[data-')?Object.hasOwn(n.attributes,selector.slice(1,-1)):false);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
const nodes=node=>node.children.flatMap(n=>[n,...nodes(n)]),classes=(node,name)=>nodes(node).filter(n=>n.className.split(' ').includes(name));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/match-real.json',import.meta.url),'utf8'));
const data=normalizeMatchDetails(fixture,'CL','401915313');data.updated='2026-10-22T10:00:00Z';
function context(root,selector,payload,search,fail=false,saved=null){
  const requests=[],navigations=[],squads=new Map(),events={},documentEvents={},storage=new Map(saved===null?[]:[['lajornada.highlight-country',saved]]),input=new Element('input'),picker=new Element('div'),options=new Element('ul'),toggle=new Element('button'),variables={};
  picker.append(input,toggle,options);
  const controls={'[data-highlight-country]':input,'[data-country-picker]':picker,'[data-country-options]':options,'[data-country-toggle]':toggle};
  const document={hidden:false,title:'',body:{style:{setProperty:(k,v)=>variables[k]=v}},addEventListener:(k,fn)=>documentEvents[k]=fn,querySelector:q=>q===selector?root:controls[q]||null,querySelectorAll:q=>root.querySelectorAll(q),
    createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment')};
  const sandbox={document,console,Intl,Date,URLSearchParams,URL,AbortController,AbortSignal,
    location:{search,href:'https://site.test/'+search,assign:url=>navigations.push(url)},history:{replaceState(){}},setInterval(){},addEventListener:(k,fn)=>events[k]=fn,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    FixtureNavigation:{createNavigator:()=>async()=>null},fetch:async url=>{requests.push(url);if(fail)throw Error('offline');if(String(url).startsWith('/api/plantilla?')){const id=new URL(url,'https://site.test').searchParams.get('id');return Response.json(squads.get(id)||{team:{id},basis:'first_team_squad',available:true,players:[{id:'1',name:'Jugador',number:'1'}],uruguayan_players:[],has_uruguayan:false});}return Response.json(payload);}};
  sandbox.window=sandbox;vm.createContext(sandbox);
  for(const file of ['country-data.js','country-highlight.js','match-ui.js'])vm.runInContext(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),sandbox);
  return {sandbox,requests,navigations,squads,input,picker,options,toggle,storage,variables,events,documentEvents};
}
async function run(file,state){vm.runInContext(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),state.sandbox);for(let i=0;i<10;i++)await new Promise(setImmediate);}
for(const scenario of ['pitch','list','unpublished','failure','midnight','uruguay','lineup-only']){
  const root=new Element('section'),status=new Element('p'),content=new Element('div'),back=new Element('a');
  root.selectors={'[data-match-status]':status,'[data-match-content]':content,'[data-match-back]':back};root.append(back,status,content);
  const sample=structuredClone(data);
  if(scenario==='list')sample.lineups.forEach(l=>l.rows=[]);
  if(scenario==='unpublished'){sample.lineups.forEach(l=>{l.rows=[];l.players=[];l.formation='';});sample.match.home_score=null;sample.match.away_score=null;sample.match.goals=[];}
  if(scenario==='midnight')sample.match.date='2026-10-21T22:30:00Z';
  if(scenario==='uruguay'||scenario==='lineup-only'){
    const players=[sample.lineups[0].players.find(p=>p.starter),sample.lineups[1].players.find(p=>!p.starter)];
    players.forEach(p=>{p.uruguayan=true;p.nationality='Uruguay';});sample.match.has_uruguayan=true;sample.match.uruguayan_players=players;
    sample.match.goals[0].athlete_id=players[0].id;
  }
  const state=context(root,'[data-match-detail]',sample,'?competicion=CL&id=401915313',scenario==='failure');
  if(scenario==='uruguay')state.squads.set(sample.match.home_id,{team:{id:sample.match.home_id},basis:'first_team_squad',available:true,players:[{id:'999991',name:'Uruguayo no convocado',uruguayan:true}],uruguayan_players:[{id:'999991',name:'Uruguayo no convocado'}],has_uruguayan:true});
  await run('match.js',state);
  assert.equal(root.attributes['aria-busy'],'false');assert.equal(state.requests.filter(u=>u.startsWith('/api/partido?')).length,1);assert.ok(state.requests[0].startsWith('/api/partido?'));
  if(scenario==='failure'){assert.equal(content.children[0].textContent,'Reintentar');continue;}
  assert.ok(content.textContent.includes('Champions League'));assert.ok(content.textContent.includes('Real Madrid'));assert.ok(content.textContent.includes('RB Leipzig'));
  assert.equal(new URL(back.href,'https://site.test').searchParams.get('fecha'),scenario==='midnight'?'2026-10-22':'2026-10-21');
  if(scenario==='unpublished'){assert.ok(content.textContent.includes('vs'));assert.equal(classes(content,'lineup-unavailable').length,2);assert.equal(classes(content,'lineup-pitch').length,0);continue;}
  assert.ok(content.textContent.includes('K. Mbappé 83′'));assert.ok(content.textContent.includes('T. Gomis 85′'));
  assert.equal(classes(content,'lineup-card').length,2);assert.equal(classes(content,'lineup-pitch').length,scenario==='list'?0:2);
  assert.equal(classes(content,'pitch-player').length,scenario==='list'?0:22);assert.equal(classes(content,'lineup-player').length,scenario==='list'?46:24);
  assert.equal(classes(content,'match-result')[0].textContent,'4 – 1');assert.ok(content.textContent.includes('Banquillo'));
  if(scenario==='uruguay'){
    assert.equal(classes(content,'country-match').length,1);
    assert.equal(classes(content,'pitch-player').filter(n=>n.className.includes('country-player')).length,1);
    assert.equal(classes(content,'lineup-player').filter(n=>n.className.includes('country-player')).length,1);
    assert.equal(classes(content,'highlight-flag').length,3,'Starter, unused substitute and goals get a Uruguay flag');
    for(const flag of classes(content,'highlight-flag'))assert.equal(flag.alt,'Uruguay');
    const names=classes(content,'player-name').filter(n=>n.querySelector('.highlight-flag'));
    assert.equal(names.length,2);assert.ok(names.every(n=>n.text&&n.children[0].tagName==='img'),'Flags follow each player name');
  }else assert.equal(classes(content,'country-match').length,0);
}
{
  const root=new Element('section'),form=new Element('form'),status=new Element('p'),list=new Element('div'),today=new Element('button');
  const date=new Element('input'),filter=new Element('select');filter.value='CL';filter.options=[{value:'CL',dataset:{group:'clubes'}}];form.elements={fecha:date,competicion:filter};form.reportValidity=()=>true;
  root.selectors={'form':form,'[data-fixtures-status]':status,'[data-fixtures-list]':list,'[data-today]':today};root.many={'[data-day-step]':[]};root.append(form,status,list,today);
  const calendarMatch={...data.match};calendarMatch.lineups_published=true;
  const state=context(root,'[data-fixtures]',{competitions:[{code:'CL',name:'Champions League',matches:[calendarMatch]}]},'?fecha=2026-10-21&competicion=CL');
  state.sandbox.IntersectionObserver=class{
    constructor(callback){this.callback=callback;}
    observe(target){setImmediate(()=>this.callback([{target,isIntersecting:true}]));}
    unobserve(){}
  };
  state.sandbox.fetch=async url=>{state.requests.push(url);if(String(url).startsWith('/api/plantilla?')){const id=new URL(url,'https://site.test').searchParams.get('id');return Response.json({team:{id},basis:'first_team_squad',available:true,players:id===data.match.home_id?[{id:data.match.goals[0].athlete_id,name:'Uruguayo del primer equipo',nationality:'Uruguay'}]:[{id:'1',name:'Jugador'}]});}return Response.json({competitions:[{code:'CL',name:'Champions League',matches:[calendarMatch]}]});};
  vm.runInContext(fs.readFileSync(new URL('../assets/match-ui.js',import.meta.url),'utf8'),state.sandbox);
  await run('calendar.js',state);
  const link=classes(list,'match-link')[0];assert.equal(new URL(link.href,'https://site.test').searchParams.get('id'),'401915313');
  assert.equal(classes(list,'team-link').length,2,'Team histories remain separate links');
  assert.equal(classes(list,'fixture-goals').length,1);assert.ok(list.textContent.includes('B. Silva 43′'));assert.ok(list.textContent.includes('T. Gomis 85′'));
  const row=classes(list,'fixture-row')[0];row.listeners.click({target:{closest:()=>null}});assert.equal(state.navigations[0],link.href);
  assert.equal(classes(list,'country-match').length,1,'The visible calendar row turns blue from the current squad even with old lineups already published');
  assert.equal(classes(list,'highlight-flag').length,1,'The scorer gets a flag after the asynchronous first-team check');
  row.listeners.click({target:{closest:()=>({})}});assert.equal(state.navigations.length,1,'Clicking a team does not trigger match navigation');
}
{
  const root=new Element('section'),heading=new Element('h1'),status=new Element('p'),content=new Element('div');root.selectors={'h1':heading,'[data-team-status]':status,'[data-team-content]':content};root.append(heading,status,content);
  const future={...data.match,id:'401999999',goals:[],home_score:null,away_score:null};
  const payload={team:{id:'86',name:'Real Madrid',national:false},past:{matches:[data.match]},future:{matches:[future]}};
  const state=context(root,'[data-team-history]',payload,'?id=86&competicion=CL');
  state.squads.set('86',{team:{id:'86'},basis:'first_team_squad',available:true,players:[{id:'10',name:'Jugador uruguayo',number:'8',position:'Centrocampista',nationality:'Uruguay'},{id:'11',name:'Jugador brasileño',number:'1',position:'Portero',nationality:'Brazil'},{id:'12',name:'Jugador español',number:'3',nationality:'Spain'}]});
  await run('team.js',state);
  assert.ok(content.children[0].className.includes('team-squad-section'),'Squad precedes both match lists');
  assert.equal(classes(content,'squad-player').length,3);assert.equal(classes(content,'squad-player').filter(n=>n.className.includes('country-player')).length,1);
  const playerName=classes(content,'squad-player-name').find(n=>n.textContent==='Jugador uruguayo');assert.equal(playerName.children.at(-1).className,'highlight-flag');
  assert.equal(state.requests.filter(u=>u==='/api/plantilla?id=86').length,1,'Squad display and all match rows reuse the same request');
  assert.ok(content.textContent.indexOf('Primer equipo')<content.textContent.indexOf('Últimos 5 partidos'));
  assert.equal(classes(content,'match-link').length,2);assert.equal(classes(content,'fixture-goals').length,1);assert.ok(content.textContent.includes('K. Mbappé 83′'));
  const malicious=state.sandbox.MatchUI.scorers({goals:[{side:'home',name:'<script>throw 1</script>',minute:'1′'}]});
  assert.ok(malicious.textContent.includes('<script>'));assert.equal(nodes(malicious).filter(n=>n.tagName==='script').length,0);
  const before=state.requests.length;
  assert.equal(state.input.value,'Uruguay','Uruguay is the initial selection');
  state.input.focus();state.input.value='bra';state.input.listeners.input({});
  classes(state.options,'country-option')[0].click();
  assert.equal(state.variables['--country-bg'],'#fff0ad','Brazil uses yellow');
  assert.equal(classes(content,'country-match').length,2,'All history rows change from squad data');
  assert.equal(classes(content,'squad-player').filter(n=>n.className.includes('country-player')).length,1);
  assert.equal(classes(content,'squad-player').find(n=>n.className.includes('country-player')).highlightPlayer.name,'Jugador brasileño');
  assert.equal(playerName.children.length,0,'Changing country removes the previous flag');
  assert.equal(classes(content,'highlight-flag')[0].alt,'Brasil');
  assert.equal(state.storage.get('lajornada.highlight-country'),'BR');assert.equal(state.requests.length,before,'Changing country does not request squads again');
  state.sandbox.CountryHighlight.choose('DE');assert.equal(classes(content,'country-match').length,0);assert.equal(classes(content,'country-player').length,0);
  state.sandbox.CountryHighlight.choose('');assert.equal(classes(content,'highlight-flag').length,0,'Highlighting can be disabled');
  const next=context(new Element('section'),'[data-test]',{},'',false,'BR');assert.equal(next.input.value,'Brasil','Country persists on the next page');
}
{
  const state=context(new Element('section'),'[data-test]',{},'');
  const api=state.sandbox.CountryHighlight;
  assert.equal(api.countries.size,254);assert.equal(new Set(state.sandbox.FootballCountries.map(c=>c[0])).size,254);
  for(const country of api.countries.values()){assert.equal(country.colours.length,3);assert.ok(country.flag.startsWith('https://'));}
  for(const [nationality,code] of [['Brazil','BR'],['Brasil','BR'],['BRA','BR'],['Uruguay','UY'],['England','GB-ENG'],['Northern Ireland','GB-NIR'],['United States','US'],['Congo DR','CD'],['Congo','CG'],['Ivory Coast','CI'],['Côte d’Ivoire','CI'],['South Korea','KR'],['Korea DPR','KP'],['Türkiye','TR'],['Macedonia','MK']])assert.equal(api.countryOf({nationality})?.code,code,nationality);
  assert.equal(api.countryOf({flag:'https://a.espncdn.com/i/teamlogos/countries/500/ger.png'}).code,'DE');
  assert.equal(api.countryOf({birthPlace:{country:'Brazil'}}),null,'Never infer nationality from birthplace');
  assert.equal(api.choose('<script>'),false);assert.equal(api.selected.code,'UY');
  assert.equal(context(new Element('section'),'[data-test]',{},'',false,'invalid').input.value,'Uruguay');
  state.events.storage({key:'lajornada.highlight-country',newValue:'BR'});assert.equal(state.input.value,'Brasil','Open tabs follow the same preference');
  state.events.storage({key:'lajornada.highlight-country',newValue:null});assert.equal(state.input.value,'Uruguay','Removing the preference restores Uruguay');
}
{
  const state=context(new Element('section'),'[data-test]',{},'');
  const {input,options,toggle,picker}=state,api=state.sandbox.CountryHighlight;
  const values=()=>classes(options,'country-option').map(option=>option.textContent);
  const type=value=>{input.value=value;input.listeners.input({});return values();};
  const key=value=>{const event={key:value,preventDefault(){this.prevented=true;}};input.listeners.keydown(event);return event;};
  input.focus();assert.equal(input.textSelected,true);assert.equal(options.hidden,false);assert.equal(values().length,255);
  input.textSelected=false;input.click();assert.equal(input.textSelected,true,'The first typed letter replaces the selected country, including on pointer focus');
  for(const value of ['u','ur','uru','b','br','bra','es','España','  BRA','é']){
    const found=type(value),fold=v=>v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    assert.ok(found.length>0,value);assert.ok(found.every(name=>fold(name).startsWith(fold(value))),value);
  }
  assert.ok(type('u').includes('Uruguay'));assert.deepEqual(type('ur'),['Uruguay']);
  assert.ok(!type('guay').includes('Uruguay'),'The filter matches prefixes, never substrings');
  type('zzzz');
  assert.equal(classes(options,'country-empty').length,1);assert.equal(input.attributes['aria-activedescendant'],undefined);
  key('Enter');assert.equal(api.selected.code,'UY','An empty result cannot select a country');
  type('br');assert.deepEqual(values(),['Brasil','Brunéi']);assert.equal(api.selected.code,'UY','Typing alone does not change highlighting');
  assert.equal(input.attributes['aria-expanded'],'true');assert.ok(input.attributes['aria-activedescendant']);
  assert.equal(key('Enter').prevented,true);assert.equal(api.selected.code,'BR');assert.equal(input.value,'Brasil');assert.equal(options.hidden,true);
  assert.equal(input.attributes['aria-activedescendant'],undefined);assert.equal(state.storage.get('lajornada.highlight-country'),'BR');
  input.click();assert.equal(values().length,255,'The list reopens after choosing a country');type('es');
  const first=classes(options,'country-option')[0];key('ArrowDown');assert.notEqual(input.attributes['aria-activedescendant'],first.id);key('ArrowUp');assert.equal(input.attributes['aria-activedescendant'],first.id);
  key('Escape');assert.equal(input.value,'Brasil');assert.equal(options.hidden,true);assert.equal(api.selected.code,'BR');
  type('ur');key('Tab');assert.equal(input.value,'Brasil');assert.equal(options.hidden,true,'Tab discards an unfinished query');
  toggle.click();assert.equal(options.hidden,false);toggle.click();assert.equal(options.hidden,true);
  input.click();type('z');state.documentEvents.pointerdown({target:input});assert.equal(options.hidden,false,'Editing inside the picker keeps it open');
  state.documentEvents.pointerdown({target:new Element('main')});assert.equal(options.hidden,true);assert.equal(input.value,'Brasil');
  input.click();picker.listeners.focusout({relatedTarget:toggle});assert.equal(options.hidden,false);
  picker.listeners.focusout({relatedTarget:new Element('button')});assert.equal(options.hidden,true);
  type('sin');classes(options,'country-option')[0].click();assert.equal(api.selected,null);assert.equal(input.value,'Sin resaltar');
  assert.equal(type('').length,255,'Clearing the search restores the whole list');
  const before=values();input.value='bra';input.listeners.input({isComposing:true});assert.deepEqual(values(),before);
  input.listeners.compositionend();assert.deepEqual(values(),['Brasil']);
  assert.equal(state.requests.length,0,'Filtering countries is entirely local');
}
{
  const root=new Element('section'),status=new Element('p'),content=new Element('div'),back=new Element('a');
  root.selectors={'[data-match-status]':status,'[data-match-content]':content,'[data-match-back]':back};root.append(back,status,content);
  const sample=structuredClone(data),player=sample.lineups[0].players.find(p=>p.starter),sub=sample.lineups[0].players.find(p=>!p.starter);
  player.nationality='Brazil';sub.nationality='Brazil';sample.match.goals=[{side:'home',name:player.name,athlete_id:player.id,minute:'10′'}];
  const state=context(root,'[data-match-detail]',sample,'?competicion=CL&id=401915313',false,'BR');
  state.squads.set(sample.match.away_id,{team:{id:sample.match.away_id},basis:'first_team_squad',available:true,players:[{id:'999',name:'Brasileño no convocado',nationality:'Brazil'}]});
  await run('match.js',state);
  assert.equal(classes(content,'country-match').length,1,'A Brazilian on the away current squad highlights the match');
  assert.equal(classes(content,'pitch-player').filter(n=>n.className.includes('country-player')).length,1);
  assert.equal(classes(content,'lineup-player').filter(n=>n.className.includes('country-player')).length,1);
  assert.equal(classes(content,'highlight-flag').length,3);assert.ok(classes(content,'highlight-flag').every(flag=>flag.alt==='Brasil'));
  state.sandbox.CountryHighlight.choose('UY');assert.equal(classes(content,'country-match').length,0);assert.equal(classes(content,'highlight-flag').length,0);
}
{
  const root=new Element('section'),row=new Element('article');root.append(row);
  const state=context(root,'[data-test]',{},''),pending=[];
  state.sandbox.fetch=url=>{state.requests.push(url);return new Promise(resolve=>pending.push({url,resolve}));};
  state.sandbox.MatchUI.watchCountry(row,{home_id:'86',away_id:'83'});
  state.sandbox.CountryHighlight.choose('BR');
  for(const {url,resolve} of pending){const id=new URL(url,'https://site.test').searchParams.get('id');resolve(Response.json({team:{id},basis:'first_team_squad',available:true,players:[{id:'10',name:'Uruguayo',nationality:'Uruguay'}]}));}
  for(let i=0;i<8;i++)await new Promise(setImmediate);
  assert.equal(classes(root,'country-match').length,0,'A late response uses the latest selection, not the country at request time');
  const before=state.requests.length;state.sandbox.CountryHighlight.choose('UY');
  assert.equal(classes(root,'country-match').length,1);assert.equal(state.requests.length,before);
  const offline=new Element('article');root.append(offline);state.sandbox.fetch=async()=>{throw Error('offline');};
  state.sandbox.MatchUI.watchCountry(offline,{home_id:'9999',away_id:'9998'});
  for(let i=0;i<8;i++)await new Promise(setImmediate);
  assert.ok(!offline.className.includes('country-match'),'Missing nationality never invents a match');
}
console.log('Páginas: calendario y equipos enlazan partidos; goles, 22 titulares, banquillos, campo, lista alternativa, ausencia de datos y fechas comprobados.');
