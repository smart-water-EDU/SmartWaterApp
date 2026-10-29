import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from './helpers.js';
import {sensorTag,SENSOR_TYPES} from '../src/sensor-tags.js';
import {upgradeSensorData} from '../src/data-model.js';
const {building,source}=await loadData();
test('every stored instrument uses a unique S-type-position tag and known quantity',()=>{
  const ids=source.sensors.columns.map(c=>c.id);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,69);
  for(const id of ids){assert.match(id,/^S-[A-Z]+-[A-Z0-9]+(?:-[A-Z0-9]+)*$/);assert.ok(SENSOR_TYPES[id.split('-')[1]],id);}
  assert.equal(sensorTag('S-L5'),'S-CWF-L5');assert.equal(sensorTag('M-L1-01'),'S-TWF-L1-01');assert.equal(sensorTag('T-HOT'),'S-HWT-SUPPLY');
});
test('tank level, inlet and outlet satisfy the storage balance for every 2026 hour',()=>{
  const columns=source.sensors.columns,col=id=>columns.findIndex(c=>c.id===id);let previous=800;
  for(const r of source.sensors.rows){const volume=r[col('S-WWL-TANK')]/100*2000,inlet=r[col('S-WWF-TANK-IN')]*60,outlet=r[col('S-WWF-TANK-OUT')]*60;
    assert.ok(volume>=0&&volume<=2000);assert.ok(inlet>=0&&outlet>=0);assert.ok(Math.abs(previous+inlet-outlet-volume)<1e-6);previous=volume;
  }
});
test('older locally saved sensor tables migrate while preserving water columns',()=>{
  const previous={...source,sensors:{columns:[{id:'S1'}],rows:[]}},next=upgradeSensorData(building,previous);
  assert.equal(next.water,source.water);assert.equal(previous.sensors.columns[0].id,'S1');assert.deepEqual(next.sensors,source.sensors);
});
