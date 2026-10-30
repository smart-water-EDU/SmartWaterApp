// Refresh the bundled, location-specific teaching weather. Requires internet only here.
// 2025 ECMWF IFS hourly reanalysis near Ålesund IV / Nørve is replayed on the
// application's 2026 clock; no row is presented as an observed 2026 reading.
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {fetchArchiveWeather} from '../src/weather-api.js';
import {weatherLocation} from '../src/weather-locations.js';

const location=weatherLocation('norve'),sourceYear=2025,options={locationId:location.id,year:sourceYear};
const weather=await fetchArchiveWeather(options),rows=weather.rows,url=weather.provenance.url;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),start=Date.UTC(2026,0,1);
const csv=['timestamp_utc,precipitation_mm,temperature_c',...rows.map(([rain,temp],i)=>[
  new Date(start+i*3600000).toISOString(),String(rain),String(temp)
].join(','))].join('\r\n')+'\r\n';
const metadata={
  label:'Ålesund IV / Nørve location weather · 2025 history replayed on 2026',
  note:'Open-Meteo ECMWF IFS reanalysis at a nearby model grid cell. This is not a weather-station observation or actual 2026 weather.',
  referenceStation:{id:location.stationId,name:location.name,latitude:location.latitude,longitude:location.longitude},
  modelGridCell:{latitude:weather.provenance.gridLatitude,longitude:weather.provenance.gridLongitude},
  provider:'Open-Meteo / ECMWF IFS historical reanalysis',
  sourceYear,replayYear:2026,periods:rows.length,periodMinutes:60,
  units:{precipitation:'mm per preceding hour',temperature:'°C'},
  sourceUrl:url,license:'CC BY 4.0',retrievedAt:new Date().toISOString()
};
await writeFile(resolve(root,'data/rainwater_weather_2026.csv'),csv);
await writeFile(resolve(root,'data/rainwater_weather_source.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(`Saved ${rows.length} Ålesund hourly weather periods; 2025 reanalysis replayed on 2026.`);
