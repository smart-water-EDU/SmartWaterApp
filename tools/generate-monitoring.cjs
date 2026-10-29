const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..','data');
const building = JSON.parse(fs.readFileSync(path.join(root,'building.json')));
const profiles = JSON.parse(fs.readFileSync(path.join(root,'retrofit_consumption_profiles.json'))).profiles;
const profileMap = Object.fromEntries(profiles.map(p=>[p.id,p]));
let seed = 20260101;
function random() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15,1|seed); t ^= t + Math.imul(t ^ t >>> 7,61|t); return ((t ^ t >>> 14) >>> 0)/4294967296; }
const columns = building.floors.flatMap(f=>f.modules.map(m=>({id:m.id,floor:f.id,use:m.use,areaM2:m.areaM2})));
columns.push(...building.floors.map(f=>({id:`${f.id}-COMMON`,floor:f.id,use:'common',areaM2:f.commonAreaM2})));
const events = [
 {id:'E01',name:'Small sustained main-pipe leak',start:'2026-02-12T01:00:00Z',end:'2026-02-12T10:00:00Z',leakLMin:.7,type:'leak',segment:'main'},
 {id:'E02',name:'9 L/min main-pipe leak',start:'2026-06-17T09:00:00Z',end:'2026-06-17T18:00:00Z',leakLMin:9,type:'leak',segment:'main'},
 {id:'E03',name:'Downstream sensor offset — no physical loss',start:'2026-09-08T12:00:00Z',end:'2026-09-08T16:00:00Z',leakLMin:0,sensorOffsetLMin:2.4,type:'sensor',segment:'main'},
 {id:'E04',name:'Autumn main-pipe leak',start:'2026-11-04T02:00:00Z',end:'2026-11-04T08:00:00Z',leakLMin:4,type:'leak',segment:'main'}
];
const start = Date.UTC(2026,0,1);
const rows = Array.from({length:8760},(_,i)=>{
  const d = new Date(start+i*3600000), day=(d.getUTCDay()+6)%7, h=d.getUTCHours();
  const seasonal=1+.075*Math.cos(2*Math.PI*(d.getUTCMonth()-6)/12);
  const dayVariation = .94+.12*random();
  const volumes=columns.map(c=>{
    const p=profileMap[c.use];
    const litres=c.areaM2*p.specificConsumption*p.weekdayAdjustment[day]*p.hourlyWeights[h]*seasonal*dayVariation*(.90+.20*random());
    return Math.round(litres*100); // Integer centilitres avoid meter reconciliation rounding errors.
  });
  const event=events.find(e=>+new Date(e.start)<=+d && +d<+new Date(e.end));
  const lossCL=Math.round((event?.leakLMin||0)*60*100);
  const outletCL=volumes.reduce((a,b)=>a+b,0);
  const floorMeters=building.floors.map(f=>columns.reduce((sum,c,j)=>sum+(c.floor===f.id?volumes[j]:0),0));
  return [...volumes,lossCL,outletCL+lossCL,outletCL,...floorMeters];
});
const result={schemaVersion:1,label:'Simulated 2026 Water Monitoring Data — Educational Dataset',seed:20260101,
  start:'2026-01-01T00:00:00Z',periodMinutes:60,periods:8760,
  timeConvention:'Fixed educational building clock; UTC fields displayed as nominal building time. No DST, exactly 24 periods per day.',
  unit:'centilitres per hourly period (integer); divide by 100 for L, 100000 for m³, 6000 for average L/min',
  columns:[...columns,{id:'LEAK',use:'leak'},{id:'MAIN',use:'meter'},{id:'OUTLET',use:'meter'},...building.floors.map(f=>({id:`M-${f.id}`,use:'meter',floorMeterFor:f.id}))],
  events,assumptions:['Common areas are explicitly metered loads at 20% of every floor.',
    'Main = sum of all modules + all common areas + modeled main-pipe leakage.',
    'OUTLET is downstream of the investigated main segment and equals all legitimate building demand.',
    'Sensor noise is deterministic and does not alter accumulated meter volumes.',
    'Peak flow is an illustrative estimate from peak hourly demand and category factors, not a plumbing design calculation.'],rows};
fs.writeFileSync(path.join(root,'monitoring_2026.json'),JSON.stringify(result));
console.log(`Generated ${rows.length} periods, ${columns.length} demand channels, ${events.length} documented events.`);
