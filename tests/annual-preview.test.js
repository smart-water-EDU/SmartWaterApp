import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from './helpers.js';
import {aggregate} from '../src/data-model.js';
globalThis.window={SmartDrops:{}};
const {annualWaterM3,applyScenario,moduleSettings}=await import('../src/scenarios.js');
const {building,profiles,source}=await loadData();
const pmap=Object.fromEntries(profiles.profiles.map(p=>[p.id,p])),module=building.floors[0].modules[0];

test('annual editor total matches the entire 2026 main meter, including common use and leakage',()=>{
  const data=aggregate(building,source),main=data.columns.findIndex(c=>c.id==='MAIN');
  assert.equal(annualWaterM3(building,source),data.rows.reduce((sum,row)=>sum+row[main],0)/100000);
  assert.equal(annualWaterM3(building,source),annualWaterM3(building,applyScenario(building,profiles,source,{}).dataset));
});

test('annual preview uses the same scenario as Apply and preserves the active model',()=>{
  const before=JSON.stringify(source),baseline=annualWaterM3(building,source),j=source.water.moduleIds.indexOf(module.id);
  const oldModule=source.water.coldRows.reduce((sum,row,i)=>sum+Math.round(row[j]*100)+Math.round(source.water.hotRows[i][j]*100),0)/100000;
  const zero=applyScenario(building,profiles,source,{[module.id]:{...moduleSettings(module,pmap),occupants:0}});
  assert.ok(Math.abs(annualWaterM3(zero.building,zero.dataset)-(baseline-oldModule))<1e-9);
  const importedRows=Array.from({length:8760},()=>[1000,500]);
  const increased=applyScenario(building,profiles,source,{[module.id]:{...moduleSettings(module,pmap),importedRows}});
  assert.ok(Math.abs(annualWaterM3(increased.building,increased.dataset)-(baseline-oldModule+13140))<1e-9);
  assert.equal(JSON.stringify(source),before);
});
