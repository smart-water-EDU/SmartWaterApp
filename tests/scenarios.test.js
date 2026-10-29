import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from './helpers.js';
import {aggregate,csv,timestamp} from '../src/data-model.js';
globalThis.window={SmartDrops:{}};
const {moduleSettings,applyScenario,importModuleCSV}=await import('../src/scenarios.js');
const {building,profiles,source}=await loadData(),pmap=Object.fromEntries(profiles.profiles.map(p=>[p.id,p])),module=building.floors[0].modules[0];
test('applying a tenant change updates module, floor and pump sensors without mutating baseline',()=>{
  const before=JSON.stringify({building,source}),settings={...moduleSettings(module,pmap),use:'restaurant',hotShare:.45};
  const result=applyScenario(building,profiles,source,{[module.id]:settings});assert.equal(JSON.stringify({building,source}),before);
  assert.equal(result.building.floors[0].modules[0].use,'restaurant');
  const j=source.water.moduleIds.indexOf(module.id);assert.notEqual(result.dataset.water.hotRows[12][j],source.water.hotRows[12][j]);
  const main=result.dataset.sensors.columns.findIndex(c=>c.id==='S-CWF-INLET'),energy=result.dataset.sensors.columns.findIndex(c=>c.id==='S-EE-CW-PUMP');
  assert.notEqual(result.dataset.sensors.rows[12][main],source.sensors.rows[12][main]);assert.notEqual(result.dataset.sensors.rows[12][energy],source.sensors.rows[12][energy]);
  const data=aggregate(result.building,result.dataset),c=Object.fromEntries(data.columns.map((v,j)=>[v.id,j]));assert.equal(data.rows[12][c.MAIN],data.rows[12][c.OUTLET]+data.rows[12][c.LEAK]);
});
test('area budgets and invalid schedules are enforced',()=>{
  const settings=moduleSettings(module,pmap);
  assert.throws(()=>applyScenario(building,profiles,source,{[module.id]:{...settings,areaM2:settings.areaM2+10}}),/exceed/);
  assert.throws(()=>applyScenario(building,profiles,source,{[module.id]:{...settings,closingHour:settings.openingHour}}),/Opening/);
});
test('imported hourly cold/hot loads override profile calculation and reject invalid files',()=>{
  const rows=Array.from({length:8760},()=>[12,3]),text=csv(['timestamp_utc','cold_L','hot_L'],rows.map((r,i)=>[timestamp(i),...r])),importedRows=importModuleCSV(text);
  const result=applyScenario(building,profiles,source,{[module.id]:{...moduleSettings(module,pmap),importedRows,importName:'test.csv'}}),j=result.dataset.water.moduleIds.indexOf(module.id);
  assert.equal(result.dataset.water.coldRows[123][j],12);assert.equal(result.dataset.water.hotRows[123][j],3);
  assert.throws(()=>importModuleCSV(text.replace('2026-01-01T01:00:00.000Z','2026-01-01T00:00:00.000Z')),/consecutive/);
  assert.throws(()=>importModuleCSV(text.replace(',12,3',',,3')),/non-negative/);
  assert.equal(result.building.floors[0].modules[0].scenarioSettings.loadSource,'test.csv');
  assert.equal('importedRows' in result.building.floors[0].modules[0].scenarioSettings,false);
});

test('notes-only edits preserve water columns and zero occupancy removes calculated module demand',()=>{
  const notes=applyScenario(building,profiles,source,{[module.id]:{...moduleSettings(module,pmap),notes:'Study this tenant'}});
  assert.deepEqual(notes.dataset.water,source.water);
  const zero=applyScenario(building,profiles,source,{[module.id]:{...moduleSettings(module,pmap),occupants:0}}),j=zero.dataset.water.moduleIds.indexOf(module.id);
  for(let i=0;i<8760;i++){assert.equal(zero.dataset.water.coldRows[i][j],0);assert.equal(zero.dataset.water.hotRows[i][j],0);}
});
