import {sensorTag} from './sensor-tags.js';
/** Instrument balloons read the schema-2 hourly sensor table, never invent values on hover. */
export const INSTRUMENT_ASSUMPTIONS=Object.freeze({commonHotShare:.15,coldTemperatureC:10,seasonalColdAmplitudeC:4,hotTemperatureC:60,sewageCoolingC:6,hotPumpHeadM:12,waterSpecificHeatKJPerKgK:4.186,sewageReturnFraction:1});
export function createDiagramReadings({engine}) {
  const row=(label,value,unit)=>({label,value,unit});
  const ranges=new Map();
  function gaugeMax(id,type){if(ranges.has(id))return ranges.get(id);const j=engine.source.sensors.columns.findIndex(c=>c.id===id);let peak=0;for(const r of engine.source.sensors.rows)peak=Math.max(peak,r[j]||0);const max=type==='temperature'||type==='level'?100:type==='pressure'?6:Math.max(1,Math.ceil(peak*1.1*10)/10);ranges.set(id,max);return max;}
  const splitLitres=(i,selection={})=>engine.waterSplit(i,selection);
  const temperatures=i=>({cold:engine.sensorValue('S-CWT-INLET',i),hot:engine.sensorValue('S-HWT-SUPPLY',i),sewage:engine.sensorValue('S-WWT-OUTLET',i)});
  function sensorId(r) {
    if(r.module)return 'M-'+r.module;
    if(r.floor)return r.network==='hot'?'S-HW-'+r.floor:'S-'+r.floor;
    if(engine.source.sensors.columns.some(c=>c.id===r.id))return r.id;
    if(r.type==='temperature')return r.network==='sewage'?'S-WWT-OUTLET':r.network==='hot'?'S-HWT-SUPPLY':'S-CWT-INLET';
    if(r.type==='pressure')return r.network==='hot'?'S-HWP-PUMP':'S-CWP-PUMP';
    if(r.source==='heater')return 'S-TE-HW-HEATER';
    if(r.type==='energy')return r.network==='hot'?'S-EE-HW-PUMP':'S-EE-CW-PUMP';
    if(r.type==='pump')return r.network==='hot'?'S-PWR-HW-PUMP':'S-PWR-CW-PUMP';
    return r.source==='main'?'S-CWF-INLET':r.network==='hot'?'S-HWF-MAIN':r.network==='sewage'?'S-WWF-TANK-IN':'S-CWF-RISER';
  }
  const flowLitres=(r,i)=>r.network==='rainwater'?null:engine.sensorValue(sensorId({...r,type:'flow'}),i)*60;
  const energyKWh=(r,i)=>engine.sensorValue(sensorId({...r,type:'energy'}),i);
  function read(record,state) {
    const i=engine.clamp(state.index),end=i+1,start=state.meterMode==='accumulated'?Math.max(0,end-state.meterWindow):i,hours=end-start,id=sensorTag(sensorId(record));
    const result={id,gaugeMax:gaugeMax(id,record.type),title:record.title,type:record.type,time:engine.date(i).toISOString().slice(0,16).replace('T',' '),rows:[],note:''};
    if(record.network==='rainwater'){result.rows=[row('Reading',null,'')];result.note='Rainwater channel reserved in sensors.json; no rainfall or storage model is connected.';return result;}
    const current=engine.sensorValue(id,i),sum=()=>{let n=0;for(let h=start;h<end;h++)n+=engine.sensorValue(id,h);return n;};
    if(record.type==='flow') {
      result.rows=[row('Flow · hourly average',current,'L/min'),row(state.meterMode==='accumulated'?`${hours}-hour total`:'Current-hour volume',sum()*60,'L')];
      if(record.module){const split=splitLitres(i,{module:record.module});result.rows.push(row('Cold · current hour',split.cold,'L'),row('Hot · current hour',split.hot,'L'));}
    }else if(record.type==='energy'){
      result.rows=[row(record.source==='heater'?'Average thermal power':'Average electrical power',current,'kW'),row('Current-hour energy',current,'kWh')];
      if(state.meterMode==='accumulated')result.rows.push(row(`${hours}-hour energy`,sum(),'kWh'));
    }else if(record.type==='level')result.rows=[row('Level',current,'%')];
    else if(record.type==='temperature')result.rows=[row('Water temperature',current,'°C')];
    else if(record.type==='pressure')result.rows=[row('Pump pressure rise',current,'bar')];
    else if(record.type==='pump')result.rows=[row('Flow · hourly average',engine.sensorValue(record.network==='hot'?'S-HWF-MAIN':'S-CWF-INLET',i),'L/min'),row('Electrical power',current,'kW'),row('Assumed pump head',record.network==='hot'?12:30,'m'),row('Equivalent pressure rise',engine.sensorValue(record.network==='hot'?'S-HWP-PUMP':'S-CWP-PUMP',i),'bar')];
    result.note=`Stored hourly channel ${id} · synthetic 2026 sensor data, not actual measurements. `+(record.source==='heater'?'Useful thermal energy from hot-water volume and temperature rise.':record.type==='pressure'?'Pressure rise is modeled from assumed pump head.':record.type==='energy'||record.type==='pump'?'Electricity uses the flow-dependent pump efficiency model.':record.network==='sewage'?'Drainage returns 100% of tenant/common demand; mains leakage is excluded.':'All flow channels reconcile with the hot/cold water columns.');
    return result;
  }
  return {read,splitLitres,flowLitres,energyKWh,temperatures};
}
