/** STUDENT EXTENSION: HEAT RECOVERY MODEL. Pure design functions; baseline monitoring is immutable. */
export const DESIGN_VERSION=1;
const clone=value=>structuredClone(value);
const bounded=value=>Math.max(0,Math.min(1,value));
export function createHeatDesign(catalog,source={}) {
  const preset=catalog.exchangers[0];
  return {schemaVersion:DESIGN_VERSION,exchanger:{type:preset.id,placed:false,position:{x:.04,y:.42},effectivenessPercent:preset.effectivenessPercent,capacityKW:preset.capacityKW,pressureDropKPa:preset.pressureDropKPa,minApproachC:preset.minApproachC},source:{flowLMin:source.flowLMin??30,inletTemperatureC:source.inletTemperatureC??20,outletTemperatureC:source.outletTemperatureC??10},consumers:[],notes:''};
}
/** Largest-remainder allocation in 0.1% units. Rounding never makes the total drift from its target. */
export function distributeShares(weights,total=100) {
  if(!weights.length)return [];
  const units=Math.max(0,Math.round(total*10)),safe=weights.map(v=>Number.isFinite(v)?Math.max(0,v):0),sum=safe.reduce((a,b)=>a+b,0);
  const raw=safe.map(v=>units*(sum?v/sum:1/safe.length)),base=raw.map(Math.floor);
  let left=units-base.reduce((a,b)=>a+b,0);
  const order=raw.map((v,i)=>({i,remainder:v-base[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let k=0;k<left;k++)base[order[k%order.length].i]++;
  return base.map(v=>v/10);
}
export function balanceHeatShares(design){const shares=distributeShares(design.consumers.map(c=>c.sharePercent));design.consumers.forEach((c,i)=>c.sharePercent=shares[i]);return design;}
export function setPurposeShare(design,purpose,percentage){
  const group=design.consumers.filter(c=>c.purpose===purpose),shares=distributeShares(group.map(c=>c.sharePercent),percentage);
  group.forEach((c,i)=>c.sharePercent=shares[i]);return design;
}
export function addHeatConsumer(design,catalog,purpose,position) {
  const preset=catalog.purposes.find(p=>p.id===purpose);if(!preset)throw new Error('Choose a heat use.');
  const next=Math.max(0,...design.consumers.map(c=>Number(c.id.split('-').at(-1))||0))+1;
  const count=design.consumers.filter(c=>c.purpose===purpose).length+1,oldTotal=design.consumers.reduce((s,c)=>s+c.sharePercent,0),weight=design.consumers.length?(oldTotal||100)/design.consumers.length:100;
  const consumer={id:'consumer-'+next,purpose,name:preset.defaultName+' '+count,sharePercent:weight,position:position||{x:.73,y:Math.min(.88,.07+design.consumers.length*.22)},specs:{targetTemperatureC:preset.targetTemperatureC,[preset.extraKey]:preset.extraDefault}};
  design.consumers.push(consumer);balanceHeatShares(design);return consumer;
}
export function removeHeatConsumer(design,id){design.consumers=design.consumers.filter(c=>c.id!==id);balanceHeatShares(design);return design;}
export function chooseHeatExchanger(design,catalog,type){const p=catalog.exchangers.find(p=>p.id===type);if(!p)throw new Error('Unknown exchanger type.');Object.assign(design.exchanger,{type:p.id,effectivenessPercent:p.effectivenessPercent,capacityKW:p.capacityKW,pressureDropKPa:p.pressureDropKPa,minApproachC:p.minApproachC});return design;}
export function autoLayoutHeatDesign(design){
  design.exchanger.position={x:.03,y:.42};
  const columns=design.consumers.length>4?2:1,rows=Math.ceil(design.consumers.length/columns);
  design.consumers.forEach((c,i)=>{const column=Math.floor(i/rows),row=i%rows;c.position={x:columns===1?.76:column===0?.43:.86,y:rows===1?.42:.04+.88*row/(rows-1)};});return design;
}
export function moveHeatNode(design,id,position){const item=id==='exchanger'?design.exchanger:design.consumers.find(c=>c.id===id);if(item)item.position={x:bounded(position.x),y:bounded(position.y)};return design;}
export function heatDesignPreview(design){
  const s=design.source,e=design.exchanger;
  const potentialKW=Math.max(0,s.flowLMin)/60*4.186*Math.max(0,s.inletTemperatureC-s.outletTemperatureC);
  const recoveredKW=Math.min(Math.max(0,e.capacityKW),potentialKW*Math.max(0,Math.min(100,e.effectivenessPercent))/100);
  return {potentialKW,recoveredKW,totalPercent:design.consumers.reduce((n,c)=>n+c.sharePercent,0),availableSupplyC:s.inletTemperatureC-e.minApproachC,allocations:design.consumers.map(c=>({id:c.id,powerKW:recoveredKW*c.sharePercent/100}))};
}
export function validateHeatDesign(design,catalog){
  const errors=[];
  if(design?.schemaVersion!==DESIGN_VERSION)return ['Unsupported heat-recovery design version.'];
  const e=design.exchanger,s=design.source,finite=(v,min,max=Infinity)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!e||!catalog.exchangers.some(p=>p.id===e.type))return ['Select an exchanger type.'];
  if(!e.placed)errors.push('Add the selected exchanger to the design.');
  if(!finite(e.effectivenessPercent,0,100)||!finite(e.capacityKW,.01)||!finite(e.pressureDropKPa,0)||!finite(e.minApproachC,0,50))errors.push('Check exchanger effectiveness, capacity, pressure drop and approach temperature.');
  if(!s||!finite(s.flowLMin,0)||!finite(s.inletTemperatureC,-10,100)||!finite(s.outletTemperatureC,-10,100)||s.outletTemperatureC>s.inletTemperatureC)errors.push('Check source flow and temperatures; outlet must not exceed inlet.');
  if(!Array.isArray(design.consumers)||!design.consumers.length)return [...errors,'Choose at least one heat use.'];
  const ids=new Set();
  const positionValid=p=>p&&finite(p.x,0,1)&&finite(p.y,0,1);
  if(!positionValid(e.position))errors.push('Place the exchanger within the design area.');
  for(const c of design.consumers){
    const p=catalog.purposes.find(p=>p.id===c.purpose);
    if(!p||typeof c.id!=='string'||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||!finite(c.sharePercent,0,100)||!positionValid(c.position)||!c.specs||!finite(c.specs.targetTemperatureC,-10,100)||!finite(c.specs[p.extraKey],0))errors.push('Check each consumer’s name, allocation, position and specifications.');
    ids.add(c.id);
  }
  if(Math.abs(design.consumers.reduce((n,c)=>n+c.sharePercent,0)-100)>.001)errors.push('Heat allocations must total 100%. Use Balance to distribute the heat.');
  return [...new Set(errors)];
}
export function prepareHeatDesign(design,catalog){const errors=validateHeatDesign(design,catalog);if(errors.length)throw new Error(errors[0]);return {...clone(design),updatedAt:new Date().toISOString()};}

/** Estimated direct-electric heater input. Only the water-preheating allocation offsets its load.
 * The stored heater channel is useful thermal power, not a measured electricity channel. */
export function heaterElectricityPreview(design,{thermalKW=0,efficiency=.98}={}){
  const load=Number.isFinite(thermalKW)?Math.max(0,thermalKW):0;
  const eta=Number.isFinite(efficiency)&&efficiency>0&&efficiency<=1?efficiency:.98;
  const preview=heatDesignPreview(design),share=Math.max(0,Math.min(100,design.consumers.filter(c=>c.purpose==='water').reduce((n,c)=>n+(Number.isFinite(c.sharePercent)?Math.max(0,c.sharePercent):0),0)))/100;
  const transferred=design.exchanger.placed&&Number.isFinite(preview.recoveredKW)?preview.recoveredKW:0;
  const offsetThermalKW=Math.min(load,transferred*share),baselineKW=load/eta,electricKW=(load-offsetThermalKW)/eta;
  return{baselineKW,electricKW,avoidedKW:baselineKW-electricKW,offsetThermalKW,efficiency:eta,hourEnergyKWh:electricKW};
}

/** STUDENT EXTENSION: YTD HEAT ENERGY. Hourly inputs are kWh, L/min and deg C.
 * 40% is a teaching target, capped by available wastewater heat and exchanger capacity. */
export function heatEnergySummary(design,hours,{efficiency=.98,targetRecoveryShare=.4}={}){
  let heaterEnergyKWh=0,recoveredHeatKWh=0,remainingHeaterEnergyKWh=0,currentElectricKW=0,sewageTemperatureC=0,currentRecoveredKW=0;
  const eta=efficiency>0&&efficiency<=1?efficiency:.98,target=Math.max(0,Math.min(1,targetRecoveryShare)),effect=Math.max(0,Math.min(1,design.exchanger.effectivenessPercent/100)),cap=Math.max(0,design.exchanger.capacityKW);
  const waterShare=Math.max(0,Math.min(1,design.consumers.filter(c=>c.purpose==='water').reduce((n,c)=>n+(Number.isFinite(c.sharePercent)?Math.max(0,c.sharePercent):0),0)/100)),active=design.exchanger.placed&&design.consumers.some(c=>c.sharePercent>0);
  for(const h of hours){
    const useful=Math.max(0,h.heaterThermalKWh),baseline=useful/eta,potential=Math.max(0,h.sewageFlowLMin)/60*4.186*Math.max(0,h.sewageTemperatureC-h.coldTemperatureC);
    const recovered=active?Math.min(baseline*target,potential*effect,cap):0,offset=Math.min(useful,recovered*waterShare),remaining=(useful-offset)/eta;
    heaterEnergyKWh+=baseline;recoveredHeatKWh+=recovered;remainingHeaterEnergyKWh+=remaining;currentElectricKW=remaining;sewageTemperatureC=h.sewageTemperatureC;currentRecoveredKW=recovered;
  }
  return{heaterEnergyKWh,recoveredHeatKWh,remainingHeaterEnergyKWh,currentElectricKW,sewageTemperatureC,currentRecoveredKW,recoveryPercent:heaterEnergyKWh?recoveredHeatKWh/heaterEnergyKWh*100:0,hours:hours.length};
}
