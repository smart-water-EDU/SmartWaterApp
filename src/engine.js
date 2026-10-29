import {sensorTag,tagBuildingSensors} from './sensor-tags.js';
import {aggregate,waterSplit,validateSource} from './data-model.js';
/* Web edition: same documented model logic, exposed through a small browser namespace. */
window.SmartDrops = window.SmartDrops || {};
(() => {
/** CSV source is L/hour; the transient aggregate view uses integer cL for exact meter reconciliation. */
function createEngine(building, profiles, source) {
  building=tagBuildingSensors(building);
  validateSource(building,source);
  const dataset=aggregate(building,source);
  const sensorIndex=Object.fromEntries(source.sensors.columns.map((c,j)=>[c.id,j]));
  const sensorValue=(id,i)=>source.sensors.rows[Math.max(0,Math.min(8759,Math.trunc(i)))][sensorIndex[sensorTag(id)]]??null;
  const split=(i,selection)=>waterSplit(building,source,Math.max(0,Math.min(8759,Math.trunc(i))),selection);
  const profileMap = Object.fromEntries(profiles.profiles.map(p => [p.id, p]));
  const modules = building.floors.flatMap(f => f.modules.map(m => ({ ...m, floor: f.id })));
  const columnIndex = Object.fromEntries(dataset.columns.map((c,i) => [c.id,i]));
  const start = Date.parse(dataset.start);
  const clamp = i => Math.max(0, Math.min(dataset.rows.length-1, Math.trunc(i)||0));
  const date = i => new Date(start + clamp(i)*3600000);
  const indexAt = value => {
    const timestamp=value.endsWith('Z')?value:(value.length===16?value+':00Z':value+'Z');
    return clamp(Math.floor((Date.parse(timestamp)-start)/3600000));
  };
  const indices = selection => selection?.module ? [columnIndex[selection.module]] : selection?.floor
    ? dataset.columns.flatMap((c,i) => c.floor === selection.floor ? [i] : []) : [columnIndex.MAIN];
  const volumeCL = (i, selection) => indices(selection).reduce((sum,j)=>sum+dataset.rows[clamp(i)][j],0);
  function sumCL(from,to,selection) {
    const cols=indices(selection); let sum=0;
    for(let i=Math.max(0,from);i<Math.min(to,dataset.periods);i++) for(const j of cols) sum+=dataset.rows[i][j];
    return sum;
  }
  function bounds(i) {
    const d=date(i), y=d.getUTCFullYear(), m=d.getUTCMonth();
    return {day:Math.floor(clamp(i)/24)*24,month:(Date.UTC(y,m,1)-start)/3600000,monthEnd:(Date.UTC(y,m+1,1)-start)/3600000};
  }
  function metrics(i,selection) {
    const b=bounds(i);
    return {flow:volumeCL(i,selection)/6000,today:sumCL(b.day,i+1,selection)/100000,
      month:sumCL(b.month,i+1,selection)/100000,year:sumCL(0,i+1,selection)/100000};
  }
  function series(i,scale,selection) {
    const b=bounds(i);
    let intervals=[];
    if(scale==='hourly') intervals=Array.from({length:24},(_,h)=>[b.day+h,b.day+h+1,String(h).padStart(2,'0')+':00']);
    if(scale==='daily') intervals=Array.from({length:(b.monthEnd-b.month)/24},(_,d)=>[b.month+d*24,b.month+(d+1)*24,String(d+1)]);
    if(scale==='monthly') intervals=Array.from({length:12},(_,m)=>[(Date.UTC(2026,m,1)-start)/3600000,(Date.UTC(2026,m+1,1)-start)/3600000,new Date(Date.UTC(2026,m,1)).toLocaleString('en-GB',{month:'short',timeZone:'UTC'})]);
    if(scale==='yearly') intervals=[[0,8760,'2026']];
    return intervals.map(([a,b,label])=>({label,value:sumCL(a,b,selection)/100000,index:a}));
  }
  function distribution(i,kind,selection=null) {
    const {day}=bounds(i);
    if(kind==='floor') return building.floors.map(f=>({id:f.id,label:f.id,color:f.color,value:sumCL(day,day+24,{floor:f.id})/100000}));
    return profiles.profiles.map(p=>({id:p.id,label:p.label,value:dataset.columns.reduce((sum,c,j)=>{
      if(c.use!==p.id || (selection?.module && c.id!==selection.module) || (selection?.floor && c.floor!==selection.floor)) return sum;
      for(let h=day;h<day+24;h++) sum+=dataset.rows[h][j];
      return sum;
    },0)/100000})).filter(d=>d.value>0);
  }
  function moduleStats(id,i) {
    const module=modules.find(m=>m.id===id); if(!module) return null;
    const baseProfile=profileMap[module.use];
    const p=module.scenarioSettings?{...baseProfile,openingHours:[module.scenarioSettings.openingHour,module.scenarioSettings.closingHour]}:baseProfile, {day}=bounds(i);
    const hours=Array.from({length:24},(_,h)=>volumeCL(day+h,{module:id})/6000);
    return {...module,profile:p,dailyM3:sumCL(day,day+24,{module:id})/100000,peakLMin:Math.max(...hours)*p.peakFactor};
  }
  return {building,source,sensorValue,waterSplit:split,profiles:profileMap,dataset,modules,columnIndex,clamp,date,indexAt,volumeCL,sumCL,bounds,metrics,series,distribution,moduleStats};
}

window.SmartDrops.engine = { createEngine };
})();
