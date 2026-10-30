import {fetchArchiveWeather,fetchCurrentWeather} from '../weather-api.js';
import {WEATHER_LOCATIONS} from '../weather-locations.js';

/** Optional live check and historical import. Live values never modify the 2026 model. */
export function openWeatherAPI({onLoad,locationId='norve'}){
  const dialog=document.createElement('dialog');dialog.className='rain-api-dialog';
  dialog.setAttribute('aria-labelledby','weather-api-title');
  const latest=Math.min(2026,new Date().getUTCFullYear()-1);
  dialog.innerHTML=`<form><header><h3 id="weather-api-title">Ålesund weather data</h3><button type="button" data-api-close aria-label="Close weather API">×</button></header>
    <p>Choose a nearby reference station. Open-Meteo supplies weather from a model grid cell near that station; these are not station observations.</p>
    <div class="rain-api-fields"><label>Reference location<select name="locationId">${Object.values(WEATHER_LOCATIONS).map(p=>`<option value="${p.id}" ${p.id===locationId?'selected':''}>${p.name} · ${p.stationId}</option>`).join('')}</select></label><label>Historical source year<input name="year" type="number" value="${latest}" min="2017" max="${latest}" step="1" required></label></div>
    <div class="rain-api-live"><button type="button" class="secondary-button" data-api-live>Check live now</button><output data-api-live-result role="status">Live values are shown here and do not change the model.</output></div>
    <p>A complete historical year's hourly temperature and precipitation can be replayed on the 2026 teaching clock. Leap day is omitted. The current reading is modeled 15-minute weather, separate from that history.</p>
    <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener noreferrer">Data source: Open-Meteo / ECMWF · CC BY 4.0</a><p data-api-status role="status"></p><button type="submit" class="primary-button" data-api-fetch>Import historical year</button></form>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s);let controller;
  const close=()=>{controller?.abort();dialog.close();dialog.remove();};
  $('[data-api-close]').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const request=async(kind)=>{
    if(controller)return;
    const form=$('form'),status=$('[data-api-status]'),live=$('[data-api-live-result]'),fetchButton=$('[data-api-fetch]'),liveButton=$('[data-api-live]');
    const options={locationId:form.elements.locationId.value,year:Number(form.elements.year.value)};
    controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),45000);
    fetchButton.disabled=true;liveButton.disabled=true;
    if(kind==='live')live.textContent='Checking current Ålesund weather…';
    else status.textContent='Loading a complete hourly year…';
    try{
      if(kind==='live'){
        const reading=await fetchCurrentWeather(options,{signal:controller.signal});
        live.textContent=`${reading.locationName} · ${reading.temperatureC.toFixed(1)} °C · ${reading.precipitationMm15Min.toFixed(1)} mm in the preceding 15 min · ${reading.timestampUtc.slice(0,16).replace('T',' ')} UTC. Modeled grid-cell value.`;
      }else{
        const weather=await fetchArchiveWeather(options,{signal:controller.signal});
        await onLoad(weather);close();
      }
    }catch(error){
      const message=error.name==='AbortError'?'The request timed out. Check your connection and try again.':error.message;
      if(kind==='live')live.textContent=message;else status.textContent=message;
    }finally{clearTimeout(timer);controller=null;if(dialog.isConnected){fetchButton.disabled=false;liveButton.disabled=false;}}
  };
  $('[data-api-live]').onclick=()=>request('live');
  $('form').onsubmit=event=>{event.preventDefault();request('history');};
  dialog.showModal();$('select').focus();return dialog;
}
