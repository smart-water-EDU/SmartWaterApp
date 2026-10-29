import {loadRetrofitDraft,saveRetrofitDraft,clearRetrofitDraft} from '../retrofit-draft-storage.js';
import {TYPE_COLORS,modulesOf,csv,timestamp,PERIODS} from '../data-model.js';
import {moduleSettings,importModuleCSV,applyScenario,annualWaterM3} from '../scenarios.js';
const NS='http://www.w3.org/2000/svg';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={retail:'Retail',supermarket:'Grocery',public:'Public services',services:'Services',fitness:'Fitness centre'};
/** STUDENT EXTENSION: RETROFIT EDITOR. Domain calculations live in scenarios.js. */
export async function openRetrofitEditor({engine,profiles,initialModule,selectedIndex=0,onApply,onReset,hasScenario,onClose}) {
  const modules=modulesOf(engine.building),pmap=Object.fromEntries(profiles.profiles.map(p=>[p.id,p]));
  let selected=initialModule||modules[0].id,changes={},busy=false,sensors=structuredClone(engine.building.scenarioSensors||[]),savedMessage='';
  try{const draft=await loadRetrofitDraft();if(draft?.schemaVersion===1&&draft.moduleIds?.join('|')===modules.map(m=>m.id).join('|')&&Object.entries(draft.changes||{}).every(([id,d])=>modules.some(m=>m.id===id)&&pmap[d.use])){changes=draft.changes||{};sensors=(Array.isArray(draft.sensors)?draft.sensors:[]).filter(s=>modules.some(m=>m.id===s.module)&&s.type==='flow');selected=modules.some(m=>m.id===draft.selected)?draft.selected:selected;savedMessage='Saved draft restored';}}catch(error){console.warn('Could not restore editor draft.',error);}
  const modelAnnual=annualWaterM3(engine.building,engine.source);
  const annualMetric=(id,label)=>`<section class="editor-annual-metric" data-annual="${id}" aria-label="${label}"><div class="annual-copy"><span>${label}</span><div class="annual-reading"><strong class="annual-value">—</strong><small>m³/year</small></div><b class="annual-delta" hidden></b></div></section>`;
  let previewTimer,closed=false;
  const dialog=document.createElement('dialog');dialog.className='retrofit-editor';dialog.setAttribute('aria-labelledby','retrofit-title');dialog.setAttribute('tabindex','-1');
  dialog.innerHTML=`<div class="retrofit-body"><section class="retrofit-network" aria-label="Building section editor"><div class="retrofit-canvas"><div class="retrofit-drawing"></div><aside class="retrofit-types" aria-label="Choose module use" hidden><div><strong>Change tenant type</strong><button type="button" data-close-types aria-label="Close tenant types">×</button></div><p class="type-module"></p><div class="type-buttons"></div></aside></div></section><aside class="retrofit-controls" aria-label="Selected module settings"><header class="retrofit-header"><div class="retrofit-header-copy"><h2 id="retrofit-title">Building retrofit editor</h2><p class="retrofit-description">Change zone types, load profiles and consumption patterns, and add or remove equipment.</p></div><div class="editor-actions"><button type="button" class="secondary-button" data-editor-close>Close</button><button type="button" class="secondary-button" data-editor-save>Save draft</button><button type="button" class="primary-button" data-editor-apply disabled>Apply scenario</button></div></header><section class="editor-annual-section" aria-label="Annual water consumption"><h3>Annual water consumption</h3><div class="editor-annual-summary">${annualMetric('model','Current model')}${annualMetric('edited','With edits')}</div></section><section class="editor-equipment-section" aria-label="Add equipment"><h3>Add equipment</h3><div class="editor-equipment-actions"><button type="button" class="editor-equipment-trigger editor-add-sensor" data-add-sensor aria-expanded="false" aria-controls="editor-sensor-menu"><span class="editor-plus-circle" aria-hidden="true">+</span><span>Add sensor</span></button><button type="button" class="editor-equipment-trigger" data-add-systems aria-expanded="false" aria-controls="editor-system-menu"><span class="editor-plus-circle" aria-hidden="true">+</span><span>Add systems</span></button></div><div class="editor-tool-drawer" id="editor-sensor-menu" hidden><button type="button" disabled>Thermometer<small>Not available</small></button><button type="button" disabled>Energy meter<small>Not available</small></button><button type="button" disabled>Pressure meter<small>Not available</small></button><button type="button" data-sensor-kind="flow">Flow meter<small>Module flow</small></button></div><div class="editor-tool-drawer editor-system-drawer" id="editor-system-menu" hidden><button type="button" disabled>Pump<small>Not available</small></button><button type="button" disabled>Heater<small>Not available</small></button><button type="button" disabled>Tank<small>Not available</small></button></div></section><section class="editor-module-section" aria-label="Module settings"><div class="editor-module-section-heading"><div><h3>Module settings</h3><div class="retrofit-feedback"><strong class="editor-status" role="status">No changes yet</strong><p class="editor-error" role="alert"></p></div></div>${hasScenario?'<button type="button" class="text-button" data-editor-reset title="Restore supplied baseline">Restore baseline</button>':''}</div><div class="editor-fields"></div></section></aside></div>`;
  document.body.append(dialog);
  // The type menu belongs to the right pane so it opens beside the module settings.
  dialog.querySelector('.retrofit-controls').append(dialog.querySelector('.retrofit-types'));
  const $=selector=>dialog.querySelector(selector),all=selector=>dialog.querySelectorAll(selector);
  const original=document.getElementById('building-network-svg'),svg=original.cloneNode(true);
  svg.id='retrofit-building-svg';svg.classList.add('retrofit-svg');
  const heatSymbol=svg.querySelector('[data-network-component="heat-exchanger"]');
  if(heatSymbol){heatSymbol.removeAttribute('tabindex');heatSymbol.removeAttribute('role');heatSymbol.removeAttribute('aria-haspopup');}
  svg.querySelectorAll('[data-virtual-sensor]').forEach(n=>n.remove());
  svg.querySelectorAll('[data-diagram-hit-areas]').forEach(n=>n.remove());
  svg.querySelectorAll('[id]').forEach(n=>{if(n!==svg)n.removeAttribute('id');});
  svg.querySelectorAll('[data-instrument-id]').forEach(n=>{n.removeAttribute('tabindex');n.removeAttribute('role');n.removeAttribute('aria-controls');n.removeAttribute('aria-expanded');});
  svg.querySelectorAll('.pipe-layer-hidden').forEach(n=>n.classList.remove('pipe-layer-hidden'));
  $('.retrofit-drawing').append(svg);
  const views=new Map();
  for(const label of svg.querySelectorAll('[data-module-id]')) {
    let group=label.parentElement,rect;
    while(group&&group!==svg){rect=[...group.children].find(n=>n.tagName.toLowerCase()==='rect');if(rect)break;group=group.parentElement;}
    if(!rect)continue;
    const id=label.dataset.moduleId;group.dataset.editorModule=id;
    group.classList.remove('is-selected','is-floor-selected');
    rect.removeAttribute('data-module-target');rect.setAttribute('tabindex','0');rect.setAttribute('role','button');rect.setAttribute('aria-label','Edit module '+id);
    const select=()=>{selected=id;renderFields();paint();openTypes();};
    group.addEventListener('click',select);rect.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
    views.set(id,{group,rect,label,meter:group.querySelector('[data-meter-module]')});
  }
  function current(){
    if(changes[selected])return changes[selected];
    const module=modules.find(m=>m.id===selected),settings=moduleSettings(module,pmap);
    if(settings.loadSource){const j=engine.source.water.moduleIds.indexOf(selected);settings.importedRows=Array.from({length:PERIODS},(_,i)=>[engine.source.water.coldRows[i][j],engine.source.water.hotRows[i][j]]);settings.importName=settings.loadSource;}
    return settings;
  }
  function changed(){savedMessage='';$('.editor-status').textContent=Object.keys(changes).length+' modules edited · '+sensors.length+' flow meters';$('[data-editor-apply]').disabled=busy||(!Object.keys(changes).length&&JSON.stringify(sensors)===JSON.stringify(engine.building.scenarioSensors||[]));$('[data-editor-save]').disabled=busy;$('.editor-error').textContent='';queueAnnualPreview();}
  // Preview uses Apply's full hourly calculation, but never commits its result.
  const annualFormat=value=>value.toLocaleString('en-GB',{minimumFractionDigits:Math.abs(value)>100?0:1,maximumFractionDigits:Math.abs(value)>100?0:1});
  function showAnnual(id,value){
    const card=$('[data-annual="'+id+'"]');
    card.querySelector('.annual-value').textContent=value==null?'—':annualFormat(value);
    card.dataset.value=value??'';
  }
  function queueAnnualPreview(){
    clearTimeout(previewTimer);showAnnual('model',modelAnnual);
    const card=$('[data-annual="edited"]'),delta=card.querySelector('.annual-delta');
    showAnnual('edited',null);delta.hidden=true;card.setAttribute('aria-busy','true');
    const calculate=()=>{
      if(closed)return;
      try{
        const edited=Object.keys(changes).length?applyScenario(engine.building,profiles,engine.source,changes):null;
        const total=edited?annualWaterM3(edited.building,edited.dataset):modelAnnual,difference=total-modelAnnual;
        showAnnual('edited',total);delta.hidden=false;
        delta.dataset.direction=difference<-.00001?'saving':difference>.00001?'increase':'unchanged';
        const sign=difference<-.00001?'−':difference>.00001?'+':'';
        const percent=modelAnnual?Math.abs(difference)/modelAnnual*100:0;
        delta.textContent=sign+annualFormat(Math.abs(difference))+' m³/year ('+sign+percent.toFixed(1)+'%)';
        delta.title=delta.textContent;
        card.title='Full 2026 inlet volume, including common areas and documented leakage.';
      }catch(error){showAnnual('edited',null);card.title=error.message;$('.editor-error').textContent=error.message;}
      finally{card.setAttribute('aria-busy','false');}
    };
    if(Object.keys(changes).length)previewTimer=setTimeout(calculate,250);else calculate();
  }
  function paint(){
    for(const [id,view] of views){const m=modules.find(m=>m.id===id),d=changes[id]||moduleSettings(m,pmap);view.group.classList.toggle('is-selected',id===selected);view.rect.style.fill=TYPE_COLORS[d.use]||'#6193ab';view.rect.setAttribute('aria-pressed',String(id===selected));
      if(view.meter){view.meter.replaceChildren();const type=document.createElementNS(NS,'tspan');type.setAttribute('x','0');type.setAttribute('y','0');type.setAttribute('class','editor-type-label');type.textContent=names[d.use]||pmap[d.use].label;const area=document.createElementNS(NS,'tspan');area.setAttribute('x','0');area.setAttribute('dy','12');area.textContent=d.areaM2.toFixed(1)+' m²';view.meter.append(type,area);}
    }
    drawSensors();
  }
  function drawSensors(){
    svg.querySelectorAll('[data-virtual-sensor]').forEach(n=>n.remove());
    for(const sensor of sensors){const view=views.get(sensor.module);if(!view)continue;const b=view.rect.getBBox(),matrix=svg.getScreenCTM().inverse().multiply(view.rect.getScreenCTM()),point=new DOMPoint(b.x+b.width-13,b.y+b.height-12).matrixTransform(matrix),g=document.createElementNS(NS,'g');g.dataset.virtualSensor=sensor.id;g.classList.add('virtual-flow-sensor');g.setAttribute('transform','translate('+point.x+' '+point.y+')');g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',sensor.id);const j=engine.source.water.moduleIds.indexOf(sensor.module),flow=(engine.source.water.coldRows[selectedIndex][j]+engine.source.water.hotRows[selectedIndex][j])/60;g.innerHTML='<circle r="7"/><text text-anchor="middle" y="3">F</text><title>'+esc(sensor.id)+' · '+flow.toFixed(1)+' L/min</title>';const inspect=e=>{e.stopPropagation();selected=sensor.module;renderFields();paint();$('.editor-type-card').classList.add('is-inspected');};g.onclick=inspect;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(e)}};svg.append(g);}
  }
  function openTypes(){
    $('.retrofit-types').hidden=false;$('.type-module').textContent=selected;
    const pane=$('.retrofit-controls'),card=$('.editor-type-card'),menu=$('.retrofit-types');
    const cardTop=card.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop;
    menu.style.top=Math.max(8,Math.min(cardTop,pane.clientHeight-menu.offsetHeight-8))+'px';
    $('.type-buttons').innerHTML=profiles.profiles.filter(p=>p.id!=='common'&&p.id!=='vacant').map(p=>`<button type="button" data-use="${esc(p.id)}" title="${esc(names[p.id]||p.label)}" class="${current().use===p.id?'active':''}"><i style="background:${TYPE_COLORS[p.id]||'#6193ab'}"></i>${esc(names[p.id]||p.label)}</button>`).join('');
    all('[data-use]').forEach(b=>b.onclick=()=>{const p=pmap[b.dataset.use],d=current();changes[selected]={...d,use:p.id,openingHour:p.openingHours[0],closingHour:p.openingHours[1],occupancyHours:p.openingHours[1]-p.openingHours[0],hotShare:p.hotWaterShare};delete changes[selected].importedRows;delete changes[selected].importName;delete changes[selected].loadSource;changed();paint();renderFields();$('.retrofit-types').hidden=true;$('.editor-use-button').focus();});
  }
  function renderFields(){
    const m=modules.find(m=>m.id===selected),d=current(),floor=engine.building.floors.find(f=>f.id===m.floor),budget=floor.grossAreaM2-floor.commonAreaM2;
    const icon=(name)=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+({area:'M4 4h16v16H4zM4 12h16M12 4v16',occupants:'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 21v-4a6 6 0 0 1 12 0v4m3-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v6l4 2',water:'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13',notes:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5'}[name]||'M5 5h14v14H5z')+'"/></svg>';
    const field=(key,label,unit,min,max,step=1,glyph='clock')=>'<label class="editor-input-card">'+icon(glyph)+'<span>'+label+'</span><div><input data-setting="'+key+'" type="number" min="'+min+'" '+(max==null?'':'max="'+max+'"')+' step="'+step+'" value="'+Number(d[key].toFixed(2))+'" required><small>'+unit+'</small></div></label>';
    const extra=sensors.find(s=>s.module===selected);
    $('.editor-fields').innerHTML=`
      <div class="editor-module-heading"><div><span class="editor-kicker">${esc(m.floor)}</span><h3>${esc(selected)}</h3><span class="editor-area-budget" title="Floor tenant-area budget">${budget.toFixed(0)} m² / floor</span></div></div>
      <form class="editor-module-form">
        <div class="editor-input-card editor-type-card">${icon('area')}<span>Tenant type</span><button type="button" class="editor-use-button" style="--tenant-color:${TYPE_COLORS[d.use]}"><i></i><span>${esc(names[d.use]||pmap[d.use].label)}</span><b>⌄</b></button></div>
        ${field('areaM2','Tenant area','m²',.01,budget,.01,'area')}
        ${field('occupants','Occupants','people',0,100000,1,'occupants')}
        <div class="editor-input-card editor-schedule-card">${icon('clock')}<span>Schedule</span><div class="editor-schedule-times"><label>Open<input data-setting="openingHour" aria-label="Opening hour" type="number" min="0" max="23" step="1" value="${d.openingHour}" required></label><label>Close<input data-setting="closingHour" aria-label="Closing hour" type="number" min="1" max="24" step="1" value="${d.closingHour}" required></label></div></div>
        ${field('occupancyHours','Occupancy','h/day',0,24,.25)}
        <label class="editor-input-card">${icon('water')}<span>Hot-water share</span><div><input data-setting="hotPercent" type="number" min="0" max="100" step="1" value="${Math.round(d.hotShare*100)}"><small>%</small></div></label>
        <div class="editor-import"><div class="editor-tool-heading"><strong>Water load</strong><span>2026 · CSV</span></div><input class="module-load-file" type="file" accept=".csv,text/csv" hidden aria-label="Import selected module water load"><div class="editor-import-actions"><button type="button" class="secondary-button" data-upload-load>${icon('water')}Import CSV</button><button type="button" class="text-button" data-load-template title="Download hourly CSV template">CSV template ↓</button></div><div class="import-state">${esc(d.importName||d.loadSource||'Profile demand')}</div>${d.importedRows||d.loadSource?'<button type="button" class="text-button" data-remove-import>Use profile</button>':''}</div>

      </form>`;
    $('[data-upload-load]').onclick=()=>$('.module-load-file').click();
    const flowOption=$('[data-sensor-kind="flow"]');flowOption.firstChild.textContent=extra?'Remove flow meter':'Flow meter';flowOption.querySelector('small').textContent=extra?'Added to this module':'Module flow';
    $('.editor-use-button').onclick=openTypes;
    $('.editor-module-form').onsubmit=e=>e.preventDefault();
    all('[data-setting]').forEach(input=>input.oninput=()=>{const draft={...current()},key=input.dataset.setting;if(key==='hotPercent')draft.hotShare=Number(input.value)/100;else draft[key]=key==='notes'?input.value:Number(input.value);changes[selected]=draft;changed();paint();});
    $('.module-load-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const rows=importModuleCSV(await file.text());changes[selected]={...current(),importedRows:rows,importName:file.name};changed();renderFields();}catch(error){$('.editor-error').textContent=error.message;e.target.value='';}};
    $('[data-load-template]').onclick=()=>{const j=engine.source.water.moduleIds.indexOf(selected),w=engine.source.water,blob=new Blob([csv(['timestamp_utc','cold_L','hot_L'],Array.from({length:PERIODS},(_,i)=>[timestamp(i),w.coldRows[i][j],w.hotRows[i][j]]))],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=selected+'-water-load-2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const remove=$('[data-remove-import]');if(remove)remove.onclick=()=>{changes[selected]={...current()};delete changes[selected].importedRows;delete changes[selected].importName;delete changes[selected].loadSource;changed();renderFields();};
  }
  function hideEquipmentMenus(){for(const [trigger,menu] of [['[data-add-sensor]','#editor-sensor-menu'],['[data-add-systems]','#editor-system-menu']]){$(menu).hidden=true;$(trigger).setAttribute('aria-expanded','false');}}
  for(const [trigger,menu] of [['[data-add-sensor]','#editor-sensor-menu'],['[data-add-systems]','#editor-system-menu']])$(trigger).onclick=()=>{const shouldOpen=$(menu).hidden;hideEquipmentMenus();$(menu).hidden=!shouldOpen;$(trigger).setAttribute('aria-expanded',String(shouldOpen));};
  $('[data-sensor-kind="flow"]').onclick=()=>{if(sensors.some(s=>s.module===selected)){sensors=sensors.filter(s=>s.module!==selected)}else{sensors.push({id:'V-F-'+selected,module:selected,type:'flow'})}hideEquipmentMenus();changed();paint();renderFields();};
  dialog.addEventListener('click',event=>{if(!event.target.closest('.editor-equipment-section'))hideEquipmentMenus();});
  $('[data-editor-save]').onclick=async()=>{if(busy)return;busy=true;changed();try{await saveRetrofitDraft({moduleIds:modules.map(m=>m.id),selected,changes,sensors});savedMessage='Draft saved on this device';}catch(error){$('.editor-error').textContent='Could not save: '+error.message;}finally{busy=false;$('[data-editor-save]').disabled=false;$('.editor-status').textContent=savedMessage||'Draft not saved';$('[data-editor-apply]').disabled=!Object.keys(changes).length&&JSON.stringify(sensors)===JSON.stringify(engine.building.scenarioSensors||[]);}};
  function close(){if(busy)return;closed=true;clearTimeout(previewTimer);dialog.close();dialog.remove();onClose?.();}
  all('[data-editor-close]').forEach(b=>b.onclick=close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $('[data-close-types]').onclick=()=>$('.retrofit-types').hidden=true;
  $('[data-editor-apply]').onclick=async()=>{
    if(busy)return;busy=true;changed();$('.editor-status').textContent='Calculating 2026 demand and sensor channels…';
    await new Promise(resolve=>setTimeout(resolve,30));
    try{const result=applyScenario(engine.building,profiles,engine.source,changes);result.building.scenarioSensors=structuredClone(sensors);await onApply(result);await clearRetrofitDraft().catch(console.warn);busy=false;close();}catch(error){busy=false;changed();$('.editor-error').textContent=error.message;}
  };
  const reset=$('[data-editor-reset]');if(reset)reset.onclick=async()=>{try{busy=true;await onReset();await clearRetrofitDraft().catch(console.warn);busy=false;close();}catch(error){busy=false;$('.editor-error').textContent=error.message;}};
  dialog.showModal();renderFields();paint();const restoredMessage=savedMessage;changed();if(restoredMessage)$('.editor-status').textContent=restoredMessage;dialog.focus({preventScroll:true});dialog.scrollTop=0;
  return dialog;
}
