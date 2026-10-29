import {sensorTag} from '../sensor-tags.js';
import {renderInstrumentGauge} from './instrument-gauge.js';
import {TYPE_COLORS} from '../data-model.js';
import {createDiagramReadings} from '../diagram-readings.js';

const NS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attributes) => {
  const node = document.createElementNS(NS, tag);
  for (const [name,value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};

/** Bind the edited SVG once. Readings are local UI state and never select a KPI meter. */
export function createDiagramController({svg, getContext, onSelect, onHeatRecovery}) {
  svg.setAttribute('role','group');
  const moduleViews = [], floorViews = [], instruments = [];
  let active = null, pinned = false, closeTimer, model, modelEngine;
  const popup = document.createElement('div');
  popup.id = 'diagram-reading-popover'; popup.className = 'diagram-reading-popover';
  popup.hidden = true; popup.setAttribute('role','dialog'); popup.setAttribute('aria-label','Instrument reading');
  document.body.append(popup);
  const hits = svgNode('g', {'data-diagram-hit-areas':'true'});
  svg.append(hits);
  // display:none makes SVG getBBox return zero in Chromium. Measure every layer
  // synchronously, then restore visibility before the browser can paint a frame.
  const initiallyHidden = [...svg.querySelectorAll('.pipe-layer-hidden')];
  initiallyHidden.forEach(node=>node.classList.remove('pipe-layer-hidden'));

  // Convert through CTMs rather than guessing floor Y values: the SVG can be edited independently of building.json.
  function bounds(node) {
    const box = node.getBBox(), matrix = svg.getScreenCTM().inverse().multiply(node.getScreenCTM());
    const a = new DOMPoint(box.x,box.y).matrixTransform(matrix);
    const b = new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);
    return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)};
  }
  function activate(node, action, label) {
    node.setAttribute('tabindex','0'); node.setAttribute('role','button'); node.setAttribute('aria-label',label);
    node.addEventListener('click',event=>{event.stopPropagation();action();});
    node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();action();}});
  }
  function close() {
    clearTimeout(closeTimer);
    if(active) active.node.setAttribute('aria-expanded','false');
    active = null; pinned = false; popup.hidden = true;
  }
  function laterClose() { clearTimeout(closeTimer); if(!pinned) closeTimer=setTimeout(close,180); }
  function position() {
    if(!active || popup.hidden) return;
    const anchor = active.node.getBoundingClientRect();
    if(anchor.bottom<0 || anchor.top>innerHeight || anchor.width===0){close();return;}
    const {width,height} = popup.getBoundingClientRect();
    const scale = width / popup.offsetWidth;
    let left, top, side;
    if(anchor.right+width+22<innerWidth) {left=anchor.right+12;top=anchor.y+anchor.height/2-height/2;side='right';}
    else if(anchor.left-width-12>12) {left=anchor.left-width-12;top=anchor.y+anchor.height/2-height/2;side='left';}
    else {left=Math.max(12,Math.min(innerWidth-width-12,anchor.x+anchor.width/2-width/2));top=anchor.bottom+12;side='bottom';if(top+height>innerHeight-12){top=anchor.top-height-12;side='top';}}
    top=Math.max(12,Math.min(innerHeight-height-12,top));
    popup.style.left=`${left}px`; popup.style.top=`${top}px`; popup.dataset.side=side;
    popup.style.setProperty('--pointer-y',`${Math.max(15,Math.min(height-15,anchor.y+anchor.height/2-top))/scale}px`);
  }
  function readingModel() {
    const context=getContext();
    if(modelEngine!==context.engine){model=createDiagramReadings(context);modelEngine=context.engine;}
    return model;
  }
  function content() {
    const reading=readingModel().read(active.record,getContext().state);
    if(active.record.virtual)reading.id=active.record.id;
    popup.dataset.network=active.record.network||'total';
    renderInstrumentGauge(popup,reading,close);
  }
  function open(instrument, pin=false) {
    clearTimeout(closeTimer);
    if(!pin && pinned && active!==instrument)return;
    if(active && active!==instrument)active.node.setAttribute('aria-expanded','false');
    pinned=pin || (active===instrument&&pinned);active=instrument;
    instrument.node.setAttribute('aria-expanded','true');content();popup.hidden=false;position();
  }
  popup.addEventListener('pointerenter',()=>clearTimeout(closeTimer));
  popup.addEventListener('pointerleave',laterClose);
  document.addEventListener('pointerdown',event=>{if(active&&!popup.contains(event.target)&&!event.target.closest('[data-instrument-id]'))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();close();}});
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);

  function instrument(node, record, extraNodes=[]) {
    record={...record,id:sensorTag(record.id)};
    const entry={node,record}; instruments.push(entry);
    node.dataset.instrumentId=record.id;node.dataset.instrumentType=record.type;
    node.classList.add('diagram-instrument');node.setAttribute('aria-haspopup','dialog');node.setAttribute('aria-controls',popup.id);node.setAttribute('aria-expanded','false');
    node.querySelectorAll('title').forEach(title=>title.remove());
    activate(node,()=>open(entry,true),`Show ${record.title} reading (${record.id})`);
    const box=bounds(node);
    const target=svgNode('circle',{cx:box.x+box.width/2,cy:box.y+box.height/2,r:record.module?8:10,
      fill:'transparent','data-instrument-id':record.id,'aria-hidden':'true',class:'instrument-hit-area'});
    if(record.network)target.classList.add(`pipe-layer-${record.network}`);
    hits.append(target);entry.target=target;
    for(const item of [node,target,...extraNodes]) {
      item.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')open(entry);});
      item.addEventListener('pointerleave',laterClose);
      if(item!==node)item.addEventListener('click',event=>{event.stopPropagation();open(entry,true);});
    }
    node.addEventListener('focus',()=>open(entry));node.addEventListener('blur',laterClose);
  }

  // Ascend only as far as the unit's own rectangle group, keeping every element of the edited drawing.
  for(const label of svg.querySelectorAll('[data-module-id]')) {
    const id=label.dataset.moduleId, module=getContext().engine.modules.find(item=>item.id===id);
    if(!module)continue;
    let group=label.parentElement, rectangle;
    while(group && group!==svg){rectangle=[...group.children].find(node=>node.tagName.toLowerCase()==='rect');if(rectangle)break;group=group.parentElement;}
    if(!rectangle)continue;
    group.classList.add('diagram-module');group.dataset.moduleGroup=id;
    rectangle.dataset.moduleTarget=id;
    activate(rectangle,()=>{close();onSelect({floor:module.floor,module:id});},`Select module ${id}`);
    group.addEventListener('click',event=>{if(!event.target.closest('[data-instrument-id]')){event.stopPropagation();close();onSelect({floor:module.floor,module:id});}});
    label.removeAttribute('tabindex');label.removeAttribute('role');
    const box=bounds(rectangle);
    moduleViews.push({id,floor:module.floor,group,rectangle,box});
    const meter=group.querySelector('circle.st48');
    if(meter)instrument(meter,{id:`M-${id}`,title:`${id} · Unit water meter`,type:'flow',module:id});
  }
  for(const floor of getContext().engine.building.floors) {
    const label=[...svg.querySelectorAll('text.st40')].find(node=>node.textContent.trim()===floor.id);
    const modules=moduleViews.filter(item=>item.floor===floor.id);
    if(!label || !modules.length)continue;
    const box=bounds(label), floorY=modules[0].box.y;
    const target=svgNode('rect',{x:Math.max(4,box.x-18),y:floorY,width:Math.max(52,100-Math.max(4,box.x-18)),height:modules[0].box.height,
      fill:'transparent','data-floor-target':floor.id,class:'floor-hit-area'});
    hits.append(target);
    activate(target,()=>{close();onSelect({floor:floor.id,module:null});},`Select floor ${floor.id}: all ${modules.length} modules and common areas`);
    floorViews.push({id:floor.id,label,target,y:floorY});
  }

  // Match instrument letters to nearby circles, excluding the sample symbols in the bottom legend.
  const letters=[...svg.querySelectorAll('text')].filter(node=>/^[FETP]$/.test(node.textContent.trim())).map(node=>({node,letter:node.textContent.trim(),box:bounds(node)})).filter(item=>item.box.y<780);
  for(const circle of svg.querySelectorAll('circle:not([data-instrument-id])')) {
    const box=bounds(circle), x=box.x+box.width/2, y=box.y+box.height/2;
    if(y>=780 || box.width>30)continue;
    const network=['cold','hot','sewage','rainwater'].find(name=>circle.classList.contains(`pipe-layer-${name}`)) || (circle.closest('#cold-water-pump')?'cold':null);
    if(!network)continue;
    const letter=letters.find(item=>Math.hypot(item.box.x+item.box.width/2-x,item.box.y+item.box.height/2-y)<10);
    const type=circle.closest('#cold-water-pump')?'pump':({F:'flow',E:'energy',T:'temperature',P:'pressure'}[letter?.letter] || 'pump');
    const floor=x>790&&y<540?floorViews.find(item=>Math.abs(item.y+25-y)<32):null;
    let record={type,network};
    if(type==='flow'&&floor)record={...record,id:network==='cold'?`S-${floor.id}`:`S-HW-${floor.id}`,floor:floor.id,title:`Floor ${floor.id} · ${network==='hot'?'Hot':'Cold'} water flow`};
    else if(type==='flow'){
      const source=network==='cold'&&x<200?'main':null;
      record={...record,id:network==='sewage'?'S-WWF-TANK-IN':network==='hot'?'S-HWF-MAIN':source?'S-CWF-INLET':'S-CWF-RISER',source,
        title:network==='sewage'?'Main sewage flow':network==='hot'?'Hot-water main flow':source?'Municipal inlet flow':'Cold-water distribution flow'};
    } else if(type==='energy'){
      const heater=network==='hot'&&x<200;
      record={...record,id:heater?'S-TE-HW-HEATER':network==='hot'?'S-EE-HW-PUMP':'S-EE-CW-PUMP',source:heater?'heater':'pump',title:heater?'Water-heating energy':network==='hot'?'Hot-water pump energy':'Cold-water pump energy'};
    } else if(type==='temperature')record={...record,id:`T-${network==='sewage'?'SW-OUT':network.toUpperCase()}`,title:`${network==='sewage'?'Sewage':network==='hot'?'Hot water':'Cold water'} temperature`};
    else record={...record,id:`${type==='pump'?'PUMP':'P'}-${network==='hot'?'HW':'CW'}`,title:network==='hot'?'Hot-water pump':'Cold-water pump'};
    instrument(circle,record,letter?[letter.node]:[]);
  }

  const exchanger=svg.querySelector('[data-network-component="heat-exchanger"]');
  if(exchanger&&onHeatRecovery){
    const b=exchanger.getBBox(),hit=svgNode('rect',{x:b.x,y:b.y,width:b.width,height:b.height,fill:'transparent',stroke:'none','aria-hidden':'true'});
    exchanger.insertBefore(hit,exchanger.firstChild);
    activate(exchanger,()=>{close();onHeatRecovery();},'Open sewage heat-recovery designer');
    exchanger.setAttribute('aria-haspopup','dialog');
  }
  const tankReadings=svgNode('g',{class:'pipe-layer-sewage','data-tank-readings':'true'});
  const tankChannels=[['S-WWL-TANK','level','Level','%'],['S-WWF-TANK-IN','flow','In','L/min'],['S-WWF-TANK-OUT','flow','Out','L/min']];
  const tankLabels=tankChannels.map(([id,type,label,unit],j)=>{const text=svgNode('text',{x:292,y:675+j*23,'text-anchor':'start',class:'sewage-tank-reading','data-tank-reading':id});text.textContent=label+' — '+unit;tankReadings.append(text);return {text,id,type,label,unit};});
  svg.insertBefore(tankReadings,hits);
  tankLabels.forEach(item=>instrument(item.text,{id:item.id,type:item.type,network:'sewage',title:item.id}));

  let virtualSignature='';
  function syncVirtualSensors(engine){
    const definitions=(engine.building.scenarioSensors||[]).filter(s=>s.type==='flow'&&moduleViews.some(m=>m.id===s.module)),signature=JSON.stringify(definitions);if(signature===virtualSignature)return;virtualSignature=signature;
    for(let j=instruments.length-1;j>=0;j--){const entry=instruments[j];if(entry.record.virtual){if(active===entry)close();entry.target.remove();entry.node.remove();instruments.splice(j,1);}}
    for(const sensor of definitions){const b=moduleViews.find(m=>m.id===sensor.module).box,node=svgNode('g',{'data-virtual-sensor':sensor.id,class:'virtual-flow-sensor',transform:'translate('+(b.x+b.width-13)+' '+(b.y+b.height-12)+')'});node.append(svgNode('circle',{r:7}));const letter=svgNode('text',{'text-anchor':'middle',y:3});letter.textContent='F';node.append(letter);svg.insertBefore(node,hits);instrument(node,{id:sensor.id,module:sensor.module,type:'flow',title:'Virtual module flow sensor',virtual:true});}
  }
  function update() {
    const {state,engine}=getContext();
    syncVirtualSensors(engine);
    tankReadings.classList.toggle('pipe-layer-hidden',!state.networks.includes('sewage'));
    for(const item of tankLabels){const value=engine.sensorValue(item.id,state.index);item.text.textContent=item.label+' '+(value==null?'—':Number(value).toLocaleString('en-GB',{maximumFractionDigits:1}))+' '+item.unit;}
    for(const item of moduleViews){
      const module=engine.modules.find(m=>m.id===item.id);
      item.rectangle.style.fill=TYPE_COLORS[module.use]||TYPE_COLORS.office;
      item.rectangle.setAttribute('aria-label',`Select module ${item.id} · ${engine.profiles[module.use].label}`);
      item.group.classList.toggle('is-selected',state.module===item.id);
      item.group.classList.toggle('is-floor-selected',!state.module&&state.floor===item.floor);
      item.rectangle.setAttribute('aria-pressed',String(state.module===item.id));
    }
    for(const floor of floorViews){floor.label.classList.toggle('is-selected',!state.module&&state.floor===floor.id);floor.target.setAttribute('aria-pressed',String(!state.module&&state.floor===floor.id));}
    for(const item of instruments){
      const hidden=item.record.network&&!state.networks.includes(item.record.network);
      item.target.classList.toggle('pipe-layer-hidden',!!hidden);
      if(active===item&&hidden)close();
    }
    if(active){content();position();}
  }
  initiallyHidden.forEach(node=>node.classList.add('pipe-layer-hidden'));
  update();
  return {update, close};
}
