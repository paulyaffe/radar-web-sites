(function(){
  'use strict';
  const n=(v,lo,hi,label)=>{const x=Number(v);if(v===''||!Number.isFinite(x)||x<lo||x>hi)throw Error(`${label}: introduce un valor entre ${lo} y ${hi}.`);return x;};
  function calculate(type,v){
    if(type==='masa'){
      const p=n(v.pieces,1,100,'Piezas');if(!Number.isInteger(p))throw Error('El número de piezas debe ser entero.');
      const weight=n(v.weight,20,2000,'Peso'),h=n(v.hydration,0,150,'Hidratación'),s=n(v.salt,0,10,'Sal'),o=n(v.oil,0,50,'Aceite'),y=n(v.yeast,0,10,'Levadura');
      const f=p*weight/(1+(h+s+o+y)/100);
      return [['Harina',f,'g'],['Agua',f*h/100,'g'],['Sal',f*s/100,'g'],['Aceite',f*o/100,'g'],['Levadura seca',f*y/100,'g'],['Masa total',p*weight,'g']];
    }
    if(type==='madre'){
      const f=n(v.flour,1,100000,'Harina'),h=n(v.hydration,0,150,'Hidratación'),p=n(v.fermented,0,100,'Harina prefermentada'),sh=n(v.starterHydration,0,200,'Hidratación de masa madre');
      const sf=f*p/100,sw=sf*sh/100,water=f*h/100-sw;
      if(water< -1e-8)throw Error('La masa madre aporta más agua que la hidratación objetivo.');
      return [['Harina por añadir',f-sf,'g'],['Agua por añadir',Math.max(0,water),'g'],['Masa madre',sf+sw,'g']];
    }
    if(type==='consumo'){
      const w=n(v.watts,0,100000,'Vatios'),h=n(v.hours,0,24,'Horas'),d=n(v.days,0,366,'Días'),p=n(v.price,0,10,'Precio kWh');
      const k=w*h*d/1000;return [['Energía',k,'kWh'],['Coste de esa energía',k*p,'€']];
    }
    if(type==='ahorro'){
      const old=n(v.old,0,100000,'Consumo actual'),fresh=n(v.new,0,100000,'Consumo nuevo'),h=n(v.hours,0,24,'Horas'),p=n(v.price,0,10,'Precio kWh'),i=n(v.investment,0,100000,'Inversión');
      const factor=h*365/1000*p,annual=(old-fresh)*factor;
      return [['Energía actual al año',old*factor,'€'],['Energía nueva al año',fresh*factor,'€'],['Ahorro anual',annual,'€'],['Recuperación simple',annual>0?i/annual*12:'Sin ahorro de energía',annual>0?'meses':'']];
    }
    if(type==='moldes'){
      const old=n(v.old,1,100,'Diámetro original'),fresh=n(v.new,1,100,'Diámetro nuevo'),a=n(v.amount,0,100000,'Cantidad'),factor=(fresh/old)**2;
      return [['Factor de escala',factor,'×'],['Cantidad nueva',a*factor,'g']];
    }
    const from=n(v.from,1,100,'Raciones originales'),to=n(v.to,1,100,'Raciones deseadas'),a=n(v.amount,0,100000,'Cantidad');
    return [['Factor de escala',to/from,'×'],['Cantidad nueva',a*to/from,'g']];
  }
  if(typeof module!=='undefined')module.exports={calculate};
  if(typeof document==='undefined')return;
  const fmt=(x,unit)=>typeof x==='number'?x.toLocaleString('es-ES',{maximumFractionDigits:unit==='€'?2:2,minimumFractionDigits:unit==='€'?2:0}):x;
  document.querySelectorAll('form[data-tool]').forEach(form=>{
    const run=()=>{
      const out=form.querySelector('.result'),error=form.querySelector('.form-error');out.replaceChildren();error.textContent='';
      const values={};form.querySelectorAll('input[name]').forEach(i=>values[i.name]=i.value);
      try{const rows=calculate(form.dataset.tool,values);rows.forEach(([label,value,unit])=>{const row=document.createElement('div');row.className='result-row';const l=document.createElement('span'),r=document.createElement('strong');l.textContent=label;r.textContent=`${fmt(value,unit)} ${unit}`;row.append(l,r);out.append(row);});}
      catch(e){error.textContent=e.message;}
    };
    form.addEventListener('submit',e=>{e.preventDefault();run();});form.addEventListener('input',run);run();
  });
  document.querySelectorAll('[data-recipe]').forEach(box=>{
    const input=box.querySelector('.servings');input.addEventListener('input',()=>{
      const desired=Number(input.value);if(!Number.isFinite(desired)||desired<1||desired>100)return;
      box.querySelectorAll('[data-amount]').forEach(el=>el.textContent=fmt(Number(el.dataset.amount)*desired/Number(input.dataset.base),'g'));
    });
  });
})();
