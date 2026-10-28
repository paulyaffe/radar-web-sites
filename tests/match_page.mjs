import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeMatchDetails} from '../calendar_worker.mjs';

// Run the actual calendar, team and match scripts at their DOM/fetch boundary.
// This uses no browser, external requests, advertisements or Analytics events.
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.style={};this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');}};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return(this.text||'')+this.children.map(n=>n.textContent).join('');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.text='';this.children=nodes;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  querySelector(selector){return this.selectors?.[selector]||(selector==='.uruguay-flag'?nodes(this).find(n=>n.className==='uruguay-flag'):null)||null;}
  querySelectorAll(selector){return this.many?.[selector]||(selector==='[data-athlete-id]'?nodes(this).filter(n=>n.dataset.athleteId):[]);}
  remove(){}
}
const nodes=node=>node.children.flatMap(n=>[n,...nodes(n)]),classes=(node,name)=>nodes(node).filter(n=>n.className.split(' ').includes(name));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/match-real.json',import.meta.url),'utf8'));
const data=normalizeMatchDetails(fixture,'CL','401915313');data.updated='2026-10-22T10:00:00Z';
function context(root,selector,payload,search,fail=false){
  const requests=[],navigations=[],document={hidden:false,title:'',querySelector:q=>q===selector?root:null,
    createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment')};
  const sandbox={document,console,Intl,Date,URLSearchParams,URL,AbortController,AbortSignal,
    location:{search,href:'https://site.test/'+search,assign:url=>navigations.push(url)},history:{replaceState(){}},setInterval(){},
    FixtureNavigation:{createNavigator:()=>async()=>null},fetch:async url=>{requests.push(url);if(fail)throw Error('offline');return Response.json(payload);}};
  sandbox.window=sandbox;vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../assets/match-ui.js',import.meta.url),'utf8'),sandbox);
  return {sandbox,requests,navigations};
}
async function run(file,state){vm.runInContext(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),state.sandbox);for(let i=0;i<10;i++)await new Promise(setImmediate);}
for(const scenario of ['pitch','list','unpublished','failure','midnight','uruguay']){
  const root=new Element('section'),status=new Element('p'),content=new Element('div'),back=new Element('a');
  root.selectors={'[data-match-status]':status,'[data-match-content]':content,'[data-match-back]':back};root.append(back,status,content);
  const sample=structuredClone(data);
  if(scenario==='list')sample.lineups.forEach(l=>l.rows=[]);
  if(scenario==='unpublished'){sample.lineups.forEach(l=>{l.rows=[];l.players=[];l.formation='';});sample.match.home_score=null;sample.match.away_score=null;sample.match.goals=[];}
  if(scenario==='midnight')sample.match.date='2026-10-21T22:30:00Z';
  if(scenario==='uruguay'){
    const players=[sample.lineups[0].players.find(p=>p.starter),sample.lineups[1].players.find(p=>!p.starter)];
    players.forEach(p=>p.uruguayan=true);sample.match.has_uruguayan=true;sample.match.uruguayan_players=players;
    sample.match.goals[0].athlete_id=players[0].id;
  }
  const state=context(root,'[data-match-detail]',sample,'?competicion=CL&id=401915313',scenario==='failure');await run('match.js',state);
  assert.equal(root.attributes['aria-busy'],'false');assert.equal(state.requests.length,1);assert.ok(state.requests[0].startsWith('/api/partido?'));
  if(scenario==='failure'){assert.equal(content.children[0].textContent,'Reintentar');continue;}
  assert.ok(content.textContent.includes('Champions League'));assert.ok(content.textContent.includes('Real Madrid'));assert.ok(content.textContent.includes('RB Leipzig'));
  assert.equal(new URL(back.href,'https://site.test').searchParams.get('fecha'),scenario==='midnight'?'2026-10-22':'2026-10-21');
  if(scenario==='unpublished'){assert.ok(content.textContent.includes('vs'));assert.equal(classes(content,'lineup-unavailable').length,2);assert.equal(classes(content,'lineup-pitch').length,0);continue;}
  assert.ok(content.textContent.includes('K. Mbappé 83′'));assert.ok(content.textContent.includes('T. Gomis 85′'));
  assert.equal(classes(content,'lineup-card').length,2);assert.equal(classes(content,'lineup-pitch').length,scenario==='list'?0:2);
  assert.equal(classes(content,'pitch-player').length,scenario==='list'?0:22);assert.equal(classes(content,'lineup-player').length,scenario==='list'?46:24);
  assert.equal(classes(content,'match-result')[0].textContent,'4 – 1');assert.ok(content.textContent.includes('Banquillo'));
  if(scenario==='uruguay'){
    assert.equal(classes(content,'uruguay-match').length,1);
    assert.equal(classes(content,'uruguay-flag').length,3,'Starter, unused substitute and goals get a Uruguay flag');
    for(const flag of classes(content,'uruguay-flag'))assert.equal(flag.alt,'Uruguay');
    const names=classes(content,'player-name').filter(n=>n.querySelector('.uruguay-flag'));
    assert.equal(names.length,2);assert.ok(names.every(n=>n.text&&n.children[0].tagName==='img'),'Flags follow each player name');
  }else assert.equal(classes(content,'uruguay-match').length,0);
}
{
  const root=new Element('section'),form=new Element('form'),status=new Element('p'),list=new Element('div'),today=new Element('button');
  const date=new Element('input'),filter=new Element('select');filter.value='CL';filter.options=[{value:'CL',dataset:{group:'clubes'}}];form.elements={fecha:date,competicion:filter};form.reportValidity=()=>true;
  root.selectors={'form':form,'[data-fixtures-status]':status,'[data-fixtures-list]':list,'[data-today]':today};root.many={'[data-day-step]':[]};root.append(form,status,list,today);
  const calendarMatch={...data.match};delete calendarMatch.lineups_published;
  const state=context(root,'[data-fixtures]',{competitions:[{code:'CL',name:'Champions League',matches:[calendarMatch]}]},'?fecha=2026-10-21&competicion=CL');
  state.sandbox.IntersectionObserver=class{
    constructor(callback){this.callback=callback;}
    observe(target){setImmediate(()=>this.callback([{target,isIntersecting:true}]));}
    unobserve(){}
  };
  state.sandbox.fetch=async url=>{state.requests.push(url);return Response.json(String(url).includes('uruguay=1')?
    {match:{has_uruguayan:true,uruguayan_players:[{id:data.match.goals[0].athlete_id,name:'Uruguayo convocado'}]}}:
    {competitions:[{code:'CL',name:'Champions League',matches:[calendarMatch]}]});};
  vm.runInContext(fs.readFileSync(new URL('../assets/match-ui.js',import.meta.url),'utf8'),state.sandbox);
  await run('calendar.js',state);
  const link=classes(list,'match-link')[0];assert.equal(new URL(link.href,'https://site.test').searchParams.get('id'),'401915313');
  assert.equal(classes(list,'team-link').length,2,'Team histories remain separate links');
  assert.equal(classes(list,'fixture-goals').length,1);assert.ok(list.textContent.includes('B. Silva 43′'));assert.ok(list.textContent.includes('T. Gomis 85′'));
  const row=classes(list,'fixture-row')[0];row.listeners.click({target:{closest:()=>null}});assert.equal(state.navigations[0],link.href);
  assert.equal(classes(list,'uruguay-match').length,1,'The visible calendar row turns blue after checking the match squad');
  assert.equal(classes(list,'uruguay-flag').length,1,'The scorer gets a flag after the asynchronous squad check');
  row.listeners.click({target:{closest:()=>({})}});assert.equal(state.navigations.length,1,'Clicking a team does not trigger match navigation');
}
{
  const root=new Element('section'),heading=new Element('h1'),status=new Element('p'),content=new Element('div');root.selectors={'h1':heading,'[data-team-status]':status,'[data-team-content]':content};root.append(heading,status,content);
  const future={...data.match,id:'401999999',goals:[],home_score:null,away_score:null};
  const payload={team:{id:'86',name:'Real Madrid',national:false},past:{matches:[data.match]},future:{matches:[future]}};
  const state=context(root,'[data-team-history]',payload,'?id=86&competicion=CL');await run('team.js',state);
  assert.equal(classes(content,'match-link').length,2);assert.equal(classes(content,'fixture-goals').length,1);assert.ok(content.textContent.includes('K. Mbappé 83′'));
  const malicious=state.sandbox.MatchUI.scorers({goals:[{side:'home',name:'<script>throw 1</script>',minute:'1′'}]});
  assert.ok(malicious.textContent.includes('<script>'));assert.equal(nodes(malicious).filter(n=>n.tagName==='script').length,0);
}
console.log('Páginas: calendario y equipos enlazan partidos; goles, 22 titulares, banquillos, campo, lista alternativa, ausencia de datos y fechas comprobados.');
