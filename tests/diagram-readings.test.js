import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from './helpers.js';
import {createDiagramReadings} from '../src/diagram-readings.js';
globalThis.window={SmartDrops:{}};
await import('../src/engine.js');await import('../src/pump-model.js');await import('../src/sensors.js');
const {building,profiles,source}=await loadData(),engine=window.SmartDrops.engine.createEngine(building,profiles,source),model=createDiagramReadings({engine}),state={index:4019,meterMode:'current',meterWindow:24};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
test('floor and unit balloons use the same stored hot/cold values as counters',()=>{
  let total=0;for(const f of building.floors){const s=model.splitLitres(state.index,{floor:f.id});near(s.total,engine.volumeCL(state.index,{floor:f.id})/100);total+=s.total;}
  near(total,engine.dataset.rows[state.index][engine.columnIndex.OUTLET]/100);
  const module=engine.modules[0].id,reading=model.read({id:'M-'+module,type:'flow',module},{...state,meterMode:'accumulated'});
  near(reading.rows[0].value,engine.metrics(state.index,{module}).flow);near(reading.rows[1].value,engine.sumCL(state.index-23,state.index+1,{module})/100);
  near(reading.rows[2].value+reading.rows[3].value,engine.volumeCL(state.index,{module})/100);
});
test('energy, temperatures and pressure are read from the hourly sensor table',()=>{
  for(const record of [{id:'S-EE-CW-PUMP',type:'energy',network:'cold'},{id:'S-TE-HW-HEATER',type:'energy',network:'hot',source:'heater'},{id:'S-WWT-OUTLET',type:'temperature',network:'sewage'},{id:'S-CWP-PUMP',type:'pressure',network:'cold'}]){
    const reading=model.read(record,state);near(reading.rows[0].value,engine.sensorValue(record.id,state.index));assert.match(reading.note,/Stored hourly channel/);
  }
  near(engine.sensorValue('S-EE-CW-PUMP',state.index),window.SmartDrops.pump.hourlyPumpEnergyKWh(engine.volumeCL(state.index)/100000));
});
test('leak balance retains 9 L/min and subtracts legitimate withdrawals',()=>{
  const b=window.SmartDrops.sensors.flowBalance(25,13,3,1);assert.equal(b.leakage,9);assert.equal(b.lossHourL,540);assert.equal(b.lossDayM3,12.96);assert.equal(b.alarm,true);
  const rain=model.read({network:'rainwater',id:'S-RWF-ROOF',type:'flow'},state);assert.equal(rain.rows[0].value,null);
});
