import {parseCSV,START,PERIODS,timestamp} from './data-model.js';
/** STUDENT EXTENSION: RAINWATER MODEL. Offline hourly storage balance, independent of water baseline. */
export function parseRainWeatherCSV(text){
  const [header,...rows]=parseCSV(text),keys=['timestamp_utc','precipitation_mm','temperature_c'];
  if(!header||header.length!==3||new Set(header).size!==3||keys.some(k=>!header.includes(k)))throw new Error('Use timestamp_utc, precipitation_mm and temperature_c columns.');
  if(rows.length!==PERIODS)throw new Error('Weather data must contain all 8,760 hourly periods of 2026.');
  const pos=keys.map(k=>header.indexOf(k));
  return rows.map((row,i)=>{if(row.length!==3||Date.parse(row[pos[0]])!==Date.parse(timestamp(i)))throw new Error(`Weather row ${i+2}: expected consecutive hour ${timestamp(i)}.`);const rain=Number(row[pos[1]]),temperature=Number(row[pos[2]]);if(!row[pos[1]].trim()||!row[pos[2]].trim()||!Number.isFinite(rain)||rain<0||!Number.isFinite(temperature)||temperature< -60||temperature>70)throw new Error(`Weather row ${i+2}: invalid rain or temperature.`);return[rain,temperature];});
}
export function createRainwaterDesign(catalog,roofAreas={main:2012.5,lower:787.5}){
  return{schemaVersion:1,collectors:[{id:'main-roof',name:'Main roof',areaM2:roofAreas.main,runoffCoefficient:.8,enabled:true},{id:'lower-roof',name:'Lower roof',areaM2:roofAreas.lower,runoffCoefficient:.75,enabled:true}],storageCapacityM3:catalog.storageCapacityM3,pumpCapacityLMin:catalog.pumpCapacityLMin,collectionEfficiency:catalog.collectionEfficiency,consumers:catalog.consumers.map(p=>({id:p.id,enabled:false,dailyDemandL:p.dailyDemandL})),weather:{kind:'default',name:'Ålesund IV / Nørve · 2025 history replayed on 2026'}};
}
export function validateRainwaterDesign(design,catalog){
  const errors=[],valid=(v,min,max=Infinity)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(design?.schemaVersion!==1)return['Unsupported rainwater design version.'];
  if(!valid(design.storageCapacityM3,.1)||!valid(design.pumpCapacityLMin,0)||!valid(design.collectionEfficiency,0,1))errors.push('Check tank capacity, pump capacity and collection efficiency.');
  if(!Array.isArray(design.collectors)||!design.collectors.length||design.collectors.some(c=>!c||typeof c.id!=='string'||typeof c.enabled!=='boolean'||!valid(c.areaM2,0)||!valid(c.runoffCoefficient,0,1)))return[...errors,'Check the collector areas and runoff coefficients.'];
  if(new Set(design.collectors.map(c=>c.id)).size!==design.collectors.length)errors.push('Collector IDs must be unique.');
  if(!design.collectors.some(c=>c.enabled&&c.areaM2>0))errors.push('Select at least one roof collector with a positive area.');
  if(!Array.isArray(design.consumers)||design.consumers.length!==catalog.consumers.length||design.consumers.some(c=>!c||typeof c.id!=='string')||new Set(design.consumers.map(c=>c.id)).size!==catalog.consumers.length||catalog.consumers.some(p=>!design.consumers.some(c=>c.id===p.id))||design.consumers.some(c=>typeof c.enabled!=='boolean'||!valid(c.dailyDemandL,0)))return[...errors,'Check each consumer and its daily water demand.'];
  if(!design.consumers.some(c=>c.enabled&&c.dailyDemandL>0))errors.push('Choose at least one consumer with a positive demand.');
  if(!design.weather||!['default','imported'].includes(design.weather.kind))errors.push('Choose the supplied or an imported weather dataset.');
  if(design.weather?.kind==='imported'&&(!Array.isArray(design.weather.rows)||design.weather.rows.length!==PERIODS||design.weather.rows.some(r=>!Array.isArray(r)||r.length!==2||!valid(r[0],0)||!valid(r[1],-60,70))))errors.push('Imported weather must contain 8,760 valid hourly readings.');
  return errors;
}
export function simulateRainwater(design,catalog,defaultWeather){
  const weather=design.weather.kind==='imported'?design.weather.rows:defaultWeather;
  const safe=v=>Number.isFinite(v)?Math.max(0,v):0,capacity=safe(design.storageCapacityM3),pump=safe(design.pumpCapacityLMin)*60/1000;
  const area=design.collectors.filter(c=>c.enabled).reduce((sum,c)=>sum+safe(c.areaM2)*Math.min(1,safe(c.runoffCoefficient)),0)*Math.min(1,safe(design.collectionEfficiency));
  const consumers=design.consumers.filter(c=>c.enabled).map(c=>({...c,profile:catalog.consumers.find(p=>p.id===c.id),suppliedM3:0,demandM3:0,hours:[]}));
  const profiles=consumers.map(c=>{const weights=Array(24).fill(0);c.profile.hours.forEach((h,j)=>weights[h]=c.profile.weights[j]);return weights;});
  const monthly=Array.from({length:12},()=>({rainMM:0,temperatureSum:0,hours:0}));let stored=0,collectedM3=0,suppliedM3=0,overflowM3=0,demandM3=0,annualRainMM=0,peakRainMMH=0;
  const hours=weather.map((row,i)=>{const d=new Date(Date.parse(START)+i*3600000),month=d.getUTCMonth(),weekday=(d.getUTCDay()+6)%7,h=d.getUTCHours(),rain=row[0],inflow=rain*area/1000,previous=stored;annualRainMM+=rain;peakRainMMH=Math.max(peakRainMMH,rain);monthly[month].rainMM+=rain;monthly[month].temperatureSum+=row[1];monthly[month].hours++;
    const overflow=Math.max(0,stored+inflow-capacity);stored=Math.min(capacity,stored+inflow);
    const demands=consumers.map((c,j)=>safe(c.dailyDemandL)/1000*profiles[j][h]*c.profile.weekdayFactors[weekday]*c.profile.monthFactors[month]),demand=demands.reduce((a,b)=>a+b,0),supply=Math.min(stored,demand,pump);stored-=supply;
    consumers.forEach((c,j)=>{const allocated=demand?supply*demands[j]/demand:0;c.demandM3+=demands[j];c.suppliedM3+=allocated;c.hours.push({demandM3:demands[j],suppliedM3:allocated});});collectedM3+=inflow;suppliedM3+=supply;overflowM3+=overflow;demandM3+=demand;
    return{previousM3:previous,inflowM3:inflow,overflowM3:overflow,suppliedM3:supply,demandM3:demand,storedM3:stored};
  });
  return{annualRainMM,peakRainMMH,collectedM3,suppliedM3,overflowM3,demandM3,mainsM3:demandM3-suppliedM3,storedM3:stored,coveragePercent:demandM3?suppliedM3/demandM3*100:0,catchmentM2:design.collectors.filter(c=>c.enabled).reduce((n,c)=>n+safe(c.areaM2),0),monthly:monthly.map(m=>({...m,meanTemperatureC:m.temperatureSum/m.hours})),consumers:consumers.map(c=>({id:c.id,demandM3:c.demandM3,suppliedM3:c.suppliedM3,coveragePercent:c.demandM3?c.suppliedM3/c.demandM3*100:0,hours:c.hours})),hours};
}
export function prepareRainwaterDesign(design,catalog){const errors=validateRainwaterDesign(design,catalog);if(errors.length)throw new Error(errors[0]);return{...structuredClone(design),updatedAt:new Date().toISOString()};}
