import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHeatDesign,distributeShares,addHeatConsumer,setPurposeShare,balanceHeatShares,removeHeatConsumer,chooseHeatExchanger,moveHeatNode,heatDesignPreview,validateHeatDesign,prepareHeatDesign,heaterElectricityPreview} from '../src/heat-recovery-model.js';
import {saveHeatDesign,loadHeatDesign} from '../src/heat-recovery-storage.js';
const catalog=JSON.parse(await readFile(new URL('../data/heat_recovery_presets.json',import.meta.url),'utf8'));
const complete=()=>{const d=createHeatDesign(catalog,{flowLMin:60,inletTemperatureC:25,outletTemperatureC:10});d.exchanger.placed=true;addHeatConsumer(d,catalog,'water');return d;};
test('exchanger presets have independent specifications and selecting a type updates them',()=>{
  const d=createHeatDesign(catalog);chooseHeatExchanger(d,catalog,'tubular');assert.equal(d.exchanger.effectivenessPercent,55);assert.equal(d.exchanger.capacityKW,45);assert.equal(d.exchanger.pressureDropKPa,25);assert.equal(d.exchanger.placed,false);
  chooseHeatExchanger(d,catalog,'spiral');assert.equal(d.exchanger.effectivenessPercent,70);assert.equal(d.exchanger.capacityKW,75);
});
test('allocation remains exactly 100% when adding/removing multiple consumers',()=>{
  const d=complete();for(const p of ['ventilation','space','storage','water','space'])addHeatConsumer(d,catalog,p);
  assert.equal(Math.round(d.consumers.reduce((n,c)=>n+c.sharePercent,0)*10),1000);
  assert.equal(new Set(d.consumers.map(c=>c.id)).size,6);removeHeatConsumer(d,d.consumers[1].id);assert.equal(Math.round(d.consumers.reduce((n,c)=>n+c.sharePercent,0)*10),1000);
  assert.deepEqual(distributeShares(Array(16).fill(1),.8).reduce((a,b)=>a+b,0).toFixed(1),'0.8');
});
test('purpose-level shares distribute between same-purpose consumers and invalid totals block saving',()=>{
  const d=complete();addHeatConsumer(d,catalog,'water');addHeatConsumer(d,catalog,'space');setPurposeShare(d,'water',60);setPurposeShare(d,'space',40);
  assert.equal(d.consumers.filter(c=>c.purpose==='water').reduce((n,c)=>n+c.sharePercent,0),60);assert.deepEqual(validateHeatDesign(d,catalog),[]);
  setPurposeShare(d,'space',70);assert.throws(()=>prepareHeatDesign(d,catalog),/100%/);balanceHeatShares(d);assert.deepEqual(validateHeatDesign(d,catalog),[]);
});
test('recovered heat applies effectiveness and rated capacity, with conserved consumer allocation',()=>{
  const d=complete();addHeatConsumer(d,catalog,'space');let p=heatDesignPreview(d);assert.ok(Math.abs(p.potentialKW-62.79)<1e-9);assert.ok(Math.abs(p.recoveredKW-62.79*.65)<1e-9);assert.ok(Math.abs(p.allocations.reduce((n,c)=>n+c.powerKW,0)-p.recoveredKW)<1e-9);
  d.exchanger.capacityKW=10;assert.equal(heatDesignPreview(d).recoveredKW,10);d.source.flowLMin=0;assert.equal(heatDesignPreview(d).recoveredKW,0);
});
test('design validation catches missing equipment, malformed shares, source temperatures and specifications',()=>{
  const d=createHeatDesign(catalog);assert.match(validateHeatDesign(d,catalog).join(' '),/Add the selected exchanger/);assert.match(validateHeatDesign(d,catalog).join(' '),/at least one/);
  const ready=complete();ready.exchanger.effectivenessPercent=101;assert.match(validateHeatDesign(ready,catalog).join(' '),/effectiveness/);ready.exchanger.effectivenessPercent=65;ready.source.outletTemperatureC=30;assert.match(validateHeatDesign(ready,catalog).join(' '),/outlet/);
});
test('node positions and specifications persist locally and saving never mutates the draft',()=>{
  const d=complete();moveHeatNode(d,d.consumers[0].id,{x:.66,y:.17});d.consumers[0].name='Lab water preheater';d.notes='Access on the downstream sewage branch.';const snapshot=JSON.stringify(d),data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  const saved=saveHeatDesign(d,catalog,storage);assert.equal(JSON.stringify(d),snapshot);assert.ok(saved.updatedAt);const loaded=loadHeatDesign(storage);assert.deepEqual(loaded,saved);assert.deepEqual(loaded.consumers[0].position,{x:.66,y:.17});assert.equal(loaded.consumers[0].name,'Lab water preheater');
  assert.throws(()=>saveHeatDesign(d,catalog,{setItem(){throw new Error('Storage full');}}),/Storage full/);
});

test('water-heater electricity offsets only valid water-preheating allocations and cannot become negative',()=>{
  const d=complete(),p=heaterElectricityPreview(d,{thermalKW:50,efficiency:.98});assert.ok(Math.abs(p.baselineKW-50/.98)<1e-9);assert.ok(Math.abs(p.avoidedKW-p.offsetThermalKW/.98)<1e-9);assert.ok(p.electricKW<p.baselineKW);assert.equal(p.hourEnergyKWh,p.electricKW);
  d.consumers[0].purpose='space';assert.equal(heaterElectricityPreview(d,{thermalKW:50}).avoidedKW,0);d.consumers[0].purpose='water';d.exchanger.placed=false;assert.equal(heaterElectricityPreview(d,{thermalKW:50}).avoidedKW,0);d.exchanger.placed=true;const small=heaterElectricityPreview(d,{thermalKW:1});assert.equal(small.electricKW,0);assert.equal(small.offsetThermalKW,1);
});
