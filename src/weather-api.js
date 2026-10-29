/** STUDENT EXTENSION: OPTIONAL WEATHER API. No request is made until the user asks. */
export function weatherArchiveURL({latitude,longitude,year}){
  if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new Error('Enter valid latitude and longitude.');
  const lastYear=Math.min(2026,new Date().getUTCFullYear()-1);
  if(!Number.isInteger(year)||year<1940||year>lastYear)throw new Error('Choose a completed year between 1940 and '+lastYear+'.');
  const query=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),start_date:year+'-01-01',end_date:year+'-12-31',hourly:'temperature_2m,precipitation',timezone:'GMT',temperature_unit:'celsius',precipitation_unit:'mm'});
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
  const url=weatherArchiveURL(options),response=await fetcher(url,{signal});if(!response.ok)throw new Error('Weather API request failed ('+response.status+').');
  const rows=normalizeArchiveWeather(await response.json(),options.year);
  return{kind:'imported',name:'Open-Meteo '+options.year+(options.year===2026?'':' → 2026 replay'),rows,provenance:{provider:'Open-Meteo historical reanalysis',sourceYear:options.year,replayYear:2026,latitude:options.latitude,longitude:options.longitude,url,fetchedAt:new Date().toISOString()}};
}
