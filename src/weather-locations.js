/** Fixed Ålesund reference stations. API values are model grid cells near these coordinates,
 * not observations from the instruments at the named stations. */
export const WEATHER_LOCATIONS = Object.freeze({
  norve: Object.freeze({id:'norve',name:'Ålesund IV / Nørve',stationId:'SN60945',latitude:62.4703,longitude:6.2108}),
  vigra: Object.freeze({id:'vigra',name:'Ålesund Airport / Vigra',stationId:'SN60990',latitude:62.5617,longitude:6.1150})
});
export const DEFAULT_WEATHER_LOCATION='norve';
export function weatherLocation(id=DEFAULT_WEATHER_LOCATION){
  const location=WEATHER_LOCATIONS[id];
  if(!location)throw new Error('Choose Ålesund IV / Nørve or Ålesund Airport / Vigra.');
  return location;
}
