import {weatherLocation} from './weather-locations.js';

/** STUDENT EXTENSION: OPTIONAL WEATHER API. Requests only run after a user action.
 * Both endpoints use the selected Ålesund station's coordinates and the nearest model cell.
 * Open-Meteo provides modeled weather, not that station's raw observations. */
const commonQuery=location=>({
  latitude:String(location.latitude),longitude:String(location.longitude),
  cell_selection:'nearest',timezone:'GMT',temperature_unit:'celsius',precipitation_unit:'mm'
});
const validateGrid=(payload,location)=>{
  if(!Number.isFinite(payload?.latitude)||!Number.isFinite(payload?.longitude))throw new Error('The weather provider did not identify its model grid cell.');
  const latKm=(payload.latitude-location.latitude)*111.2;
  const lonKm=(payload.longitude-location.longitude)*111.2*Math.cos(location.latitude*Math.PI/180);
  if(Math.hypot(latKm,lonKm)>25)throw new Error('The weather provider returned a grid cell too far from Ålesund.');
};
export function weatherArchiveURL({locationId='norve',year}){
  const location=weatherLocation(locationId),lastYear=Math.min(2026,new Date().getUTCFullYear()-1);
  if(!Number.isInteger(year)||year<2017||year>lastYear)throw new Error('Choose a completed year between 2017 and '+lastYear+'.');
  const query=new URLSearchParams({...commonQuery(location),start_date:year+'-01-01',end_date:year+'-12-31',hourly:'temperature_2m,precipitation',models:'ecmwf_ifs'});
  return 'https://archive-api.open-meteo.com/v1/archive?'+query;
}
export function normalizeArchiveWeather(payload,year){
  if(payload?.error)throw new Error(payload.reason||'Weather provider returned an error.');
  const h=payload?.hourly;
  if(!h||!Array.isArray(h.time)||!Array.isArray(h.temperature_2m)||!Array.isArray(h.precipitation)||h.time.length!==h.temperature_2m.length||h.time.length!==h.precipitation.length)throw new Error('The API response is missing hourly weather data.');
  if(payload.hourly_units?.temperature_2m!=='°C'||payload.hourly_units?.precipitation!=='mm'||payload.utc_offset_seconds!==0)throw new Error('The API must return Celsius, millimetres and UTC hours.');
  const rows=[];let previous=null;
  h.time.forEach((time,j)=>{const d=new Date(time+'Z'),ms=d.getTime();if(!Number.isFinite(ms)||d.getUTCFullYear()!==year||d.getUTCMinutes()!==0||(previous!==null&&ms!==previous+3600000))throw new Error('The API hours must be complete, consecutive and in UTC.');previous=ms;
    const rain=h.precipitation[j],temperature=h.temperature_2m[j];if(!Number.isFinite(rain)||rain<0||!Number.isFinite(temperature)||temperature< -60||temperature>70)throw new Error('The API returned a missing or invalid weather reading.');
    if(d.getUTCMonth()===1&&d.getUTCDate()===29)return; // Omit leap day when replaying a source year on 2026.
    const replay=Date.UTC(2026,d.getUTCMonth(),d.getUTCDate(),d.getUTCHours());if(replay!==Date.UTC(2026,0,1)+rows.length*3600000)throw new Error('The API did not cover the complete source year.');rows.push([rain,temperature]);
  });
  if(rows.length!==8760)throw new Error('The API did not return a full year of hourly readings.');return rows;
}
export async function fetchArchiveWeather(options,{fetcher=globalThis.fetch,signal}={}){
  const location=weatherLocation(options.locationId),url=weatherArchiveURL(options),response=await fetcher(url,{signal});if(!response.ok)throw new Error('Weather API request failed ('+response.status+').');
  const payload=await response.json();validateGrid(payload,location);const rows=normalizeArchiveWeather(payload,options.year);
  return{kind:'imported',name:`${location.name} · ${options.year} → 2026 replay`,rows,provenance:{provider:'Open-Meteo / ECMWF IFS reanalysis',dataType:'modeled grid-cell weather, not station observations',stationId:location.stationId,locationId:location.id,referenceLatitude:location.latitude,referenceLongitude:location.longitude,gridLatitude:payload.latitude,gridLongitude:payload.longitude,sourceYear:options.year,replayYear:2026,url,fetchedAt:new Date().toISOString()}};
}
export function weatherCurrentURL({locationId='norve'}={}){
  const location=weatherLocation(locationId),query=new URLSearchParams({...commonQuery(location),current:'temperature_2m,precipitation'});
  return 'https://api.open-meteo.com/v1/forecast?'+query;
}
export function normalizeCurrentWeather(payload,locationId='norve'){
  const location=weatherLocation(locationId);
  if(payload?.error)throw new Error(payload.reason||'Weather provider returned an error.');
  validateGrid(payload,location);
  if(payload.utc_offset_seconds!==0||payload.current_units?.temperature_2m!=='°C'||payload.current_units?.precipitation!=='mm')throw new Error('Current weather must use UTC, Celsius and millimetres.');
  const time=payload.current?.time,stamp=typeof time==='string'?Date.parse(time+'Z'):NaN,temperature=payload.current?.temperature_2m,precipitation=payload.current?.precipitation;
  if(!Number.isFinite(stamp)||payload.current?.interval!==900||!Number.isFinite(temperature)||temperature< -60||temperature>70||!Number.isFinite(precipitation)||precipitation<0)throw new Error('The API returned invalid current 15-minute weather.');
  return{locationId:location.id,stationId:location.stationId,locationName:location.name,timestampUtc:new Date(stamp).toISOString(),temperatureC:temperature,precipitationMm15Min:precipitation,gridLatitude:payload.latitude,gridLongitude:payload.longitude,provider:'Open-Meteo modeled current conditions'};
}
export async function fetchCurrentWeather(options={}, {fetcher=globalThis.fetch,signal}={}){
  const url=weatherCurrentURL(options),response=await fetcher(url,{signal});if(!response.ok)throw new Error('Current weather API request failed ('+response.status+').');
  return{...normalizeCurrentWeather(await response.json(),options.locationId),url,fetchedAt:new Date().toISOString()};
}
