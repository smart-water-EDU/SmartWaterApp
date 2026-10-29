import {HOT_SHARE,PERIODS,modulesOf,readHourlyCSV,aggregate,generateSensors,validateSource} from './data-model.js';
/** Local scenario boundary. Neither this editor nor Apply mutates the supplied baseline. */
export function moduleSettings(module,profiles) {
  const p=profiles[module.use];
  return {use:module.use,areaM2:module.areaM2,occupants:Math.max(1,Math.round(module.areaM2/20)),openingHour:p.openingHours[0],closingHour:p.openingHours[1],occupancyHours:p.openingHours[1]-p.openingHours[0],hotShare:p.hotWaterShare??HOT_SHARE[module.use]??.3,notes:'',...module.scenarioSettings};
}
/** Full-calendar-year inlet volume: tenants + common areas + documented main leakage.
 * The same integer-centilitre aggregation feeds monitoring and editor previews. */
export function annualWaterM3(building,source) {
  const data=aggregate(building,source),main=data.columns.findIndex(c=>c.id==='MAIN');
  return data.rows.reduce((total,row)=>total+row[main],0)/100000;
}
export function importModuleCSV(text) { return readHourlyCSV(text,['cold_L','hot_L']); }
export function validateSettings(settings,profiles) {
  if(!profiles[settings.use]||settings.use==='common')throw new Error('Choose a tenant type.');
  if(!Number.isFinite(settings.areaM2)||settings.areaM2<=0)throw new Error('Module area must be greater than zero.');
  if(!Number.isInteger(settings.openingHour)||!Number.isInteger(settings.closingHour)||settings.openingHour<0||settings.closingHour>24||settings.closingHour<=settings.openingHour)throw new Error('Opening hours must be whole hours between 0 and 24, with closing after opening.');
  if(!Number.isFinite(settings.occupants)||settings.occupants<0||!Number.isFinite(settings.occupancyHours)||settings.occupancyHours<0||settings.occupancyHours>24||!Number.isFinite(settings.hotShare)||settings.hotShare<0||settings.hotShare>1)throw new Error('Check occupants, occupancy duration and hot-water percentage.');
}
export function applyScenario(building,profiles,source,changes) {
  const nextBuilding=structuredClone(building),next=structuredClone(source),pmap=Object.fromEntries(profiles.profiles.map(p=>[p.id,p]));
  const originalModules=modulesOf(building);
  for(const floor of nextBuilding.floors) {
    for(const module of floor.modules) {
      const draft=changes[module.id];if(!draft)continue;
      validateSettings(draft,pmap);module.use=draft.use;module.areaM2=draft.areaM2;module.scenarioSettings={...draft};delete module.scenarioSettings.importedRows;
      if(draft.importedRows)module.scenarioSettings.loadSource=draft.importName||'Imported CSV';
    }
    const active=floor.modules.reduce((s,m)=>s+m.areaM2,0),budget=floor.grossAreaM2-floor.commonAreaM2;
    if(active>budget+.01)throw new Error(`${floor.id}: tenant areas exceed the ${budget.toFixed(1)} m² floor budget by ${(active-budget).toFixed(1)} m². Reduce another module area on this floor first.`);
    floor.unallocatedTenantAreaM2=Math.max(0,budget-active);
  }
  for(const module of modulesOf(nextBuilding)) {
    const draft=changes[module.id];if(!draft)continue;
    const j=next.water.moduleIds.indexOf(module.id),p=pmap[draft.use],old=originalModules.find(m=>m.id===module.id),oldp=pmap[old.use];
    if(draft.importedRows) {
      if(draft.importedRows.length!==PERIODS||draft.importedRows.some(r=>r.length!==2||r.some(v=>!Number.isFinite(v)||v<0)))throw new Error('Imported load must have 8,760 valid hot/cold rows.');
      for(let i=0;i<PERIODS;i++){next.water.coldRows[i][j]=Math.round(draft.importedRows[i][0]*100)/100;next.water.hotRows[i][j]=Math.round(draft.importedRows[i][1]*100)/100;}
      continue;
    }
    const previousSettings=moduleSettings(old,pmap);
    if(['use','areaM2','occupants','openingHour','closingHour','occupancyHours','hotShare'].every(key=>draft[key]===previousSettings[key])&&!previousSettings.loadSource)continue;
    // Schedule shifts preserve the category's within-day shape. 2% of daily load
    // remains background use outside opening hours; zero occupancy means zero load.
    const duration=draft.closingHour-draft.openingHour,raw=Array.from({length:24},(_,h)=>h>=draft.openingHour&&h<draft.closingHour?p.hourlyWeights[Math.min(p.openingHours[1]-1,p.openingHours[0]+Math.floor((h-draft.openingHour)*(p.openingHours[1]-p.openingHours[0])/duration))]:0);
    const sum=raw.reduce((a,b)=>a+b,0),weights=raw.map((v,h)=>v/sum*(duration===24?1:.98)+(duration===24?0:v===0?.02/(24-duration):0));
    for(let day=0;day<365;day++) {
      const date=new Date(Date.parse(source.start)+day*86400000),weekday=(date.getUTCDay()+6)%7;
      const previousDaily=Array.from({length:24},(_,h)=>source.water.coldRows[day*24+h][j]+source.water.hotRows[day*24+h][j]).reduce((a,b)=>a+b,0);
      const oldExpected=old.areaM2*oldp.specificConsumption*oldp.weekdayAdjustment[weekday];
      const variation=oldExpected>0?Math.min(1.5,Math.max(.5,previousDaily/oldExpected)):1;
      const daily=draft.areaM2*p.specificConsumption*p.weekdayAdjustment[weekday]*variation*(draft.occupants/Math.max(1,Math.round(draft.areaM2/20)))*(draft.occupancyHours/Math.max(1,p.openingHours[1]-p.openingHours[0]));
      for(let h=0;h<24;h++){const i=day*24+h,cl=Math.round(daily*weights[h]*100),hot=Math.round(cl*draft.hotShare);next.water.hotRows[i][j]=hot/100;next.water.coldRows[i][j]=(cl-hot)/100;}
    }
  }
  next.sensors=generateSensors(nextBuilding,next);validateSource(nextBuilding,next);
  return {building:nextBuilding,dataset:next,updatedAt:new Date().toISOString(),fileName:'Local retrofit scenario',changedModules:Object.keys(changes)};
}
window.SmartDrops=window.SmartDrops||{};
window.SmartDrops.scenarios={moduleSettings,applyScenario};
