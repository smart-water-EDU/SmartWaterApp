/* Web edition: same documented model logic, exposed through a small browser namespace. */
window.SmartDrops = window.SmartDrops || {};
(() => {
const { svgNode } = window.SmartDrops.charts;

const pipeColors={cold:'#3286bb',hot:'#cf514b',sewage:'#4d5661'};
const shortUse={retail:'Retail',supermarket:'Market',restaurant:'Dining',fitness:'Fitness',public:'Services',office:'Office',clinic:'Clinic',cafe:'Café'};
// Unit colours follow use type, so modules retain the same visual meaning across floors.
const useColors={office:'#a7c4d6',restaurant:'#efc18f',retail:'#b7d9d1',parking:'#bdc5cd',storage:'#d6c9b2',grocery:'#a9c8e6',clinic:'#cbb9dd',educational:'#e7c7a9',training:'#9ecfc7'};
const useCategory={office:'office',retail:'retail',supermarket:'grocery',restaurant:'restaurant',cafe:'restaurant',fitness:'training',clinic:'clinic',public:'educational',parking:'parking',storage:'storage',educational:'educational',training:'training'};
const readable=value=>Number(value).toLocaleString('en-GB',{maximumFractionDigits:value<10?1:0});

/** Draw one symbol diagram with selectable colour-coded network overlays and meters. */
function renderNetworkDiagram(container,engine,state,{onSelect,onSegment,onSensor}){
  const building=engine.building, layers=new Set(state.networks);
  const selectedSegment=state.tab==='warning'?state.segment:null;
  const max=Math.max(...engine.modules.map(m=>engine.volumeCL(state.index,{module:m.id})),1);
  const layerNames={cold:'cold water supply',hot:'hot water supply',sewage:'sewage return'};
  const names=[...layers].map(id=>layerNames[id]).join(', ');
  const svg=svgNode('svg',{viewBox:building.sectionViewBox,role:'group',
    'aria-label':`Symbolic seven-level section. ${names}. ${state.meterMode==='current'?'Current':'Accumulated'} simulated floor and unit demand meters.`});
  function click(target,handler,label){
    target.setAttribute('tabindex','0');target.setAttribute('role','button');target.setAttribute('aria-label',label);
    target.addEventListener('click',handler);
    target.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();handler();}});
    return target;
  }
  function amount(selection){
    const end=state.index+1,start=state.meterMode==='current'?state.index:Math.max(0,end-state.meterWindow);
    return engine.sumCL(start,end,selection)/100;
  }
  function route(layer,segment,d){
    if(!layers.has(layer))return;
    const selected=selectedSegment===segment,color=selected?'#df8540':pipeColors[layer];
    const path=svgNode('path',{d,'data-segment':segment,fill:'none',stroke:color,'stroke-width':selected?6:4.5,
      'stroke-linecap':'round','stroke-linejoin':'round',class:`pipe-route ${layer}-route`});
    svg.append(click(path,()=>onSegment(segment),`${layerNames[layer]} · ${segment}`));
  }
  function dot(cx,cy,color,title){
    const circle=svgNode('circle',{cx,cy,r:4,fill:color,stroke:'#f8fafb','stroke-width':1.5,class:'meter-dot'});
    circle.append(svgNode('title',{},title));return circle;
  }
  for(const floor of building.floors){
    const y=floor.geometry.y,floorLitres=amount({floor:floor.id});
    const unit=state.meterMode==='current'?'L/h':'L';
    const display=`${readable(floorLitres)} ${unit}`;
    const floorGroup=svgNode('g');
    floorGroup.append(svgNode('text',{x:16,y:y+21,fill:'#304c60','font-size':15,'font-weight':700},floor.id));
    floorGroup.append(svgNode('text',{x:16,y:y+36,fill:'#5d7687','font-size':9},`${floor.grossAreaM2.toLocaleString('en-GB')} m²`));
    svg.append(click(floorGroup,()=>onSelect({floor:floor.id,module:null}),`Select floor ${floor.id}; simulated meter ${display}`));
    for(const module of floor.modules){
      const currentCL=engine.volumeCL(state.index,{module:module.id});
      const flow=currentCL/100,meter=amount({module:module.id});
      const unitValue=state.meterMode==='current'?meter+' L/h':meter+' L';
      const type=engine.profiles[module.use].label,g=svgNode('g',{'data-module':module.id,'data-meter':`M-${module.id}`});
      const category=useCategory[module.use]||'retail',color=useColors[category];
      g.append(svgNode('rect',{...module.geometry,rx:4,fill:color,
        'fill-opacity':state.tab==='monitoring'?.17+.32*flow/max:.4,
        stroke:state.module===module.id?'#df8540':color,'stroke-opacity':.85,
        'stroke-width':state.module===module.id?2.5:1.1,class:'module-rect'}));
      g.append(svgNode('text',{x:module.geometry.x+7,y:y+17,fill:'#2b4256','font-size':10,'font-weight':700},module.id));
      g.append(svgNode('text',{x:module.geometry.x+7,y:y+33,fill:'#4e687b','font-size':9},shortUse[module.use]||module.use));
      g.append(dot(module.geometry.x+module.geometry.width-9,y+10,'#388aa0',`Virtual unit water demand meter M-${module.id}: ${readable(meter)} ${state.meterMode==='current'?'litres per hour':'litres over '+state.meterWindow+' hours'}`));
      g.append(svgNode('text',{x:module.geometry.x+7,y:y+50,fill:'#355d76','font-size':8.5,'font-weight':600},`${readable(meter)} ${unit}`));
      g.append(svgNode('title',{},`${module.id} · ${type} · ${module.areaM2.toFixed(1)} m² · simulated meter ${readable(meter)} ${unit}`));
      svg.append(click(g,()=>onSelect({floor:floor.id,module:module.id}),`Select ${module.id}, ${type}; simulated meter ${unitValue}`));
    }
    const end=floor.geometry.x+floor.geometry.width;
    svg.append(svgNode('line',{x1:100,y1:y+65,x2:end+8,y2:y+65,stroke:'#bfccd5','stroke-width':2.8}));
    route('cold',`branch-${floor.id}`,`M840 ${y+25} H824 H${end+2}`);
    route('hot',`branch-${floor.id}`,`M850 ${y+33} H${end+2}`);
    route('sewage',`branch-${floor.id}`,`M860 ${y+41} H${end+2}`);
    const sensorId=`S-${floor.id}`;
    const floorSensor=svgNode('g',{class:'floor-water-sensor','data-floor-sensor':sensorId});
    floorSensor.append(svgNode('circle',{cx:824,cy:y+25,r:7,fill:'#f8fbfd',stroke:pipeColors.cold,'stroke-width':2}));
    floorSensor.append(svgNode('text',{x:872,y:y+21,fill:'#315d79','font-size':9,'font-weight':700},sensorId));
    floorSensor.append(svgNode('title',{},`Simulated floor flow sensor ${sensorId}: ${readable(floorLitres)} ${unit}; select to inspect floor ${floor.id}`));
    svg.append(click(floorSensor,()=>onSelect({floor:floor.id,module:null}),`Select floor ${floor.id}; virtual sensor ${sensorId}, ${display}`));
  }
  route('cold','riser','M840 95 V657');
  route('hot','riser','M850 103 V621');
  route('sewage','riser','M860 111 V675');
  svg.append(svgNode('rect',{...building.network.technicalRoom,fill:'#edf2f5',stroke:'#bac8d2',rx:6}));
  svg.append(svgNode('text',{x:111,y:591,fill:'#536c7c','font-size':10,'font-weight':600},'TECHNICAL ROOM · U1'));
  if(layers.has('cold')){
    route('cold','main','M25 657 H840');
    route('cold','heater-feed','M175 657 V642');
    const meter=svgNode('rect',{x:112,y:645,width:48,height:24,rx:4,fill:'#e4f0f6',stroke:pipeColors.cold,'stroke-width':1.5});
    svg.append(click(meter,()=>onSensor('S-CWF-MAIN-IN'),'Simulated inlet meter M1'));svg.append(svgNode('text',{x:136,y:661,fill:'#315d79','text-anchor':'middle','font-size':10,'font-weight':700},'M1'));
    for(const [id,x] of [['S-CWF-MAIN-IN',340],['S-CWF-MAIN-OUT',640]]){
      const sensor=svgNode('g',{'data-sensor':id});sensor.append(svgNode('circle',{cx:x,cy:657,r:13,fill:'#e5f0f6',stroke:pipeColors.cold,'stroke-width':2}));sensor.append(svgNode('text',{x,y:661,fill:'#315d79','text-anchor':'middle','font-size':10,'font-weight':700},id));
      svg.append(click(sensor,()=>onSensor(id),`Inspect cold-water sensor ${id}`));
    }
  }
  if(layers.has('hot')){
    svg.append(svgNode('rect',{x:130,y:600,width:92,height:42,rx:5,fill:'#fae9e7',stroke:pipeColors.hot,'stroke-width':1.7}));
    svg.append(svgNode('text',{x:176,y:618,fill:'#9d4540','text-anchor':'middle','font-size':8.5,'font-weight':700},'WATER HEATER'));
    svg.append(svgNode('text',{x:176,y:631,fill:'#9d4540','text-anchor':'middle','font-size':7},'cold in · hot out'));
    route('hot','heater-outlet','M222 621 H850');
  }
  if(layers.has('sewage')){
    route('sewage','sewage-outlet','M860 675 H330');
    svg.append(svgNode('path',{d:'M332 670 l-9 5 9 5',fill:'none',stroke:pipeColors.sewage,'stroke-width':2}));
  }
  svg.append(svgNode('text',{x:25,y:704,fill:'#5b7484','font-size':9},'MUNICIPAL INLET → M1 → DISTRIBUTION  ·  SYMBOLIC SEWAGE OUTLET ←'));
  container.replaceChildren(svg);
}

window.SmartDrops.network = { renderNetworkDiagram };
})();
