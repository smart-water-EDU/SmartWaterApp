import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weatherArchiveURL,normalizeArchiveWeather,fetchArchiveWeather,weatherCurrentURL,normalizeCurrentWeather,fetchCurrentWeather} from '../src/weather-api.js';
import {parseRainWeatherCSV} from '../src/rainwater-model.js';

const fixture=year=>{const start=Date.UTC(year,0,1),n=(Date.UTC(year+1,0,1)-start)/3600000;return{latitude:62.460457,longitude:6.136364,utc_offset_seconds:0,hourly_units:{temperature_2m:'°C',precipitation:'mm'},hourly:{time:Array.from({length:n},(_,j)=>new Date(start+j*3600000).toISOString().slice(0,16)),temperature_2m:Array(n).fill(8),precipitation:Array(n).fill(.2)}};};
const currentFixture=()=>({latitude:62.468163,longitude:6.2092743,utc_offset_seconds:0,current_units:{temperature_2m:'°C',precipitation:'mm'},current:{time:'2026-10-30T11:30',interval:900,temperature_2m:12.1,precipitation:.3}});

test('history and live URLs use the same named Ålesund reference station',()=>{
  const archive=new URL(weatherArchiveURL({locationId:'norve',year:2025})),live=new URL(weatherCurrentURL({locationId:'norve'}));
  for(const url of [archive,live]){assert.equal(url.searchParams.get('latitude'),'62.4703');assert.equal(url.searchParams.get('longitude'),'6.2108');assert.equal(url.searchParams.get('cell_selection'),'nearest');assert.equal(url.searchParams.get('timezone'),'GMT');}
  assert.equal(archive.searchParams.get('models'),'ecmwf_ifs');assert.equal(archive.searchParams.get('end_date'),'2025-12-31');
  assert.equal(live.searchParams.get('current'),'temperature_2m,precipitation');
  const airport=new URL(weatherCurrentURL({locationId:'vigra'}));assert.equal(airport.searchParams.get('latitude'),'62.5617');assert.equal(airport.searchParams.get('longitude'),'6.115');
  assert.throws(()=>weatherArchiveURL({locationId:'unknown',year:2025}),/Ålesund/);
  assert.throws(()=>weatherArchiveURL({locationId:'norve',year:2027}),/completed/);
});
test('historical API replay validates UTC chronology, complete year and missing values',()=>{
  const p=fixture(2024);p.hourly.temperature_2m[p.hourly.time.indexOf('2024-03-01T00:00')]=13;
  const rows=normalizeArchiveWeather(p,2024);assert.equal(rows.length,8760);assert.equal(rows[59*24][1],13);
  const incomplete=fixture(2025);incomplete.hourly.precipitation[5]=null;assert.throws(()=>normalizeArchiveWeather(incomplete,2025),/invalid/);
  incomplete.hourly.precipitation[5]=.2;incomplete.hourly.time[1]=incomplete.hourly.time[0];assert.throws(()=>normalizeArchiveWeather(incomplete,2025),/consecutive/);
});
test('historical imports retain station and actual model-grid provenance',async()=>{
  await assert.rejects(fetchArchiveWeather({locationId:'norve',year:2025},{fetcher:async()=>({ok:false,status:503})}),/503/);
  const weather=await fetchArchiveWeather({locationId:'norve',year:2025},{fetcher:async()=>({ok:true,json:async()=>fixture(2025)})});
  assert.equal(weather.kind,'imported');assert.equal(weather.provenance.stationId,'SN60945');assert.equal(weather.provenance.gridLongitude,6.136364);assert.equal(weather.rows.length,8760);
  const far=fixture(2025);far.longitude=10;await assert.rejects(fetchArchiveWeather({locationId:'norve',year:2025},{fetcher:async()=>({ok:true,json:async()=>far})}),/too far/);
});
test('live reading is a separate 15-minute model value, never a history row',async()=>{
  const reading=normalizeCurrentWeather(currentFixture(),'norve');
  assert.equal(reading.stationId,'SN60945');assert.equal(reading.precipitationMm15Min,.3);assert.equal(reading.timestampUtc,'2026-10-30T11:30:00.000Z');
  const result=await fetchCurrentWeather({locationId:'norve'},{fetcher:async()=>({ok:true,json:async()=>currentFixture()})});
  assert.equal(result.temperatureC,12.1);assert.ok(!('rows' in result));
  const invalid=currentFixture();invalid.current.precipitation=null;assert.throws(()=>normalizeCurrentWeather(invalid),/invalid/);
});
test('bundled 2026 teaching weather is a complete Ålesund 2025 replay with provenance',()=>{
  const rows=parseRainWeatherCSV(readFileSync(new URL('../data/rainwater_weather_2026.csv',import.meta.url),'utf8'));
  const source=JSON.parse(readFileSync(new URL('../data/rainwater_weather_source.json',import.meta.url),'utf8'));
  assert.equal(rows.length,8760);assert.equal(source.referenceStation.id,'SN60945');assert.equal(source.sourceYear,2025);assert.equal(source.replayYear,2026);
  assert.equal(source.periods,8760);assert.match(source.note,/not a weather-station observation/i);
});
