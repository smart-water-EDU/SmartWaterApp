/** Public instrument tags: S-[quantity/type]-[position]. Aliases only migrate earlier saved scenarios/code. */
const aliases={
  'F-CW-IN':'S-CWF-INLET','F-CW-RISER':'S-CWF-RISER','F-HW-MAIN':'S-HWF-MAIN','F-SW-OUT':'S-WWF-TANK-IN',
  S1:'S-CWF-MAIN-IN',S2:'S-CWF-MAIN-OUT',B1:'S-CWF-BRANCH',
  'E-PUMP-CW':'S-EE-CW-PUMP','E-PUMP-HW':'S-EE-HW-PUMP','E-HEATER-HW':'S-TE-HW-HEATER',
  'T-COLD':'S-CWT-INLET','T-HOT':'S-HWT-SUPPLY','T-SW-OUT':'S-WWT-OUTLET',
  'P-CW':'S-CWP-PUMP','P-HW':'S-HWP-PUMP','PUMP-CW':'S-PWR-CW-PUMP','PUMP-HW':'S-PWR-HW-PUMP','F-RW':'S-RWF-ROOF'
};
export function sensorTag(id) {
  if(aliases[id])return aliases[id];
  if(/^M-(U1|L[1-6])-\d+$/.test(id))return 'S-TWF-'+id.slice(2);
  if(/^S-HW-(U1|L[1-6])$/.test(id))return 'S-HWF-'+id.slice(5);
  if(/^S-(U1|L[1-6])$/.test(id))return 'S-CWF-'+id.slice(2);
  return id;
}
export const SENSOR_TYPES=Object.freeze({CWF:'Cold water flow',HWF:'Hot water flow',TWF:'Total water flow',WWF:'Wastewater flow',RWF:'Rainwater flow',CWT:'Cold water temperature',HWT:'Hot water temperature',WWT:'Wastewater temperature',CWP:'Cold water pressure',HWP:'Hot water pressure',EE:'Electrical energy',TE:'Thermal energy',PWR:'Pump electrical power',WWL:'Wastewater tank level'});

/** Normalize old local configuration labels without changing tenant/area edits. */
export function tagBuildingSensors(building){
  if(!building.network)return building;
  return {...building,network:{...building.network,sensors:(building.network.sensors||[]).map(s=>({...s,id:sensorTag(s.id)})),segments:(building.network.segments||[]).map(s=>({...s,label:s.label.replace(/\b(S1|S2|B1)\b/g,sensorTag)}))}};
}
