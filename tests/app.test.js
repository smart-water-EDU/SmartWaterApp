import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from './helpers.js';
import {aggregate,generateSensors,parseCSV,readHourlyCSV} from '../src/data-model.js';
const {building,profiles,source}=await loadData();
test('building and profiles retain 7 floors, 35 modules and normalized weights',()=>{
  assert.equal(building.floors.length,7);assert.equal(source.water.moduleIds.length,35);
  assert.equal(building.floors.reduce((s,f)=>s+f.grossAreaM2,0),16000);
  for(const p of profiles.profiles){assert.equal(p.hourlyWeights.length,24);assert.ok(Math.abs(p.hourlyWeights.reduce((a,b)=>a+b,0)-1)<1e-9);}
  for(const id of ['office','restaurant','retail','parking','storage','supermarket','clinic','educational','training'])assert.ok(profiles.profiles.some(p=>p.id===id));
});
test('every 2026 hour reconciles module hot/cold, common, floor and inlet meters',()=>{
  const data=aggregate(building,source),c=Object.fromEntries(data.columns.map((v,j)=>[v.id,j]));
  assert.equal(data.rows.length,8760);
  for(const [i,row] of data.rows.entries()){
    let floors=0;
    for(const f of building.floors){const demand=f.modules.reduce((s,m)=>s+row[c[m.id]],row[c[f.id+'-COMMON']]);assert.equal(demand,row[c['M-'+f.id]]);floors+=demand;}
    assert.equal(row[c.OUTLET],floors);assert.equal(row[c.MAIN],floors+row[c.LEAK]);
    for(const id of source.water.moduleIds){const j=source.water.moduleIds.indexOf(id);assert.equal(row[c[id]],Math.round(source.water.coldRows[i][j]*100)+Math.round(source.water.hotRows[i][j]*100));}
  }
});
test('all stored sensor types have 8760 reproducible readings and correct units',()=>{
  assert.equal(source.sensors.rows.length,8760);assert.deepEqual(source.sensors,generateSensors(building,source));
  for(const type of ['flow','energy','temperature','pressure','pump'])assert.ok(source.sensors.columns.some(c=>c.kind===type));
  const col=id=>source.sensors.columns.findIndex(c=>c.id===id),i=(Date.parse('2026-06-17T12:00Z')-Date.parse(source.start))/3600000;
  assert.ok(Math.abs(source.sensors.rows[i][col('S-CWF-MAIN-IN')]-source.sensors.rows[i][col('S-CWF-MAIN-OUT')]-9)<1e-7);
  assert.equal(source.sensors.rows[i][col('S-RWF-ROOF')],null);
});
test('CSV reader rejects missing values, duplicate columns and nonconsecutive times',()=>{
  assert.deepEqual(parseCSV('a,b\n"quoted, cell",2\n'),[['a','b'],['quoted, cell','2']]);
  assert.throws(()=>readHourlyCSV('timestamp_utc,cold_L,cold_L\n',['cold_L','hot_L']),/Expected timestamp/);
});
test('Vite uses local data bundle and modular editor',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/src="\/data\/datasets\.js"/);assert.match(html,/src="\/src\/main\.js"/);
});
