import {sensorTag} from './sensor-tags.js';
/** Schema 2: editable hourly litre columns; all aggregate meters are derived here. */
export const START = '2026-01-01T00:00:00Z';
export const PERIODS = 8760;
export const HOT_SHARE = {office:.30,restaurant:.45,cafe:.40,retail:.22,supermarket:.20,fitness:.35,clinic:.40,public:.30,services:.30,vacant:.15,common:.15,parking:.10,storage:.10,educational:.30,training:.35};
export const TYPE_COLORS = {office:'#6193ab',restaurant:'#bc8777',cafe:'#bb9a75',retail:'#6cabb1',supermarket:'#86a187',fitness:'#9387ae',clinic:'#83afb8',public:'#8f9bad',services:'#8f9bad',vacant:'#849095',parking:'#858e9b',storage:'#9f967d',educational:'#8f9dcc',training:'#9e8fb7'};
export const modulesOf = building => building.floors.flatMap(f=>f.modules.map(m=>({...m,floor:f.id})));
export const timestamp = i => new Date(Date.parse(START)+i*3600000).toISOString();
export function csv(headers, rows) {
  const cell=v=>/[",\r\n]/.test(String(v))?'"'+String(v).replaceAll('"','""')+'"':String(v);
  return [headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function parseCSV(text) {
  const rows=[];let row=[],value='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {const c=text[i];
    if(c==='"'&&quoted&&text[i+1]==='"'){value+='"';i++;}
    else if(c==='"')quoted=!quoted;
    else if(c===','&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');
  if(value||row.length){row.push(value);rows.push(row);}
  return rows;
}
export function readHourlyCSV(text, ids) {
  const [header,...rows]=parseCSV(text);
  if(!header||header[0]!=='timestamp_utc'||header.length!==ids.length+1||ids.some(id=>!header.slice(1).includes(id))||new Set(header).size!==header.length)
    throw new Error('Expected timestamp_utc followed by these columns: '+ids.join(', '));
  if(rows.length!==PERIODS)throw new Error(`Expected 8,760 hourly rows for 2026; found ${rows.length}.`);
  const positions=ids.map(id=>header.indexOf(id));
  return rows.map((row,i)=>{
    if(row.length!==header.length||Date.parse(row[0])!==Date.parse(timestamp(i)))throw new Error(`Row ${i+2}: expected the consecutive hour ${timestamp(i)}.`);
    return positions.map(j=>{const v=Number(row[j]);if(!row[j].trim()||!Number.isFinite(v)||v<0)throw new Error(`Row ${i+2}, ${header[j]}: enter a non-negative number.`);return v;});
  });
}
export function aggregate(building, source) {
  const modules=modulesOf(building),w=source.water;
  const columns=[...modules.map(m=>({id:m.id,floor:m.floor,use:m.use,areaM2:m.areaM2})),...building.floors.map(f=>({id:f.id+'-COMMON',floor:f.id,use:'common',areaM2:f.commonAreaM2})),{id:'LEAK',use:'leak'},{id:'MAIN',use:'meter'},{id:'OUTLET',use:'meter'},...building.floors.map(f=>({id:'M-'+f.id,use:'meter',floorMeterFor:f.id}))];
  const mid=modules.map(m=>w.moduleIds.indexOf(m.id)),cid=building.floors.map(f=>w.commonIds.indexOf(f.id));
  const rows=Array.from({length:PERIODS},(_,i)=>{
    const demand=[...mid.map(j=>Math.round(w.coldRows[i][j]*100)+Math.round(w.hotRows[i][j]*100)),...cid.map(j=>Math.round(w.commonColdRows[i][j]*100)+Math.round(w.commonHotRows[i][j]*100))];
    const outlet=demand.reduce((a,b)=>a+b,0),leak=Math.round(w.leakLitres[i]*100);
    return [...demand,leak,outlet+leak,outlet,...building.floors.map(f=>columns.slice(0,demand.length).reduce((s,c,j)=>s+(c.floor===f.id?demand[j]:0),0))];
  });
  return {start:START,periods:PERIODS,periodMinutes:60,label:source.label,events:source.events,columns,rows};
}
export function waterSplit(building, source, i, selection={}) {
  const w=source.water,modules=modulesOf(building);let cold=0,hot=0;
  modules.forEach(m=>{if(selection.module?m.id!==selection.module:selection.floor&&m.floor!==selection.floor)return;const j=w.moduleIds.indexOf(m.id);cold+=w.coldRows[i][j];hot+=w.hotRows[i][j];});
  if(!selection.module)building.floors.forEach(f=>{if(selection.floor&&f.id!==selection.floor)return;const j=w.commonIds.indexOf(f.id);cold+=w.commonColdRows[i][j];hot+=w.commonHotRows[i][j];});
  return {cold,hot,total:cold+hot};
}
export function sensorRegistry(building) {
  const registry=[];
  const add=(id,kind,network,unit,extra={})=>registry.push({id:sensorTag(id),kind,network,unit,simulated:true,...extra});
  modulesOf(building).forEach(m=>add('M-'+m.id,'flow','total','L/min',{module:m.id,floor:m.floor}));
  building.floors.forEach(f=>{add('S-'+f.id,'flow','cold','L/min',{floor:f.id});add('S-HW-'+f.id,'flow','hot','L/min',{floor:f.id});});
  ['S-CWF-INLET','S-CWF-RISER','S-HWF-MAIN','S-WWF-TANK-IN','S-CWF-MAIN-IN','S-CWF-MAIN-OUT','S-CWF-BRANCH'].forEach(id=>add(id,'flow',id.includes('HW')?'hot':id.includes('SW')?'sewage':'cold','L/min'));
  ['S-EE-CW-PUMP','S-EE-HW-PUMP','S-TE-HW-HEATER'].forEach(id=>add(id,'energy',id.endsWith('HW')?'hot':'cold','kWh/hour'));
  ['S-CWT-INLET','S-HWT-SUPPLY','S-WWT-OUTLET'].forEach((id,j)=>add(id,'temperature',['cold','hot','sewage'][j],'°C'));
  ['S-CWP-PUMP','S-HWP-PUMP'].forEach((id,j)=>add(id,'pressure',j?'hot':'cold','bar'));
  ['S-PWR-CW-PUMP','S-PWR-HW-PUMP'].forEach((id,j)=>add(id,'pump',j?'hot':'cold','kW'));
  // Rainwater is a reserved channel: explicitly null until a student model is connected.
  add('S-RWF-ROOF','flow','rainwater','L/min',{available:false});
  add('S-WWL-TANK','level','sewage','%',{capacityLitres:2000,initialVolumeLitres:800,residenceHours:1.5});
  add('S-WWF-TANK-OUT','flow','sewage','L/min');
  return registry;
}
export function pumpEnergy(flowM3H,headM=30) {
  if(flowM3H<=0)return 0;
  const shape=Math.max(0,1-.55*((flowM3H-3.5)/4.5)**2);
  const efficiency=.65*(.94+.06*Math.min(1,shape));
  return flowM3H*1000*9.81*headM/3600/efficiency/1000;
}
/** Generate educational sensor channels from shared water columns, never independent meter randomness. */
export function generateSensors(building, source) {
  const columns=sensorRegistry(building),data=aggregate(building,source),main=data.columns.findIndex(c=>c.id==='MAIN');
  const mids=Object.fromEntries(source.water.moduleIds.map((id,j)=>[id,j]));
  const floorModules=Object.fromEntries(building.floors.map(f=>[f.id,f.modules.map(m=>mids[m.id])]));
  const floorCommon=Object.fromEntries(source.water.commonIds.map((id,j)=>[id,j]));
  const w=source.water;
  let tankVolume=800;
  const rows=Array.from({length:PERIODS},(_,i)=>{
    const cold=w.coldRows[i].reduce((a,b)=>a+b,0)+w.commonColdRows[i].reduce((a,b)=>a+b,0);
    const hot=w.hotRows[i].reduce((a,b)=>a+b,0)+w.commonHotRows[i].reduce((a,b)=>a+b,0);
    // Hour-end level follows a capped, well-mixed linear reservoir (1.5 h residence).
    const available=tankVolume+cold+hot,tankOutlet=Math.max(available*(1-Math.exp(-1/1.5)),available-2000);
    tankVolume=available-tankOutlet;
    const inlet=data.rows[i][main]/100,tc=10+4*Math.sin(2*Math.PI*(i/24-80)/365),th=60;
    const sewage=cold+hot?Math.max(tc,(cold*tc+hot*th)/(cold+hot)-6):tc;
    const ec=pumpEnergy(inlet/1000),eh=pumpEnergy(hot/1000,12),heat=hot*4.186*(th-tc)/3600;
    const offset=source.events.find(e=>e.type==='sensor'&&Date.parse(e.start)<=Date.parse(timestamp(i))&&Date.parse(timestamp(i))<Date.parse(e.end))?.sensorOffsetLMin||0;
    return columns.map(c=>{
      let v;
      if(c.available===false)return null;
      if(c.module){const j=mids[c.module];v=(w.coldRows[i][j]+w.hotRows[i][j])/60;}
      else if(c.floor){const j=floorCommon[c.floor],rs=c.network==='hot'?w.hotRows[i]:w.coldRows[i],cr=c.network==='hot'?w.commonHotRows[i]:w.commonColdRows[i];v=(floorModules[c.floor].reduce((s,k)=>s+rs[k],0)+cr[j])/60;}
      else v=({'S-CWF-INLET':inlet/60,'S-CWF-RISER':cold/60,'S-HWF-MAIN':hot/60,'S-WWF-TANK-IN':(cold+hot)/60,'S-CWF-MAIN-IN':inlet/60,'S-CWF-MAIN-OUT':(cold+hot)/60-offset,'S-CWF-BRANCH':0,'S-EE-CW-PUMP':ec,'S-EE-HW-PUMP':eh,'S-TE-HW-HEATER':heat,'S-CWT-INLET':tc,'S-HWT-SUPPLY':th,'S-WWT-OUTLET':sewage,'S-CWP-PUMP':2.943,'S-HWP-PUMP':1.1772,'S-PWR-CW-PUMP':ec,'S-PWR-HW-PUMP':eh,'S-WWL-TANK':tankVolume/2000*100,'S-WWF-TANK-OUT':tankOutlet/60})[c.id];
      return Number(v.toFixed(9));
    });
  });
  return {columns,rows};
}
export function validateSource(building, source) {
  if(source?.schemaVersion!==2||source.start!==START||source.periods!==PERIODS)throw new Error('Expected schema 2 with 8,760 hourly periods in 2026.');
  const w=source.water,modules=modulesOf(building),floors=building.floors;
  if(!w||w.moduleIds.length!==modules.length||new Set(w.moduleIds).size!==modules.length||modules.some(m=>!w.moduleIds.includes(m.id))||w.commonIds.length!==floors.length||new Set(w.commonIds).size!==floors.length||floors.some(f=>!w.commonIds.includes(f.id)))throw new Error('Water columns do not match this building.');
  for(const [name,count] of [['coldRows',modules.length],['hotRows',modules.length],['commonColdRows',floors.length],['commonHotRows',floors.length]]){
    const rows=w[name];if(!Array.isArray(rows)||rows.length!==PERIODS)throw new Error(name+': expected 8,760 rows.');
    rows.forEach((row,i)=>{if(row.length!==count||row.some(v=>!Number.isFinite(v)||v<0))throw new Error(`${name}: invalid values at hour ${i}.`);});
  }
  if(w.leakLitres?.length!==PERIODS||w.leakLitres.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid documented leakage volumes.');
  if(!Array.isArray(source.events))throw new Error('Missing event register.');
  const expected=sensorRegistry(building),s=source.sensors;
  if(!s||s.rows?.length!==PERIODS||s.columns?.length!==expected.length||expected.some(c=>!s.columns.find(k=>k.id===c.id&&k.unit===c.unit)))throw new Error('Sensor registry does not match the building.');
  if(new Set(s.columns.map(c=>c.id)).size!==expected.length)throw new Error('Duplicate sensor columns.');
  s.rows.forEach((row,i)=>{if(row.length!==s.columns.length||row.some((v,j)=>s.columns[j].available===false?v!==null:!Number.isFinite(v)))throw new Error('Invalid sensor row '+i);});
  return source;
}

/** Upgrade saved local scenarios without changing their water columns or building edits. */
export function upgradeSensorData(building,source){
  const expected=sensorRegistry(building);
  if(source?.schemaVersion!==2)return source;
  if(source.sensors?.columns?.length===expected.length&&expected.every(c=>source.sensors.columns.some(k=>k.id===c.id)))return source;
  return {...source,sensors:generateSensors(building,source)};
}
