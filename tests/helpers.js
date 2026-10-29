import {readFile} from 'node:fs/promises';
import {readHourlyCSV,parseCSV,validateSource} from '../src/data-model.js';
const text=name=>readFile(new URL('../data/'+name,import.meta.url),'utf8');
export const json=async name=>JSON.parse(await text(name));
export async function loadData(){
  const [building,profiles,manifest,events,registry]=await Promise.all(['building.json','retrofit_consumption_profiles.json','data_manifest.json','leak_events.json','sensors.json'].map(json));
  const moduleIds=building.floors.flatMap(f=>f.modules.map(m=>m.id)),commonIds=building.floors.map(f=>f.id);
  const [coldRows,hotRows,common,sensorCSV]=await Promise.all([text(manifest.files.cold).then(s=>readHourlyCSV(s,moduleIds)),text(manifest.files.hot).then(s=>readHourlyCSV(s,moduleIds)),text(manifest.files.common).then(s=>readHourlyCSV(s,[...commonIds.flatMap(id=>[id+'_cold_L',id+'_hot_L']),'main_leak_L'])),text(manifest.files.sensors).then(parseCSV)]);
  const [header,...rows]=sensorCSV,columns=registry.columns;
  if(header.slice(1).join(',')!==columns.map(c=>c.id).join(','))throw new Error('Sensor CSV columns do not match registry');
  const source={...manifest,events,water:{moduleIds,commonIds,coldRows,hotRows,commonColdRows:common.map(r=>commonIds.map((_,j)=>r[j*2])),commonHotRows:common.map(r=>commonIds.map((_,j)=>r[j*2+1])),leakLitres:common.map(r=>r.at(-1))},sensors:{columns,rows:rows.map(r=>r.slice(1).map(v=>v===''?null:Number(v)))}};
  validateSource(building,source);return {building,profiles,source};
}
