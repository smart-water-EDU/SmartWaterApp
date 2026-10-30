import {SENSOR_TYPES} from '../src/sensor-tags.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {START,PERIODS,HOT_SHARE,modulesOf,csv,readHourlyCSV,timestamp,generateSensors,validateSource} from '../src/data-model.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'data');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const json=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
const write=(name,headers,rows)=>fs.writeFileSync(path.join(dir,name),csv(headers,rows));
export function extendProfiles(profiles) {
  for(const [id,label,base,specific] of [['parking','Parking','vacant',.15],['storage','Storage','vacant',.1],['educational','Educational','office',2.4],['training','Training','office',2.8]])
    if(!profiles.profiles.some(p=>p.id===id))profiles.profiles.push({...structuredClone(profiles.profiles.find(p=>p.id===base)),id,label,specificConsumption:specific,notes:'Editable educational assumption for scenario studies; not a measured benchmark.'});
  profiles.profiles.forEach(p=>p.hotWaterShare??=HOT_SHARE[p.id]??.3);
  return profiles;
}
export function writeSource(building,source) {
  const w=source.water;
  write('module_cold_water_2026.csv',['timestamp_utc',...w.moduleIds],w.coldRows.map((r,i)=>[timestamp(i),...r]));
  write('module_hot_water_2026.csv',['timestamp_utc',...w.moduleIds],w.hotRows.map((r,i)=>[timestamp(i),...r]));
  const commonHeaders=w.commonIds.flatMap(id=>[id+'_cold_L',id+'_hot_L']);
  write('common_water_2026.csv',['timestamp_utc',...commonHeaders,'main_leak_L'],w.commonColdRows.map((r,i)=>[timestamp(i),...r.flatMap((v,j)=>[v,w.commonHotRows[i][j]]),w.leakLitres[i]]));
  json('leak_events.json',source.events);
  writeSensors(source);
  json('data_manifest.json',{schemaVersion:2,label:source.label,seed:20260101,start:START,periods:PERIODS,periodMinutes:60,waterUnit:'L per hourly period',timeConvention:'UTC timestamps used as a fixed nominal building clock. No DST.',files:{cold:'module_cold_water_2026.csv',hot:'module_hot_water_2026.csv',common:'common_water_2026.csv',sensors:'sensor_readings_2026.csv',registry:'sensors.json',events:'leak_events.json'},sensorPolicy:'Derived educational channels. After editing water CSVs, npm run data:build regenerates sensor data and the browser bundle. Rainwater is unavailable (blank), not measured zero.'});
}
function writeSensors(source) {
  json('sensors.json',{schemaVersion:2,label:'Synthetic sensors — hourly 2026',tagConvention:'S-[type]-[position]',types:SENSOR_TYPES,columns:source.sensors.columns});
  write('sensor_readings_2026.csv',['timestamp_utc',...source.sensors.columns.map(c=>c.id)],source.sensors.rows.map((r,i)=>[timestamp(i),...r.map(v=>v??'')]));
}
export function loadSource(building) {
  const manifest=read('data_manifest.json'),moduleIds=modulesOf(building).map(m=>m.id),commonIds=building.floors.map(f=>f.id);
  const text=name=>fs.readFileSync(path.join(dir,name),'utf8');
  const coldRows=readHourlyCSV(text(manifest.files.cold),moduleIds),hotRows=readHourlyCSV(text(manifest.files.hot),moduleIds);
  const common=readHourlyCSV(text(manifest.files.common),[...commonIds.flatMap(id=>[id+'_cold_L',id+'_hot_L']),'main_leak_L']);
  return {...manifest,water:{moduleIds,commonIds,coldRows,hotRows,commonColdRows:common.map(r=>commonIds.map((_,j)=>r[j*2])),commonHotRows:common.map(r=>commonIds.map((_,j)=>r[j*2+1])),leakLitres:common.map(r=>r.at(-1))},events:read(manifest.files.events)};
}
export function build() {
  const building=read('building.json'),profiles=extendProfiles(read('retrofit_consumption_profiles.json'));
  json('retrofit_consumption_profiles.json',profiles);
  const source=loadSource(building);source.sensors=generateSensors(building,source);validateSource(building,source);writeSensors(source);
  const publicDir=path.join(root,'public','data');fs.mkdirSync(publicDir,{recursive:true});
  fs.writeFileSync(path.join(publicDir,'datasets-schema2.js'),'/* Generated from editable schema-2 water CSVs and sensor registry. */\nwindow.SMART_DROPS_DATA = '+JSON.stringify({building,profiles,monitoring:source})+';\n');
  write('building_floors.csv',['floor_id','gross_area_m2','common_area_m2','tenant_area_m2','module_count','color','section_x','section_y','section_width','section_height'],building.floors.map(f=>[f.id,f.grossAreaM2,f.commonAreaM2,f.grossAreaM2-f.commonAreaM2,f.modules.length,f.color,f.geometry.x,f.geometry.y,f.geometry.width,f.geometry.height]));
  write('building_modules.csv',['module_id','floor_id','area_m2','tenant_use','section_x','section_y','section_width','section_height'],modulesOf(building).map(m=>[m.id,m.floor,m.areaM2,m.use,m.geometry.x,m.geometry.y,m.geometry.width,m.geometry.height]));
  write('consumption_profiles.csv',['profile_id','label','specific_consumption_L_m2_day','opening_hour','closing_hour','hot_water_share',...'Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split(' ').map(day=>'adjustment_'+day.toLowerCase()),'peak_factor','assumptions','notes',...Array.from({length:24},(_,i)=>'hour_'+i)],profiles.profiles.map(p=>[p.id,p.label,p.specificConsumption,...p.openingHours,p.hotWaterShare,...p.weekdayAdjustment,p.peakFactor,p.assumptions,p.notes,...p.hourlyWeights]));
  write('leak_events.csv',['event_id','name','start_utc','end_utc','leak_L_min','sensor_offset_L_min','type'],source.events.map(e=>[e.id,e.name,e.start,e.end,e.leakLMin,e.sensorOffsetLMin||0,e.type]));
  console.log('Built schema 2: 35 hot/cold module columns, '+source.sensors.columns.length+' sensor channels × 8,760 hours.');
}
export function generate() {
  const building=read('building.json'),profiles=extendProfiles(read('retrofit_consumption_profiles.json')),pmap=Object.fromEntries(profiles.profiles.map(p=>[p.id,p]));
  let seed=20260101;
  const random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
  const modules=modulesOf(building),channels=[...modules,...building.floors.map(f=>({id:f.id+'-COMMON',use:'common',areaM2:f.commonAreaM2}))];
  const events=read('leak_events.json'),source={schemaVersion:2,label:'Simulated 2026 Water Monitoring Data — Educational Dataset',start:START,periods:PERIODS,periodMinutes:60,events,water:{moduleIds:modules.map(m=>m.id),commonIds:building.floors.map(f=>f.id),coldRows:[],hotRows:[],commonColdRows:[],commonHotRows:[],leakLitres:[]}};
  for(let i=0;i<PERIODS;i++) {
    const d=new Date(timestamp(i)),day=(d.getUTCDay()+6)%7,h=d.getUTCHours(),seasonal=1+.075*Math.cos(2*Math.PI*(d.getUTCMonth()-6)/12),variation=.94+.12*random();
    const rows=channels.map(c=>{const p=pmap[c.use],cl=Math.round(c.areaM2*p.specificConsumption*p.weekdayAdjustment[day]*p.hourlyWeights[h]*seasonal*variation*(.90+.20*random())*100),hot=Math.round(cl*(p.hotWaterShare??.3));return [(cl-hot)/100,hot/100];});
    const w=source.water;w.coldRows.push(rows.slice(0,modules.length).map(r=>r[0]));w.hotRows.push(rows.slice(0,modules.length).map(r=>r[1]));w.commonColdRows.push(rows.slice(modules.length).map(r=>r[0]));w.commonHotRows.push(rows.slice(modules.length).map(r=>r[1]));
    const event=events.find(e=>Date.parse(e.start)<=+d&&+d<Date.parse(e.end));w.leakLitres.push(Math.round((event?.leakLMin||0)*6000)/100);
  }
  source.sensors=generateSensors(building,source);writeSource(building,source);console.log('Regenerated reproducible 2026 water CSVs with seed 20260101.');
}
