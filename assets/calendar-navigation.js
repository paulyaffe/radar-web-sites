(function(scope){
  'use strict';
  const DAY=86400000,FRESH=15*60*1000;
  const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
  function createNavigator(readIndex){
    const cache=new Map();
    async function calendars(codes,anchor,signal){
      const result=new Array(codes.length);let next=0;
      // Bound browser requests and large annual responses independently of
      // the number of competitions in the selected group.
      await Promise.all(Array.from({length:Math.min(3,codes.length)},async()=>{
        while(next<codes.length){
          signal.throwIfAborted();const i=next++,code=codes[i];
          const entries=(cache.get(code)||[]).filter(c=>Date.now()-c.saved<FRESH);
          let entry=entries.find(c=>c.from<=anchor&&anchor<c.to);
          if(!entry){
            const data=await readIndex(code,anchor,signal);
            if(!data.complete||data.competition!==code||!Array.isArray(data.dates)||
                !/^20\d{2}-\d{2}-\d{2}$/.test(data.from)||!/^20\d{2}-\d{2}-\d{2}$/.test(data.to)||
                !(data.from<=anchor&&anchor<data.to))throw Error('Calendario incompleto');
            entry={...data,saved:Date.now()};entries.push(entry);
          }
          cache.set(code,entries);result[i]=entry;
        }
      }));
      return result;
    }
    return async function find(day,direction,codes,readDay,signal){
      if(!codes.length||![1,-1].includes(direction))return null;
      let anchor=day;const checked=new Set();
      const horizon=shift(day,direction*366*5);
      for(let range=0;range<12;range++){
        signal.throwIfAborted();const indexes=await calendars(codes,anchor,signal);
        const from=indexes.reduce((v,c)=>c.from>v?c.from:v,'2000-01-01');
        const to=indexes.reduce((v,c)=>c.to<v?c.to:v,'2099-12-31');
        const candidates=[...new Set(indexes.flatMap(c=>c.dates))]
          .filter(d=>/^20\d{2}-\d{2}-\d{2}$/.test(d)&&d>=from&&d<to&&
            (direction===1?d>day&&d<=horizon:d<day&&d>=horizon)&&!checked.has(d))
          .sort((a,b)=>direction*a.localeCompare(b));
        for(const date of candidates){
          signal.throwIfAborted();checked.add(date);
          const data=await readDay(date,signal);
          signal.throwIfAborted();
          if(data.some(d=>d.competitions.some(c=>c.matches.length)))return {date,data};
          if(data.some(d=>!d.complete))throw Error('Día incompleto');
        }
        const boundary=direction===1?to:shift(from,-1);
        if((direction===1?boundary<=anchor||boundary>horizon:boundary>=anchor||boundary<horizon))break;
        anchor=boundary;
      }
      return null;
    };
  }
  if(typeof module==='object'&&module.exports)module.exports={createNavigator};
  else scope.FixtureNavigation={createNavigator};
})(globalThis);
