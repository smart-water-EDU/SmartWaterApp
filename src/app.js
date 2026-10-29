/* Browser application controller. Edit this file directly; no bundler is required. */
window.SmartDrops = window.SmartDrops || {};
(() => {
const { createEngine } = window.SmartDrops.engine;
const { flowBalance, sensorSeries, cases } = window.SmartDrops.sensors;
const { createProposal, validateProposal } = window.SmartDrops.scenarios;
const { barChart, lineChart, pumpFlowEnergyChart, pumpEnergyDegradationChart } = window.SmartDrops.charts;
const { consumptionEnergyWindow, pumpEnergyDegradationSeries } = window.SmartDrops.pump;

const $=id=>document.getElementById(id);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,decimals=2)=>Number(v).toLocaleString('en-GB',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
const pumpNumber=v=>number(v,v>1000?0:1);
const counterNumber=v=>number(v,v>100?0:1);
let engine, state, timer, saveTimer, toastTimer, isFullscreen=false, fullscreenRevision=0;
let buildingConfig, profileConfig, defaultMonitoring, customMonitoringInfo=null;
const buffers={};
// The baseline dataset stores total module water use. These fixed educational
// fractions split that total into illustrative hot/cold components for display;
// they are not separate measured hot- and cold-water readings.
const illustrativeHotShareByUse={office:.30,restaurant:.45,cafe:.40,retail:.22,supermarket:.20,fitness:.35,clinic:.40,public:.30,services:.30,vacant:.15,parking:.10,storage:.10,educational:.30,training:.35};
const defaults=()=>({version:1,tab:'monitoring',index:4019,second:0,floor:null,module:null,scale:'hourly',threshold:1,caseId:'historical',segment:'main',minute:30,sensor:'S1',curveSensor:'S1',speed:3600,focus:false,networks:['cold'],meterMode:'current',meterWindow:24,pumpDisplay:'cumulative',proposals:{},additionalSystems:[],additionalSystemSpecs:{}});
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>window.waterAPI.saveSettings(state).catch(e=>notify('Could not save local settings: '+e.message)),250);}
const selection=()=>({floor:state.floor,module:state.module});
function selectedLabel(){return state.module || (state.floor ? `Floor ${state.floor}` : 'Whole building');}
function options(items,value){return items.map(([id,label])=>`<option value="${escape(id)}" ${value===id?'selected':''}>${escape(label)}</option>`).join('');}
function pause(){if(timer)clearInterval(timer);timer=null;$('play-button').classList.remove('is-playing');$('play-label').textContent='Play';$('play-button').setAttribute('aria-pressed','false');}
function play(){
  if(timer){pause();save();return;}
  const maxSeconds=engine.dataset.periods*3600-1;
  if(state.index*3600+state.second>=maxSeconds){state.index=0;state.second=0;}
  timer=setInterval(()=>{
    const previousIndex=state.index;
    const nextSecond=Math.min(maxSeconds,state.index*3600+state.second+state.speed);
    state.index=Math.floor(nextSecond/3600);
    state.second=nextSecond%3600;
    if(state.index!==previousIndex){render();save();}
    else updateSimulationTime();
    if(nextSecond>=maxSeconds){pause();save();}
  },1000);
  $('play-button').classList.add('is-playing');$('play-label').textContent='Pause';$('play-button').setAttribute('aria-pressed','true');
}
function goTo(index){state.index=engine.clamp(index);state.second=0;render();save();}
function updateSimulationTime(){
  const stamp=new Date(engine.date(state.index).getTime()+(state.second||0)*1000);
  $('simulation-time').value=stamp.toISOString().slice(0,19);
}
function setTab(tab){pause();state.tab=tab;render();save();}
function select(value){Object.assign(state,value);render();save();}
function chooseSegment(segment){state.segment=segment;state.tab='warning';pause();render();save();}
function sensorData(){return sensorSeries(engine,state.index,state.caseId,state.segment);}

function renderEmbeddedDiagram(){
  const diagram=$('building-network-svg');
  if(!diagram)return;
  for(const input of document.querySelectorAll('[data-network]')){
    diagram.querySelectorAll('.pipe-layer-'+input.dataset.network).forEach(pipe=>pipe.classList.toggle('pipe-layer-hidden',!state.networks.includes(input.dataset.network)));
  }
  const end=state.index+1;
  const start=state.meterMode==='current'?state.index:Math.max(0,end-state.meterWindow);
  diagram.querySelectorAll('[data-meter-module]').forEach(label=>{
    const id=label.dataset.meterModule;
    const total=state.meterMode==='current'
      ?engine.volumeCL(state.index,{module:id})/100
      :engine.sumCL(start,end,{module:id})/100;
    const module=engine.modules.find(item=>item.id===id);
    const hotShare=illustrativeHotShareByUse[module?.use]??.30;
    const hot=total*hotShare, cold=total-hot;
    if(!label.dataset.baseTransform)label.dataset.baseTransform=label.getAttribute('transform');
    const coords=label.dataset.baseTransform.match(/translate\(([-0-9.]+)\s+([-0-9.]+)\)/);
    if(coords)label.setAttribute('transform',`translate(${coords[1]} ${Number(coords[2])-16})`);
    label.replaceChildren();
    const line=(y,text,className='',fill='')=>{
      const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');
      span.setAttribute('x','0');span.setAttribute('y',String(y));
      if(className)span.setAttribute('class',className);
      if(fill)span.setAttribute('fill',fill);
      span.textContent=text;label.append(span);
    };
    line(0,number(total,state.meterMode==='current'?1:0)+(state.meterMode==='current'?' L/h':' L'),'meter-total');
    line(15,number(cold,state.meterMode==='current'?1:0),'meter-component','#3286bb');
    const hotSpan=document.createElementNS('http://www.w3.org/2000/svg','tspan');
    hotSpan.setAttribute('x','39');hotSpan.setAttribute('y','15');hotSpan.setAttribute('class','meter-component');hotSpan.setAttribute('fill','#cf514b');
    hotSpan.textContent=number(hot,state.meterMode==='current'?1:0);label.append(hotSpan);
  });
  diagram.querySelectorAll('[data-module-id]').forEach(label=>{
    if(label.dataset.interactiveBound)return;
    label.dataset.interactiveBound='true';
    const id=label.dataset.moduleId;
    label.setAttribute('tabindex','0');
    label.setAttribute('role','button');
    label.setAttribute('aria-label','Inspect simulated tenant module '+id);
    label.style.cursor='pointer';
    label.addEventListener('click',()=>{
      const module=engine.modules.find(item=>item.id===id);
      if(module)select({floor:module.floor,module:id});
    });
    label.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();label.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    });
  });
}
function render(){
  document.body.classList.toggle('workspace-focus',!!state.focus);
  $('focus-button').textContent=state.focus?'Show property overview':'Focus workspace';
  $('focus-button').setAttribute('aria-expanded',String(!state.focus));
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
  $('tab-description').textContent=({monitoring:'Track simulated water use, floor demand and estimated pump energy.',management:'Draft tenant-use proposals and review change-of-use assumptions.',warning:'Review simulated leaks, sensor imbalances and pump efficiency projections.'})[state.tab];
  $('workspace').setAttribute('aria-labelledby','tab-'+state.tab);
  updateSimulationTime();
  document.querySelectorAll('[data-clock-speed]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.clockSpeed)===state.speed)));
  $('previous-hour').disabled=state.index===0;$('next-hour').disabled=state.index===8759;
  const buildingMetrics=engine.metrics(state.index,{floor:null,module:null});
  const selectedMetrics=engine.metrics(state.index,selection());
  const meterLabel=state.module ? 'Module '+state.module : (state.floor ? 'Floor '+state.floor : 'Module · all');
  for(const id of ['flow','today','month','year']){
    $('kpi-'+id+'-building').textContent=counterNumber(buildingMetrics[id]);
    $('kpi-'+id+'-selected').textContent=counterNumber(selectedMetrics[id]);
    $('kpi-'+id+'-selected-label').textContent=meterLabel;
  }
  renderEmbeddedDiagram();
  renderModule();
  if(state.tab==='monitoring')renderMonitoring();
  if(state.tab==='management')renderManagement();
  if(state.tab==='warning')renderWarning();
  const readings=sensorSeries(engine,state.index,'historical','main')[30];
  const alarm=flowBalance(readings.inlet,readings.outlet,0,state.threshold).alarm;
  $('warning-count').textContent=alarm?'1':'0';
  $('warning-count').title='Active historical main-pipe balance warning at the selected hour';
  document.body.dataset.ready='true';
}
function renderModule(){
  const panel=$('module-panel');
  if(state.module){
    const m=engine.moduleStats(state.module,state.index),p=m.profile;
    panel.innerHTML=`<div class="module-title"><h3>${escape(m.id)} <span> / ${escape(p.label)}</span></h3><span>SELECTED MODULE</span></div><dl class="detail-grid"><div><dt>Floor / unit area</dt><dd>${m.floor} · ${number(m.areaM2,1)} m²</dd></div><div><dt>Estimated daily use</dt><dd>${number(m.dailyM3*1000,0)} L/day</dd></div><div><dt>Estimated peak flow</dt><dd>${number(m.peakLMin)} L/min</dd></div><div><dt>Typical schedule</dt><dd>${String(p.openingHours[0]).padStart(2,'0')}:00–${String(p.openingHours[1]).padStart(2,'0')}:00</dd></div><div><dt>Use assumption</dt><dd>${p.specificConsumption} L/m²/op. day</dd></div><div><dt>Peak factor</dt><dd>×${p.peakFactor} max hourly mean</dd></div></dl><p class="module-hint">Daily use is the complete selected day's simulated total. Typical hours include reduced closed-day and background consumption.</p>`;
  }else if(state.floor){
    const f=engine.building.floors.find(f=>f.id===state.floor);
    const series=engine.series(state.index,'hourly',{floor:f.id});
    panel.innerHTML=`<div class="module-title"><h3>Floor ${f.id}</h3><span>${f.modules.length} TENANT MODULES</span></div><dl class="detail-grid"><div><dt>Gross area</dt><dd>${number(f.grossAreaM2,0)} m²</dd></div><div><dt>Common / services</dt><dd>${number(f.commonAreaM2,0)} m² · 20%</dd></div><div><dt>Full-day consumption</dt><dd>${number(series.reduce((s,p)=>s+p.value,0))} m³</dd></div></dl><p class="module-hint">Click a rectangular tenant module for its use, schedule, area and demand profile.</p>`;
  }else panel.innerHTML=`<div class="module-title"><h3>Explore the building</h3><span>35 SELECTABLE MODULES</span></div><p class="module-hint">Select a floor label to inspect its total demand, or a tenant module to open its details. Select any pipe segment or sensor to open a flow-balance investigation.</p><p class="module-hint">20% of each floor is reserved for common areas, toilets, corridors and technical services.</p>`;
}
function pumpEnergyPanel(){
  return `<article class="panel"><div class="panel-heading"><div><h2>Consumption and estimated pump energy</h2></div><div class="pump-heading-actions"><div class="segmented pump-display-switch" role="group" aria-label="Pump graph values"><button type="button" data-pump-display="cumulative" aria-pressed="${state.pumpDisplay==='cumulative'}">Accumulated · cumsum</button><button type="button" data-pump-display="real" aria-pressed="${state.pumpDisplay==='real'}">Real values</button></div><span class="tag">24H HISTORY + 24H FORECAST</span></div></div><div class="pump-legend"><span><i class="water-key"></i>Water</span><span><i class="energy-key"></i>Pump energy</span><span><i class="history-key"></i>Solid: past</span><span><i class="forecast-key"></i>Dashed: forecast</span></div><div id="pump-flow-energy" class="chart pump-stacked-chart"></div><p class="chart-footnote">Forecast uses prior simulated readings matched by hour and weekday. Pump electricity is estimated from water flow and 30 m head, using flow-dependent pump efficiency that varies slightly with operating point and is anchored at 65% near the modeled best-efficiency flow; water density is 1,000 kg/m³. Accumulated mode sums the displayed 24-hour past and forecast window.</p></article>`;
}
function bindPumpEnergy(){
  const energy=consumptionEnergyWindow(engine,state.index);
  pumpFlowEnergyChart($('pump-flow-energy'),energy,state.pumpDisplay);
  document.querySelectorAll('[data-pump-display]').forEach(button=>button.onclick=()=>{state.pumpDisplay=button.dataset.pumpDisplay;renderMonitoring();save();});
}
function pumpEnergyDegradationPanel(model){
  return `<article class="panel"><div class="panel-heading"><div><h2>Accumulated pump energy use</h2></div><span class="tag">−6 MONTHS · NOW · +6 MONTHS</span></div><div class="pump-legend degradation-legend"><span><i class="baseline-key"></i>Current-efficiency baseline</span><span><i class="degradation-key"></i>Projected efficiency degradation</span></div><div id="pump-energy-degradation" class="chart"></div><div class="pump-statline"><span>Baseline at +6 months<strong>${pumpNumber(model.baselineEnd)} kWh</strong></span><span>With degradation at +6 months<strong>${pumpNumber(model.degradedEnd)} kWh</strong></span><span>Projected additional energy<strong>+${pumpNumber(model.energyLossKWh)} kWh</strong></span></div><p class="chart-footnote">The solid line holds current modeled pump efficiency constant; the dashed forecast applies the existing 4 percentage-point efficiency loss per six months to the same projected flow. Historical flow comes from the simulated meter; future flow repeats the recent 28-day weekday/hour profile. Educational projection, not measured pump energy.</p></article>`;
}
function renderMonitoring(){
  $('workspace').innerHTML=`<div class="workspace-stack"><article class="panel"><div class="panel-heading"><div><h2>${escape(selectedLabel())} water use</h2></div><span class="tag">2026 BASELINE</span></div><div class="chart-controls"><div class="segmented" aria-label="Chart interval">${['hourly','daily','monthly','yearly'].map(s=>`<button data-scale="${s}" class="${state.scale===s?'active':''}" aria-pressed="${state.scale===s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}</div><span class="chart-period">${state.scale==='hourly'?engine.date(state.index).toISOString().slice(0,10):state.scale==='daily'?engine.date(state.index).toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}):'Full year · 2026'}</span></div><div id="consumption-chart" class="chart"></div><p class="chart-footnote">Complete periods shown in m³. Select a bar to move the clock to that period. KPI cards accumulate only through the selected hour.</p></article>${pumpEnergyPanel()}${renderModuleTable()}</div>`;
  barChart($('consumption-chart'),engine.series(state.index,state.scale,selection()),{selectedIndex:state.index,onSelect:p=>goTo(p.index)});
  bindPumpEnergy();
  renderTable('');
  $('module-search').oninput=e=>renderTable(e.target.value);
  document.querySelectorAll('[data-scale]').forEach(b=>b.onclick=()=>{state.scale=b.dataset.scale;renderMonitoring();save();});
}
function parseCsvLine(line){
  const values=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}
    else if(c==='"')quoted=!quoted;
    else if(c===','&&!quoted){values.push(value);value='';}
    else value+=c;
  }
  values.push(value);return values;
}
function validateMonitoringDataset(dataset){
  if(!dataset||dataset.start!==defaultMonitoring.start||dataset.periods!==defaultMonitoring.periods||!Array.isArray(dataset.columns)||!Array.isArray(dataset.rows)||dataset.rows.length!==defaultMonitoring.periods)throw new Error('The upload must match the complete 2026 hourly monitoring dataset.');
  const expected=defaultMonitoring.columns.map(c=>c.id),actual=dataset.columns.map(c=>c.id);
  if(actual.length!==expected.length||expected.some(id=>!actual.includes(id)))throw new Error('The upload must contain the same module, floor and meter columns as the supplied monitoring CSV.');
  for(let i=0;i<dataset.rows.length;i++){
    const row=dataset.rows[i];
    if(!Array.isArray(row)||row.length!==actual.length||row.some(v=>!Number.isFinite(Number(v))||Number(v)<0))throw new Error(`Invalid numeric data at hourly row ${i+1}.`);
  }
  return {...dataset,events:Array.isArray(dataset.events)?dataset.events:defaultMonitoring.events};
}
async function readMonitoringUpload(file){
  const text=await file.text();let dataset;
  if(file.name.toLowerCase().endsWith('.json'))dataset=JSON.parse(text);
  else{
    const lines=text.split(/\r?\n/).filter(line=>line.trim());
    if(lines.length<2)throw new Error('The CSV is empty.');
    const header=parseCsvLine(lines[0]).map(value=>value.trim());
    if(header[0]!=='timestamp_utc')throw new Error('The CSV must begin with a timestamp_utc column.');
    const ids=header.slice(1),schema=defaultMonitoring.columns.map(c=>c.id);
    if(ids.length!==schema.length||schema.some(id=>!ids.includes(id)))throw new Error('The CSV must use the same column headers as data/monitoring_2026.csv.');
    if(lines.length-1!==defaultMonitoring.periods)throw new Error(`Expected ${defaultMonitoring.periods} hourly rows; found ${lines.length-1}.`);
    const start=Date.parse(defaultMonitoring.start),columns=ids.map(id=>defaultMonitoring.columns.find(c=>c.id===id));
    const rows=lines.slice(1).map((line,index)=>{
      const cells=parseCsvLine(line);
      if(cells.length!==header.length)throw new Error(`Row ${index+2} has ${cells.length} columns; expected ${header.length}.`);
      const timestamp=Date.parse(cells[0]);
      if(!Number.isFinite(timestamp)||timestamp!==start+index*3600000)throw new Error(`Timestamp at row ${index+2} is not the expected consecutive 2026 hourly period.`);
      return cells.slice(1).map((cell,j)=>{
        const value=Number(cell);
        if(!Number.isFinite(value)||value<0)throw new Error(`Invalid non-negative numeric value at row ${index+2}, column ${header[j+1]}.`);
        return value;
      });
    });
    dataset={...defaultMonitoring,columns,rows,periods:rows.length};
  }
  return validateMonitoringDataset(dataset);
}
// === STUDENT EXTENSION: ADDITIONAL SYSTEM SPECS START ===
// This isolated modal stores design requirements only. Add system calculations in a dedicated module later.
function renderAdditionalSystems(){
  const specs=state.additionalSystemSpecs||{};
  const systems=[['sewage-heat-recovery','Sewage Heat Recovery'],['rainwater-collector','Rainwater Collector']];
  return `<article class="panel additional-systems-panel"><div class="panel-heading"><div><h2>Additional Systems</h2></div></div><div class="additional-system-buttons">${systems.map(([id,label])=>{const drafted=!!specs[id];return `<button type="button" class="additional-system-button ${drafted?'is-selected':''}" data-additional-system="${id}" aria-haspopup="dialog"><span class="system-add-icon">${drafted?'✓':'+'}</span><span>${label}</span><small>${drafted?'Edit specifications':'Add specifications'}</small></button>`;}).join('')}</div><p id="additional-systems-note" class="systems-note">Open a system to draft its purpose, required inputs, expected outputs and operating assumptions. These specifications are saved locally; calculations and equipment behavior remain a student extension.</p></article>
  <dialog id="additional-system-dialog" class="system-spec-dialog" aria-labelledby="system-spec-title"><form id="additional-system-form"><div class="dialog-heading"><div><span class="student-extension-tag">STUDENTS EXTENSIONS</span><h2 id="system-spec-title">System specifications</h2></div><button type="button" id="close-system-dialog" class="icon-button" aria-label="Close system specifications">×</button></div><p class="system-spec-student-note"><strong>Student extension:</strong> define the system from its actual purpose and available data. Use these notes to plan the next implementation; this form does not add calculations or control logic.</p><div id="system-spec-guide" class="system-spec-guide"></div><label class="field">Purpose and intended function<textarea id="system-spec-purpose" rows="2" maxlength="1500" required placeholder="What should this system do, and what need should it address?"></textarea></label><label class="field">Required inputs and data sources<textarea id="system-spec-inputs" rows="2" maxlength="1500" placeholder="Sensors, rates, temperatures, weather data, demand, etc."></textarea></label><label class="field">Expected outputs and success measures<textarea id="system-spec-outputs" rows="2" maxlength="1500" placeholder="Energy recovered, non-potable supply, storage level, alerts, etc."></textarea></label><label class="field">Proposed placement in the building network<textarea id="system-spec-placement" rows="2" maxlength="1500" placeholder="Describe the pipe/branch, nearby heat demand and access needs; explain why this location fits."></textarea></label><label class="field">Operating assumptions, limits and constraints<textarea id="system-spec-assumptions" rows="2" maxlength="1500" placeholder="Capacity, availability, quality, safety, maintenance or fallback assumptions."></textarea></label><p class="system-spec-code-note"><strong>Implementation boundary:</strong> keep future calculations in a separate system module and connect through a small, documented interface. Do not edit the baseline monitoring dataset or unrelated pipe layers, charts and controls.</p><div class="system-spec-actions"><button type="button" id="cancel-system-dialog" class="text-button">Cancel</button><button type="submit" class="primary-button">Save specifications locally</button></div></form></dialog>`;
}
// === STUDENT EXTENSION: ADDITIONAL SYSTEM SPECS END ===
function monitoringUploadPanel(){
  const active=customMonitoringInfo;
  return `<div class="monitoring-data-tools"><div><strong>Monitoring data</strong><p>Upload a replacement CSV or JSON dataset. Use the supplied 2026 hourly schema with 8,760 rows and matching meter columns.</p><small id="monitoring-data-status">${active?`Active replacement: ${escape(active.fileName||'uploaded dataset')}`:'Using the embedded simulated 2026 dataset.'}</small></div><div class="monitoring-data-actions"><input id="monitoring-data-file" type="file" accept=".csv,.json,application/json,text/csv" hidden><button type="button" id="upload-monitoring-data" class="secondary-button">Upload water consumption data</button>${active?'<button type="button" id="restore-monitoring-data" class="text-button">Restore default dataset</button>':''}</div></div>`;
}
function renderManagement(){
  $('workspace').innerHTML=`<div class="workspace-stack"><div class="management-framework-grid"><article class="panel management-frame"><div class="panel-heading"><h2>Smart Pump Control</h2><span class="student-extension-tag">STUDENTS EXTENSIONS</span></div><p>This workspace is reserved for assigning control logic to the pumps. Future studies can explore neural networks, regression-based machine learning, reinforcement learning, model-predictive control, or simpler rule-based strategies. No pump control is connected in this version.</p></article><article class="panel management-frame"><div class="panel-heading"><h2>Energy Efficiency</h2><span class="student-extension-tag">STUDENTS EXTENSIONS</span></div><p>Assess pump-energy savings by finding the lowest system pressure that still meets demand. Future evaluations can also consider heat recovery from discharged water and adaptive hot-water setpoints, subject to hygiene, comfort and equipment limits. No savings are calculated here yet.</p></article><article class="panel management-frame"><div class="panel-heading"><h2>Extreme Conditions Management</h2><span class="student-extension-tag">STUDENTS EXTENSIONS</span></div><p>Prepare strategies for peak demand, pump failure, power loss, leaks, low pressure and other abnormal conditions. Future scenarios can compare backup capacity, priority loads and storage or pressure strategies. No automatic equipment operation is connected.</p></article></div>${renderAdditionalSystems()}<article class="panel"><div class="panel-heading"><div><div class="eyebrow">RETROFIT / PROPOSALS</div><h2>Draft a change of use</h2></div></div><p class="section-description">Capture a proposed tenant use and operating assumptions. Calculated changes and baseline comparisons are reserved for Phase 2.</p>${monitoringUploadPanel()}<div id="proposal-workspace"></div></article></div>`;
  renderProposal();
  bindManagementControls();
}
function bindManagementControls(){
  // === STUDENT EXTENSION: ADDITIONAL SYSTEM SPECS EVENTS START ===
  const systemGuides={
    'sewage-heat-recovery':'<strong>Planning guide · Sewage heat recovery</strong><div class="heat-recovery-symbol-row"><svg class="heat-recovery-symbol" viewBox="0 0 82 58" role="img" aria-label="Heat exchanger symbol from the building diagram"><rect x="3" y="4" width="76" height="49" rx="2"/><path d="M4 39h8l48-25h18M4 17h10l47 25h17"/><path d="M5 47h4M73 11h4"/></svg><span>Heat exchanger symbol · currently shown near the bottom middle of the section diagram</span></div><ul><li>Study whether to place the exchanger on the main sewage outlet or a high-flow branch, and identify where a useful heat demand is located.</li><li>Choose and justify a position that allows reliable flow/temperature measurement, cleaning and maintenance access.</li><li>After agreeing on a location, students can move this symbol in the SVG and connect it to the selected sewage and heat-use pipes.</li><li>Estimate heat-exchanger effectiveness, recoverable thermal power and pump energy; state assumptions and hygiene/temperature limits.</li></ul>',
    'rainwater-collector':'<strong>Planning guide · Rainwater collection</strong><ul><li>Identify roof catchment area, rainfall source, runoff factor and first-flush losses.</li><li>Specify filtration/treatment, tank capacity, overflow, non-potable demand and backup mains supply.</li><li>Define water-quality constraints and how supply is prioritized during dry periods.</li></ul>'
  };
  document.querySelectorAll('[data-additional-system]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.additionalSystem,dialog=$('additional-system-dialog'),saved=state.additionalSystemSpecs?.[id]||{};
    dialog.dataset.systemId=id;
    $('system-spec-title').textContent=id==='sewage-heat-recovery'?'Sewage Heat Recovery':'Rainwater Collector';
    $('system-spec-guide').innerHTML=systemGuides[id];
    $('system-spec-purpose').value=saved.purpose||'';
    $('system-spec-inputs').value=saved.inputs||'';
    $('system-spec-outputs').value=saved.outputs||'';
    $('system-spec-placement').value=saved.placement||'';
    $('system-spec-assumptions').value=saved.assumptions||'';
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    $('system-spec-purpose').focus();
  });
  const closeSystemDialog=()=>{const dialog=$('additional-system-dialog');if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');};
  $('close-system-dialog').onclick=closeSystemDialog;
  $('cancel-system-dialog').onclick=closeSystemDialog;
  $('additional-system-form').onsubmit=event=>{
    event.preventDefault();const dialog=$('additional-system-dialog'),id=dialog.dataset.systemId;
    if(!id)return;
    state.additionalSystemSpecs=state.additionalSystemSpecs||{};
    state.additionalSystemSpecs[id]={purpose:$('system-spec-purpose').value.trim(),inputs:$('system-spec-inputs').value.trim(),outputs:$('system-spec-outputs').value.trim(),placement:$('system-spec-placement').value.trim(),assumptions:$('system-spec-assumptions').value.trim(),updatedAt:new Date().toISOString()};
    state.additionalSystems=[...new Set([...(state.additionalSystems||[]),id])];
    closeSystemDialog();renderManagement();save();notify('System specifications saved locally');
  };
  // === STUDENT EXTENSION: ADDITIONAL SYSTEM SPECS EVENTS END ===
  $('upload-monitoring-data').onclick=()=>$('monitoring-data-file').click();
  $('monitoring-data-file').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const status=$('monitoring-data-status');status.textContent='Validating uploaded data…';
    try{
      const dataset=await readMonitoringUpload(file),record={dataset,fileName:file.name,importedAt:new Date().toISOString()};
      let persisted=true;try{await window.waterAPI.saveCustomMonitoring(record);}catch(error){persisted=false;console.warn('Uploaded data could not be saved persistently:',error);}
      customMonitoringInfo=record;engine=createEngine(buildingConfig,profileConfig,dataset);state.index=engine.clamp(state.index);render();save();
      notify(persisted?'Uploaded monitoring data is now active.':'Uploaded data is active for this session; local storage was unavailable.');
    }catch(error){status.textContent='Upload failed: '+error.message;notify('Dataset upload failed: '+error.message);}
  };
  const restore=$('restore-monitoring-data');
  if(restore)restore.onclick=async()=>{
    await window.waterAPI.resetCustomMonitoring();customMonitoringInfo=null;engine=createEngine(buildingConfig,profileConfig,defaultMonitoring);state.index=engine.clamp(state.index);render();save();notify('Embedded simulated dataset restored.');
  };
}
function renderModuleTable(){
  return `<article class="panel"><div class="panel-heading"><div><h2>Floors &amp; tenant modules</h2></div><span class="tag">${engine.modules.length} UNITS</span></div><p class="section-description">35 tenant modules occupy 12,800 m². Common and technical areas occupy 3,200 m² and use a separate demand profile.</p><div class="table-toolbar"><input id="module-search" type="search" placeholder="Find a module, floor or use type…" aria-label="Search modules"></div><div class="table-wrap"><table><thead><tr><th>Module / floor</th><th>Existing use</th><th>Area m²</th><th>L/day¹</th></tr></thead><tbody id="module-table"></tbody></table></div><p class="chart-footnote">¹ Full selected-day baseline. Select a module for peak flow and operating hours.</p></article>`;
}
function renderTable(query){
  const filtered=engine.modules.filter(m=>(m.id+' '+m.floor+' '+engine.profiles[m.use].label).toLowerCase().includes(query.toLowerCase()));
  $('module-table').innerHTML=filtered.map(m=>{const stats=engine.moduleStats(m.id,state.index);return `<tr class="${m.id===state.module?'selected':''}"><td><button data-table-module="${m.id}">${m.id}</button></td><td>${escape(engine.profiles[m.use].label)}</td><td class="num">${number(m.areaM2,1)}</td><td class="num">${number(stats.dailyM3*1000,0)}</td></tr>`;}).join('')||'<tr><td colspan="4">No modules match this search.</td></tr>';
  document.querySelectorAll('[data-table-module]').forEach(b=>b.onclick=()=>{const m=engine.modules.find(m=>m.id===b.dataset.tableModule);select({floor:m.floor,module:m.id});});
}
function renderProposal(){
  if(!state.module){$('proposal-workspace').innerHTML='<p class="empty-state">Select a tenant module in the section or table to start a proposal.</p>';return;}
  const module=engine.modules.find(m=>m.id===state.module);
  const p=buffers[module.id]||createProposal(module,state.proposals[module.id]);
  $('proposal-workspace').innerHTML=`<form id="proposal-form" class="proposal-form"><label class="field wide">Selected module<input value="${module.id} · ${number(module.areaM2,1)} m² · existing: ${escape(engine.profiles[module.use].label)}" readonly></label><label class="field wide">Proposed use<select id="proposed-use">${options(Object.values(engine.profiles).filter(p=>p.id!=='common').map(p=>[p.id,p.label]),p.proposedUse)}</select></label><label class="field">Opens (hour 0–23)<input id="proposal-open" type="number" min="0" max="23" step="1" value="${p.openingHour}" required></label><label class="field">Closes (hour 1–24)<input id="proposal-close" type="number" min="1" max="24" step="1" value="${p.closingHour}" required></label><label class="field">Occupants / staff<input id="proposal-occupancy" type="number" min="0" max="100000" value="${p.occupancy}" required></label><label class="field">Customer capacity<input id="proposal-customer-capacity" type="number" min="0" max="100000" value="${p.customerCapacity}" required></label><label class="field">Capacity fullness (%)<input id="proposal-capacity-fullness" type="number" min="0" max="100" step="1" value="${p.capacityFullnessPercent}" required></label><label class="field wide">Assumptions / notes<textarea id="proposal-notes" rows="2" maxlength="2000">${escape(p.notes)}</textarea></label><p id="proposal-message" class="form-message">${state.proposals[module.id]?'Saved draft available. ':''}Existing ${engine.profiles[module.use].specificConsumption} → proposed ${engine.profiles[p.proposedUse].specificConsumption} L/m²/operating day (profile inputs only). Impact: pending Phase 2.</p><div class="proposal-actions"><button type="submit" class="primary-button">Save local draft</button><button type="button" id="discard-proposal" class="text-button">Discard draft</button></div></form>`;
  const read=()=>({...p,proposedUse:$('proposed-use').value,openingHour:Number($('proposal-open').value),closingHour:Number($('proposal-close').value),occupancy:Number($('proposal-occupancy').value),customerCapacity:Number($('proposal-customer-capacity').value),capacityFullnessPercent:Number($('proposal-capacity-fullness').value),notes:$('proposal-notes').value,updatedAt:new Date().toISOString()});
  $('proposal-form').addEventListener('input',()=>{buffers[module.id]=read();$('proposal-message').textContent=`Unsaved draft · proposed profile ${engine.profiles[$('proposed-use').value].specificConsumption} L/m²/operating day. No impact calculation in Phase 1.`;});
  $('proposal-form').onsubmit=e=>{e.preventDefault();const proposal=read();if(!validateProposal(proposal,engine.profiles)){$('proposal-message').textContent='Enter valid inputs. Closing hour must be later than opening hour; split overnight schedules in Phase 2.';return;}state.proposals[module.id]=proposal;delete buffers[module.id];save();$('proposal-message').textContent='Draft saved locally. Existing monitoring baseline is unchanged. Impact calculation is pending Phase 2.';notify('Proposal saved locally');};
  $('discard-proposal').onclick=()=>{delete state.proposals[module.id];delete buffers[module.id];save();renderProposal();notify('Draft discarded');};
}
function renderWarning(){
  const energyProjection=pumpEnergyDegradationSeries(engine,state.index);
  const points=sensorData(),point=points[state.minute],b=flowBalance(point.inlet,point.outlet,point.withdrawal,state.threshold);
  const advanced=state.caseId==='branch';
  const label=engine.building.network.segments.find(s=>s.id===state.segment).label;
  $('workspace').innerHTML=`<div class="workspace-stack">${pumpEnergyDegradationPanel(energyProjection)}<article class="panel"><div class="panel-heading"><div><div class="eyebrow">FLOW BALANCE INVESTIGATION</div><h2>${escape(label)}</h2></div><span class="tag">READ ONLY</span></div><div class="case-controls"><label class="field">Investigation case<select id="leak-case">${options(Object.entries(cases).map(([id,c])=>[id,c.label]),state.caseId)}</select></label><label class="field">Pipe segment<select id="pipe-segment">${options(engine.building.network.segments.map(s=>[s.id,s.label]),state.segment)}</select></label></div><p class="case-description">${escape(cases[state.caseId].description)} ${state.segment!=='main'?'S1/S2 are virtual boundary sensors for this selected segment; stored leak events occur on the main segment only.':''}</p><div id="pipe-diagram" class="pipe-diagram"><svg viewBox="0 0 600 85" role="img" aria-label="Inlet to sensor S1, investigated pipe segment, sensor S2, outlet"><path d="M20 40 H580" fill="none" stroke="#51cbb9" stroke-width="5"/><path d="M574 33 l9 7 -9 7" fill="none" stroke="#51cbb9" stroke-width="3"/><text x="14" y="16" fill="#9eb7c9" font-size="11">Inlet</text><text x="545" y="16" fill="#9eb7c9" font-size="11">Outlet</text><rect x="215" y="26" width="170" height="28" rx="5" fill="#263b47" stroke="#efb463"/><text x="300" y="44" text-anchor="middle" fill="#d5c3a6" font-size="11">Investigated segment</text><g data-pipe-sensor="S1" tabindex="0" role="button" aria-label="Inspect S1 inlet sensor"><circle cx="125" cy="40" r="20" fill="#17413e" stroke="#51cbb9" stroke-width="2"/><text x="125" y="44" text-anchor="middle" fill="#a9f4e5" font-size="12">S1</text></g><g data-pipe-sensor="S2" tabindex="0" role="button" aria-label="Inspect S2 outlet sensor"><circle cx="475" cy="40" r="20" fill="#243658" stroke="#779df0" stroke-width="2"/><text x="475" y="44" text-anchor="middle" fill="#bdd2ff" font-size="12">S2</text></g>${advanced?'<path d="M300 54 V74" stroke="#efb463" stroke-width="3"/><text x="315" y="76" fill="#efb463" font-size="10">B1 · 3 L/min legitimate withdrawal</text>':'<text x="300" y="78" text-anchor="middle" fill="#708ca2" font-size="10">No intervening withdrawal or storage change</text>'}</svg></div><div class="sensor-legend"><span>━ S1 inlet</span><span>━ S2 outlet</span><span>▧ Event period</span></div><div id="sensor-chart" class="chart"></div><label class="minute-control">Inspect minute <input id="sensor-minute" type="range" min="0" max="59" step="1" value="${state.minute}"><output>${String(state.minute).padStart(2,'0')}</output></label><div class="threshold-control"><label for="threshold">Detection threshold · L/min</label><input id="threshold" type="number" min="0" max="100" step="0.1" value="${state.threshold}"></div><div class="balance-grid"><div class="balance-cell"><span>S1 · INLET</span><strong id="sensor-inlet">${number(b.inlet)}</strong><small>L/min · measured</small></div><div class="balance-cell"><span>S2 · OUTLET</span><strong id="sensor-outlet">${number(b.outlet)}</strong><small>L/min · measured</small></div><div class="balance-cell"><span>S1 − S2</span><strong id="sensor-difference">${number(b.difference)}</strong><small>L/min · raw difference</small></div><div class="balance-cell warn"><span>ESTIMATED LEAKAGE</span><strong id="leakage-rate">${number(b.leakage)}</strong><small>L/min · residual ≥ 0</small></div><div class="balance-cell"><span>IF SUSTAINED FOR 1 HOUR</span><strong id="loss-hour">${number(b.lossHourL,1)}</strong><small>L/hour · extrapolated</small></div><div class="balance-cell"><span>IF SUSTAINED FOR 24 HOURS</span><strong id="loss-day">${number(b.lossDayM3,2)}</strong><small>m³/day · extrapolated</small></div></div><div id="alarm-explanation" class="alarm-banner ${b.alarm||b.reverse?'':'normal'}">${b.alarm?'△ Unexplained flow exceeds the threshold.':b.reverse?'△ Reverse imbalance: check sensor direction, offset or assumptions.':'✓ Flow balance is within the selected threshold.'}<br>${advanced?`Residual = S1 − S2 − B1 = ${number(b.inlet)} − ${number(b.outlet)} − ${number(b.withdrawal)}`:`Residual = S1 − S2 = ${number(b.inlet)} − ${number(b.outlet)}`} = ${number(b.unexplained)} L/min. Alarm when residual &gt; ${number(state.threshold)} L/min. ${point.offset?'Sensor-offset example: the physical leak is zero; verify sensors before concluding leakage.':''}</div><div class="dist-controls"><label class="field">Inspect sensor<select id="selected-sensor">${options([['S1','S1 · inlet'],['S2','S2 · outlet'],...(advanced?[['B1','B1 · legitimate branch']]:[])],state.sensor==='B1'&&!advanced?'S1':state.sensor)}</select></label><span id="sensor-detail" class="chart-period"></span></div><div class="table-wrap"><table><thead><tr><th>Minute</th><th>S1 L/min</th><th>S2 L/min</th><th>Residual L/min</th></tr></thead><tbody>${[0,10,20,30,40,50].map(n=>{const r=points[n];return `<tr><td>${String(n).padStart(2,'0')}</td><td>${number(r.inlet)}</td><td>${number(r.outlet)}</td><td>${number(r.inlet-r.outlet-r.withdrawal)}</td></tr>`;}).join('')}</tbody></table></div><p class="chart-footnote">60 synthetic minute samples refine the selected hourly baseline. Sensor noise does not change metered volumes. Water-loss values are rate extrapolations, not recorded event totals. No valve control is connected.</p></article><article class="panel"><div class="panel-heading"><div><div class="eyebrow">EVENT REGISTER</div><h2>Warnings &amp; observations</h2></div><span class="tag">4 DOCUMENTED EVENTS</span></div><p class="warning-meta">Complete 2026 educational event register, including future periods relative to the clock. Select an event to inspect its historical sensor balance.</p><div id="warning-list" class="warning-list"></div></article></div>`;
  pumpEnergyDegradationChart($('pump-energy-degradation'),energyProjection);
lineChart($('sensor-chart'),points,{selected:state.minute,onSelect:minute=>{state.minute=minute;renderWarning();save();}});
  $('sensor-minute').oninput=e=>{e.target.nextElementSibling.value=String(e.target.value).padStart(2,'0');};
  $('sensor-minute').onchange=e=>{state.minute=Number(e.target.value);renderWarning();save();};
  $('leak-case').onchange=e=>{state.caseId=e.target.value;renderWarning();save();};
  $('pipe-segment').onchange=e=>chooseSegment(e.target.value);
  $('threshold').onchange=e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||n<0||n>100){notify('Threshold must be between 0 and 100 L/min');e.target.value=state.threshold;return;}state.threshold=n;render();save();};
  const sensorDetail=()=>{const sensor=state.sensor==='B1'&&!advanced?'S1':state.sensor;const value=sensor==='S1'?b.inlet:sensor==='S2'?b.outlet:b.withdrawal;$('sensor-detail').textContent=`${sensor} · ${number(value)} L/min at minute ${String(state.minute).padStart(2,'0')} · ${sensor==='S1'?'upstream':sensor==='S2'?'downstream':'legitimate withdrawal'}`;};
  $('selected-sensor').onchange=e=>{state.sensor=e.target.value;sensorDetail();save();};sensorDetail();
  document.querySelectorAll('[data-pipe-sensor]').forEach(g=>{const action=()=>{state.sensor=g.dataset.pipeSensor;$('selected-sensor').value=state.sensor;sensorDetail();save();};g.onclick=action;g.onkeydown=e=>{if(e.key==='Enter')action();};});
  $('warning-list').innerHTML=engine.dataset.events.map(e=>{
    const diff=e.leakLMin||e.sensorOffsetLMin||0;
    const exceeds=diff>state.threshold;
    const temporal=+engine.date(state.index)<Date.parse(e.start)?'Upcoming in simulation':+engine.date(state.index)>=Date.parse(e.end)?'Historical event':'Active at selected time';
    const severity=exceeds?(diff>=5?'HIGH':'CHECK'):'OBSERVE';
    return `<button class="warning-card" data-event="${e.id}"><span class="severity ${exceeds&&diff>=5?'':'low'}">${severity}</span><span><strong>${escape(e.name)}</strong><small>${e.start.slice(0,10)} · ${e.start.slice(11,16)}–${e.end.slice(11,16)} · ${temporal}</small><small>${e.type==='sensor'?'Sensor bias; no metered loss':`${e.leakLMin} L/min · ${number(e.leakLMin*(Date.parse(e.end)-Date.parse(e.start))/60000/1000,3)} m³ recorded loss`} · ${exceeds?'above':'below / equal to'} threshold</small></span><span class="arrow">↗</span></button>`;
  }).join('');
  document.querySelectorAll('[data-event]').forEach(button=>button.onclick=()=>{const e=engine.dataset.events.find(e=>e.id===button.dataset.event);state.caseId='historical';state.segment='main';state.minute=30;pause();goTo(engine.indexAt(e.start));});
}
function pdfEscape(value){return value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function downloadGuidePdf(){
  const title=$('ide-guide-title').innerText.trim();
  const content=`${title}\n\n${$('ide-guide-content').innerText.trim()}`;
  const ascii=content.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ');
  const rawLines=ascii.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const lines=[];
  for(const raw of rawLines){let line='';for(const word of raw.split(/\s+/)){if(line&&line.length+word.length+1>88){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);}
  const pageLines=48,pages=[];for(let i=0;i<lines.length;i+=pageLines)pages.push(lines.slice(i,i+pageLines));if(!pages.length)pages.push(['Student guide']);
  const fontId=3+pages.length*2,objects=[];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((page,i)=>{
    const pageId=3+i*2,contentId=pageId+1;
    const stream=`BT /F1 10 Tf 52 790 Td 14 TL ${page.map(line=>`(${pdfEscape(line)}) Tj T*`).join(' ')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf='%PDF-1.4\n',offsets=[0];
  objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'})),link=document.createElement('a');
  link.href=url;link.download='smart-drops-student-ide-guide.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindStudentGuides(){
  const pairs=[['open-ide-guide','ide-guide-dialog'],['open-development-guide','development-guide-dialog']];
  for(const [buttonId,dialogId] of pairs){const button=$(buttonId),dialog=$(dialogId);button.onclick=()=>{if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');};}
  document.querySelectorAll('[data-close-guide]').forEach(button=>button.onclick=()=>{const dialog=button.closest('dialog');if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');});
  document.querySelectorAll('.student-guide-dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog&&dialog.open)dialog.close();}));
}
async function initialize(){
  if(!window.waterAPI)throw new Error('Open the local index.html file in a modern browser.');
  const [building,profiles,dataset,customData,settings]=await Promise.all([
    window.waterAPI.readData('building.json'),window.waterAPI.readData('retrofit_consumption_profiles.json'),window.waterAPI.readData('monitoring_2026.json'),window.waterAPI.loadCustomMonitoring(),window.waterAPI.loadSettings()
  ]);
  buildingConfig=building;profileConfig=profiles;defaultMonitoring=dataset;
  try{customMonitoringInfo=customData?{...customData,dataset:validateMonitoringDataset(customData.dataset)}:null;}catch(error){console.warn('Ignoring invalid stored monitoring replacement:',error);customMonitoringInfo=null;}
  engine=createEngine(building,profiles,customMonitoringInfo?.dataset||dataset);
  state={...defaults(),...settings};
  state.buildingId=building.name;
  $('building-selector').innerHTML=`<option value="${escape(building.name)}">${escape(building.name)} · ${escape(building.location)}</option>`;
  $('building-selector').value=building.name;
  bindStudentGuides();
  if(!['monitoring','management','warning'].includes(state.tab))state.tab='monitoring';
  state.index=engine.clamp(state.index);
  state.focus=state.focus===true;
  if(!building.floors.some(f=>f.id===state.floor))state.floor=null;
  if(!engine.modules.some(m=>m.id===state.module))state.module=null;
  if(state.module)state.floor=engine.modules.find(m=>m.id===state.module).floor;
  if(!['hourly','daily','monthly','yearly'].includes(state.scale))state.scale='hourly';
  if(!['all','S1','S2','B1'].includes(state.curveSensor))state.curveSensor='S1';
  if(!cases[state.caseId])state.caseId='historical';
  if(!building.network.segments.some(s=>s.id===state.segment))state.segment='main';
  if(!['S1','S2','B1'].includes(state.sensor))state.sensor='S1';
  if(!Number.isFinite(state.threshold)||state.threshold<0||state.threshold>100)state.threshold=1;
  state.minute=Number.isFinite(state.minute)?Math.min(59,Math.max(0,Math.trunc(state.minute))):30;
  state.networks=Array.isArray(state.networks)?[...new Set(state.networks.filter(x=>['cold','hot','sewage','rainwater'].includes(x)))]:['cold'];
  if(!state.networks.length)state.networks=['cold'];
  if(!['current','accumulated'].includes(state.meterMode))state.meterMode='current';
  if(!['cumulative','real'].includes(state.pumpDisplay))state.pumpDisplay='cumulative';
  if(!Number.isFinite(state.meterWindow))state.meterWindow=24;
  state.meterWindow=Math.max(1,Math.min(168,Math.trunc(state.meterWindow)));
  if(![1,60,3600,86400].includes(state.speed))state.speed=3600;
  if(!Number.isFinite(state.second)||state.second<0||state.second>=3600)state.second=0;
  state.second=Math.floor(state.second);
  if(!state.proposals||typeof state.proposals!=='object'||Array.isArray(state.proposals))state.proposals={};
  state.additionalSystems=Array.isArray(state.additionalSystems)?[...new Set(state.additionalSystems.filter(id=>['sewage-heat-recovery','rainwater-collector'].includes(id)))]:[];
  state.additionalSystemSpecs=state.additionalSystemSpecs&&typeof state.additionalSystemSpecs==='object'?state.additionalSystemSpecs:{};
  for(const [id,p] of Object.entries(state.proposals))if(!engine.modules.some(m=>m.id===id)||!p||!validateProposal(p,engine.profiles))delete state.proposals[id];
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  document.querySelector('.tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=['monitoring','management','warning'];const next=(tabs.indexOf(state.tab)+(e.key==='ArrowRight'?1:2))%3;setTab(tabs[next]);$('tab-'+tabs[next]).focus();});
  $('play-button').onclick=play;
  $('previous-hour').onclick=()=>goTo(state.index-1);$('next-hour').onclick=()=>goTo(state.index+1);
  $('simulation-time').onchange=e=>{
    if(!e.target.value||!e.target.checkValidity()){notify('Select a date and time within 2026');updateSimulationTime();return;}
    state.index=engine.indexAt(e.target.value);
    const selected=Date.parse(e.target.value.length===16?`${e.target.value}:00Z`:`${e.target.value}Z`);
    state.second=Math.max(0,Math.min(3599,Math.floor((selected-engine.date(state.index).getTime())/1000)));
    render();save();
  };
  document.querySelectorAll('[data-clock-speed]').forEach(button=>button.onclick=()=>{
    const wasPlaying=!!timer;
    if(wasPlaying)pause();
    state.speed=Number(button.dataset.clockSpeed);
    render();
    if(wasPlaying)play();
    save();
  });
  $('building-selector').onchange=event=>{state.buildingId=event.target.value;state.floor=null;state.module=null;render();save();};
  $('focus-button').onclick=()=>{state.focus=!state.focus;render();save();};
  const updateFullscreenButton=()=>{$('fullscreen-button').setAttribute('aria-pressed',String(isFullscreen));$('fullscreen-button').setAttribute('aria-label',isFullscreen?'Exit full screen':'Enter full screen');$('fullscreen-button').title=isFullscreen?'Exit full screen (F11 or Esc)':'Enter full screen (F11)';};
  const syncFullscreen=async expected=>{
    const revision=++fullscreenRevision;
    if(typeof expected==='boolean'){isFullscreen=expected;updateFullscreenButton();}
    try{const actual=await window.waterAPI.getFullscreen();if(revision===fullscreenRevision){isFullscreen=actual;updateFullscreenButton();}}catch(error){console.warn('Could not read fullscreen window state:',error);}
  };
  const toggleFullscreen=async()=>{try{await syncFullscreen(await window.waterAPI.toggleFullscreen());}catch(error){console.warn('Could not change fullscreen mode:',error);notify('Could not change fullscreen mode');}};
  $('fullscreen-button').onclick=()=>toggleFullscreen();
  window.waterAPI.onFullscreenChange(()=>{const revision=++fullscreenRevision;setTimeout(async()=>{try{const actual=await window.waterAPI.getFullscreen();if(revision===fullscreenRevision){isFullscreen=actual;updateFullscreenButton();}}catch(error){console.warn('Could not read fullscreen state:',error);}},100);});
  updateFullscreenButton();
  syncFullscreen();
  document.addEventListener('keydown',event=>{
    if(event.key==='F11'){event.preventDefault();toggleFullscreen();}
    if(event.key==='Escape'&&isFullscreen)window.waterAPI.setFullscreen(false).then(syncFullscreen);
  });
  const hourName=n=>n===1?'1 hour':n===24?'24 hours':n===168?'7 days':`${n} hours`;
  const syncDiagramControls=()=>{
    document.querySelectorAll('[data-network]').forEach(input=>{input.checked=state.networks.includes(input.dataset.network);});
    $('meter-current').classList.toggle('active',state.meterMode==='current');
    $('meter-accumulated').classList.toggle('active',state.meterMode==='accumulated');
    $('meter-current').setAttribute('aria-pressed',String(state.meterMode==='current'));
    $('meter-accumulated').setAttribute('aria-pressed',String(state.meterMode==='accumulated'));
    $('meter-window').value=state.meterWindow;
    $('meter-window').disabled=state.meterMode==='current';
    $('accumulation-control').classList.toggle('disabled',state.meterMode==='current');
    $('meter-window-value').value=hourName(state.meterWindow);
    $('meter-window-value').textContent=hourName(state.meterWindow);

  };
  document.querySelectorAll('[data-network]').forEach(input=>input.onchange=()=>{
    const wanted=input.dataset.network;
    state.networks=input.checked?[...new Set([...state.networks,input.dataset.network])]:state.networks.filter(x=>x!==input.dataset.network);
    if(!state.networks.length){state.networks=['cold'];notify('At least one network is required; cold-water supply is kept visible.');}
    render();syncDiagramControls();save();
  });
  $('meter-current').onclick=()=>{state.meterMode='current';render();syncDiagramControls();save();};
  $('meter-accumulated').onclick=()=>{state.meterMode='accumulated';render();syncDiagramControls();save();};
  $('meter-window').oninput=event=>{state.meterWindow=Number(event.target.value);syncDiagramControls();};
  $('meter-window').onchange=event=>{state.meterWindow=Number(event.target.value);render();syncDiagramControls();save();};
  $('building-photo').onerror=e=>{e.target.onerror=null;e.target.src='/assets/placeholder.svg';};
  render();
  syncDiagramControls();
}
initialize().catch(error=>{console.error(error);document.querySelector('main').replaceChildren();const box=document.createElement('div');box.className='error-box';box.textContent='The water manager could not load its local dataset. '+error.message;document.querySelector('main').append(box);document.body.dataset.ready='error';});

})();













