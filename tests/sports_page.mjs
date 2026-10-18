import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual page script with a DOM boundary, including startup and
// its asynchronous first fetch. Syntax-only checks missed a startup exception.
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.isConnected=true;this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');}};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return (this.text||'')+this.children.map(n=>n.textContent).join('');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.text='';this.children=nodes;}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(){}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){return descendants(this).filter(n=>selector==='[data-table-link]'?n.dataset.tableLink:selector==='[data-athlete-id]'?n.dataset.athleteId:selector==='img'?n.tagName==='img':false);}
}
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
const source=fs.readFileSync(new URL('../assets/sports-data.js',import.meta.url),'utf8');
for(const kind of ['clasificacion','goleadores'])for(const competition of ['ARG','MLS']){
  const root=new Element('section'),title=new Element('h1'),status=new Element('p'),list=new Element('div'),back=new Element('a');
  root.dataset.competitionTable=kind;
  const links=['clasificacion','goleadores'].map(name=>{const a=new Element('a');a.dataset.tableLink=name;return a;});
  root.append(back,title,...links,status,list);
  const selectors={'h1':title,'[data-data-status]':status,'[data-data-list]':list,'[data-back-to-matches]':back};
  const ordinaryQuery=root.querySelector.bind(root);root.querySelector=s=>selectors[s]||ordinaryQuery(s);
  const team={id:'1',name:'Club A',national:false},requests=[];
  const data={name:'Liga '+competition,season:'2026',updated:'2026-10-18T12:00:00Z',
    groups:[{name:'Grupo A',rows:[{rank:1,team,points:0,played:0,won:0,drawn:0,lost:0,for:0,against:0,difference:0}]},
      {name:'Grupo B',rows:[{rank:1,team:{...team,id:'2',name:'Club B'},points:3,played:1,won:1,drawn:0,lost:0,for:1,against:0,difference:1}]}],
    scorers:[{name:'Jugador A',goals:4,played:3,team,flag:'https://a.espncdn.com/i/teamlogos/countries/500/arg.png',nationality:'Argentina'}]};
  const document={hidden:false,title:'',querySelector:s=>s==='[data-competition-table]'?root:null,createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),createTextNode:text=>{const n=new Element('text');n.textContent=text;return n;}};
  vm.runInNewContext(source,{document,Intl,Date,Node:Element,URLSearchParams,AbortController,
    location:{search:'?competicion='+competition},history:{replaceState(){}},setInterval(){},
    fetch:async url=>{requests.push(String(url));return Response.json(data);}});
  for(let i=0;i<8;i++)await new Promise(setImmediate);
  assert.equal(requests.length,1,'The selected table loads without a selector or submit');
  const query=new URL(requests[0],'https://site.test').searchParams;
  assert.equal(query.get('competicion'),competition);assert.equal(query.get('tipo'),kind);
  assert.equal(title.textContent,data.name);assert.equal(root.attributes['aria-busy'],'false');
  assert.equal(new URL(back.href,'https://site.test').searchParams.get('competicion'),competition);
  for(const link of links)assert.equal(new URL(link.href,'https://site.test').searchParams.get('competicion'),competition);
  const nodes=descendants(list),tables=nodes.filter(n=>n.tagName==='table');
  assert.equal(tables.length,kind==='clasificacion'?2:1,'The page must render populated tables, not just receive API data');
  assert.ok(list.textContent.includes(kind==='clasificacion'?'Club A':'Jugador A'));
  assert.ok(status.textContent.includes('2026'));
  if(kind==='goleadores')assert.equal(nodes.filter(n=>n.tagName==='img').length,1,'Keep the player nationality flag');
}
console.log('Páginas de tablas: arranque, competición elegida, carga directa, filas, grupos y banderas comprobados.');
