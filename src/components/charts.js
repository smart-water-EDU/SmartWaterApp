/* Web edition: same documented model logic, exposed through a small browser namespace. */
window.SmartDrops = window.SmartDrops || {};
(() => {
const ns='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs={},text='')=>{ const e=document.createElementNS(ns,tag); for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); if(text)e.textContent=text;return e; };
const pumpValue=value=>Number(value).toLocaleString('en-GB',{minimumFractionDigits:value>1000?0:1,maximumFractionDigits:value>1000?0:1});
function barChart(container,points,{unit='m³',color='#488da2',onSelect,selectedIndex}={}) {
  container.replaceChildren();
  const width=740,height=230,left=54,right=12,top=22,bottom=38,plotH=height-top-bottom;
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`Consumption chart in ${unit}; hover or focus bars for exact values`});
  const max=Math.max(...points.map(p=>p.value),.001)*1.15;
  for(let i=0;i<5;i++) {
    const y=top+plotH*i/4;
    svg.append(svgNode('line',{x1:left,y1:y,x2:width-right,y2:y,class:'grid-line'}));
    svg.append(svgNode('text',{x:left-9,y:y+4,'text-anchor':'end',class:'axis-label'},(max*(1-i/4)).toFixed(max>30?0:2)));
  }
  const step=(width-left-right)/points.length;
  points.forEach((p,i)=>{
    const h=p.value/max*plotH;
    const rect=svgNode('rect',{x:left+i*step+step*.15,y:top+plotH-h,width:Math.max(step*.7,2),height:Math.max(h,1),rx:Math.min(4,step*.1),fill:p.color||color,
      class:'chart-bar','data-point':i,tabindex:0,role:'button','aria-label':`${p.label}: ${p.value.toFixed(3)} ${unit}`,
      opacity:selectedIndex===p.index?1:.8});
    rect.append(svgNode('title',{},`${p.label} · ${p.value.toFixed(3)} ${unit}`));
    if(onSelect) {rect.addEventListener('click',()=>onSelect(p)); rect.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(p);}});}
    svg.append(rect);
    if(points.length<=12 || i%Math.ceil(points.length/12)===0) svg.append(svgNode('text',{x:left+(i+.5)*step,y:height-15,'text-anchor':'middle',class:'axis-label'},p.label));
  });
  svg.append(svgNode('text',{x:left,y:13,class:'axis-label'},unit)); container.append(svg);
}
function lineChart(container,points,{selected=30,onSelect}={}) {
  container.replaceChildren();
  const w=740,h=230,l=48,r=16,t=22,b=35,ph=h-t-b;
  const max=Math.max(...points.flatMap(p=>[p.inlet,p.outlet]),1)*1.12;
  const x=m=>l+m/59*(w-l-r), y=v=>t+ph-v/max*ph;
  const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':'S1 inlet and S2 outlet flow in L/min. Select a minute to inspect readings.'});
  const active=points.filter(p=>p.active);
  if(active.length) svg.append(svgNode('rect',{x:x(active[0].minute),y:t,width:Math.max(3,x(active.at(-1).minute)-x(active[0].minute)),height:ph,fill:'#e8ad61',opacity:.1}));
  for(let i=0;i<5;i++){const yy=t+ph*i/4;svg.append(svgNode('line',{x1:l,y1:yy,x2:w-r,y2:yy,class:'grid-line'}));svg.append(svgNode('text',{x:l-8,y:yy+4,'text-anchor':'end',class:'axis-label'},(max*(1-i/4)).toFixed(1)));}
  for(const [key,color] of [['inlet','#347f98'],['outlet','#627fa4']]) svg.append(svgNode('polyline',{points:points.map(p=>`${x(p.minute)},${y(p[key])}`).join(' '),fill:'none',stroke:color,'stroke-width':2.5}));
  svg.append(svgNode('line',{x1:x(selected),y1:t,x2:x(selected),y2:t+ph,stroke:'#e8ad61','stroke-dasharray':'4 4'}));
  for(let i=0;i<60;i+=10) svg.append(svgNode('text',{x:x(i),y:h-12,'text-anchor':'middle',class:'axis-label'},`${i} min`));
  points.forEach(p=>{const target=svgNode('rect',{x:x(p.minute)-5,y:t,width:11,height:ph,fill:'transparent',tabindex:p.minute%5===0?0:-1,role:'button','aria-label':`Minute ${p.minute}: S1 ${p.inlet.toFixed(2)}, S2 ${p.outlet.toFixed(2)} L/min`});target.append(svgNode('title',{},`Minute ${p.minute} · S1 ${p.inlet.toFixed(2)} · S2 ${p.outlet.toFixed(2)} L/min`)); target.addEventListener('click',()=>onSelect?.(p.minute));target.addEventListener('keydown',e=>{if(e.key==='Enter')onSelect?.(p.minute);});svg.append(target);});
  container.append(svg);
}

/** 48-hour water and pump plots, vertically stacked on one shared time axis. */
function pumpFlowEnergyChart(container,points,mode='cumulative') {
  container.replaceChildren();
  const w=740,h=170,l=56,r=18,t=22,b=12,ph=h-t-b,iw=w-l-r;
  const accumulated=mode==='cumulative';
  let runningFlow=0,runningEnergy=0;
  const values=points.map(p=>{
    if(p.flowM3H!=null){runningFlow+=p.flowM3H;runningEnergy+=p.energyKWh||0;}
    return {...p,plotFlow:accumulated?runningFlow:p.flowM3H,plotEnergy:accumulated?runningEnergy:p.energyKWh};
  });
  const flowMax=Math.max(...values.map(p=>p.plotFlow||0),.1)*1.1;
  const energyMax=Math.max(...values.map(p=>p.plotEnergy||0),.01)*1.1;
  const roundMax=value=>{const step=value>100?20:value>20?5:value>5?1:value>1?.25:.05;return Math.ceil(value/step)*step;};
  const flowAxisMax=roundMax(flowMax),energyAxisMax=roundMax(energyMax);
  const x=i=>l+i/(values.length-1)*iw;
  const indexed=values.map((p,index)=>({...p,index}));
  // Both plot panels use an identical x transform and retain the same 48 hourly points.
  const drawIndexed=(field,max,color,title,unit,showTimeAxis)=>{
    const y=v=>t+ph-(v||0)/max*ph;
    const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,role:'img',class:'pump-chart-svg', 'aria-label':`${title}, ${accumulated?'accumulated total':'hourly real values'}, past 24 hours and forecast 24 hours.`});
    for(let i=0;i<5;i++){const yy=t+ph*i/4;svg.append(svgNode('line',{x1:l,y1:yy,x2:w-r,y2:yy,class:'grid-line'}));svg.append(svgNode('text',{x:l-8,y:yy+4,'text-anchor':'end',class:'axis-label'},(max*(1-i/4)).toFixed(accumulated&&max<10?1:0)));}
    svg.append(svgNode('line',{x1:x(23),y1:t,x2:x(23),y2:t+ph,stroke:'#cf8245','stroke-width':1.3,'stroke-dasharray':'4 4'}));
    const hist=indexed.slice(0,24).filter(p=>p[field]!=null),future=[indexed[23],...indexed.slice(24)].filter(p=>p[field]!=null);
    for(const [series,dash] of [[hist,''],[future,'6 4']])if(series.length>1)svg.append(svgNode('polyline',{points:series.map(p=>`${x(p.index)},${y(p[field])}`).join(' '),fill:'none',stroke:color,'stroke-width':2.7,'stroke-dasharray':dash,class:'pump-data-line'}));
    indexed.forEach(p=>{if(p[field]==null)return;const circle=svgNode('circle',{cx:x(p.index),cy:y(p[field]),r:2,fill:color});circle.append(svgNode('title',{},`${p.phase} · ${p.flowM3H?.toFixed(3)??'—'} m³/h water · ${p.energyKWh?.toFixed(4)??'—'} kWh energy${accumulated?` · cumulative ${field==='plotFlow'?p.plotFlow.toFixed(3)+' m³':p.plotEnergy.toFixed(4)+' kWh'}`:''}`));svg.append(circle);});
    svg.append(svgNode('text',{x:l,y:14,class:'axis-label'},`${title} · ${unit}`));
    if(showTimeAxis)for(const [i,label] of [[0,'−24 h'],[11,'−12 h'],[23,'Now'],[35,'+12 h'],[47,'+24 h']])svg.append(svgNode('text',{x:x(i),y:h-1,'text-anchor':'middle',class:'axis-label'},label));
    container.append(svg);
  };
  drawIndexed('plotFlow',flowAxisMax,'#3784a0','Water flow',accumulated?'m³ cumulative':'m³/hour',false);
  drawIndexed('plotEnergy',energyAxisMax,'#d27d3e','Pump energy',accumulated?'kWh cumulative':'kWh/hour',true);
}

/** Cumulative kWh comparison with and without the projected efficiency loss. */
function pumpEnergyDegradationChart(container,model) {
  container.replaceChildren();
  const w=740,h=250,l=58,r=22,t=24,b=36,ph=h-t-b,pw=w-l-r;
  const points=model.points,max=Math.max(...points.flatMap(p=>[p.baseline,p.degraded]),.01)*1.12;
  const x=time=>l+(time-model.start)/(model.end-model.start)*pw,y=value=>t+ph-value/max*ph;
  const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,role:'img',class:'pump-chart-svg','aria-label':`Accumulated pump energy from six months ago to six months ahead. The dashed degradation projection uses ${pumpValue(model.energyLossKWh)} additional kilowatt-hours compared with holding current efficiency.`});
  for(let i=0;i<5;i++){
    const yy=t+ph*i/4;svg.append(svgNode('line',{x1:l,y1:yy,x2:w-r,y2:yy,class:'grid-line'}));
    svg.append(svgNode('text',{x:l-8,y:yy+4,'text-anchor':'end',class:'axis-label'},pumpValue(max*(1-i/4))));
  }
  const line=(series,color,dash='')=>svg.append(svgNode('polyline',{points:series.map(p=>`${x(p.time)},${y(p.baseline)}`).join(' '),fill:'none',stroke:color,'stroke-width':2.7,'stroke-dasharray':dash}));
  line(points,'#3784a0');
  const forecast=points.filter(p=>p.time>=model.now).map(p=>({time:p.time,baseline:p.degraded}));
  line(forecast,'#d27d3e','6 4');
  const nowX=x(model.now);svg.append(svgNode('line',{x1:nowX,y1:t,x2:nowX,y2:t+ph,stroke:'#718394','stroke-width':1.3,'stroke-dasharray':'4 4'}));
  const endX=x(model.end)-2,baseY=y(model.baselineEnd),degradedY=y(model.degradedEnd),midY=(baseY+degradedY)/2;
  svg.append(svgNode('line',{x1:endX,y1:baseY,x2:endX,y2:degradedY,stroke:'#bd5c50','stroke-width':2.2}));
  for(const yy of [baseY,degradedY])svg.append(svgNode('line',{x1:endX-5,y1:yy,x2:endX+1,y2:yy,stroke:'#bd5c50','stroke-width':2}));
  svg.append(svgNode('text',{x:endX-7,y:Math.max(t+10,Math.min(t+ph-3,midY-5)),'text-anchor':'end',class:'energy-loss-label'},`+${pumpValue(model.energyLossKWh)} kWh`));
  svg.append(svgNode('text',{x:l,y:14,class:'axis-label'},'Accumulated pump energy · kWh'));
  for(const [offset,label] of [[-6,'−6 mo'],[-3,'−3 mo'],[0,'Now'],[3,'+3 mo'],[6,'+6 mo']]){
    const timestamp=offset===-6?model.start:offset===6?model.end:offset===0?model.now:(()=>{const d=new Date(model.now);const m=d.getUTCMonth()+offset,day=d.getUTCDate();const v=new Date(Date.UTC(d.getUTCFullYear(),m,1,d.getUTCHours()));v.setUTCDate(Math.min(day,new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth()+1,0)).getUTCDate()));return v.getTime();})();
    svg.append(svgNode('text',{x:x(timestamp),y:h-11,'text-anchor':'middle',class:'axis-label'},label));
  }
  container.append(svg);
}

/** Pump efficiency curves across the flow range, with selected-flow markers. */
function pumpEfficiencyChart(container,model) {
  container.replaceChildren();
  const w=740,h=258,l=55,r=18,t=28,b=40,ph=h-t-b,pw=w-l-r;
  const maxFlow=6,maxEff=90,x=q=>l+q/maxFlow*pw,y=v=>t+ph-v/maxEff*ph;
  const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,role:'img',class:'pump-chart-svg','aria-label':`Pump efficiency versus flow: optimal curve and modeled current, six-, twelve- and eighteen-month projections${model.flowM3H==null?' with no selected operating point':` at the selected sensor flow of ${pumpValue(model.flowM3H)} cubic metres per hour`}.`});
  for(let i=0;i<5;i++){const yy=t+ph*i/4;svg.append(svgNode('line',{x1:l,y1:yy,x2:w-r,y2:yy,class:'grid-line'}));svg.append(svgNode('text',{x:l-8,y:yy+4,'text-anchor':'end',class:'axis-label'},`${(maxEff*(1-i/4)).toFixed(0)}%`));}
  for(let q=0;q<=6;q++)svg.append(svgNode('text',{x:x(q),y:h-14,'text-anchor':'middle',class:'axis-label'},String(q)));
  svg.append(svgNode('text',{x:l,y:14,class:'axis-label'},'Estimated pump efficiency · %'));
  svg.append(svgNode('text',{x:w-r,y:h-1,'text-anchor':'end',class:'axis-label'},'Flow · m³/h'));
  const line=(field,color,dash='')=>svg.append(svgNode('polyline',{points:model.curve.map(p=>`${x(p.flowM3H)},${y(p[field])}`).join(' '),fill:'none',stroke:color,'stroke-width':2.7,'stroke-dasharray':dash}));
  line('optimal','#3784a0','5 4');line('current','#557f65');line('sixMonths','#d27d3e');line('twelveMonths','#ad6d3f','6 3');line('eighteenMonths','#bd5c50','2 3');
  if(model.flowM3H!=null){
    const q=Math.min(maxFlow,model.flowM3H);
    svg.append(svgNode('line',{x1:x(q),y1:y(model.optimalPercent),x2:x(q),y2:y(model.eighteenMonthPercent),stroke:'#bd5c50','stroke-width':2,'stroke-dasharray':'3 3'}));
    for(const [value,color,label] of [[model.optimalPercent,'#3784a0','Optimal'],[model.currentPercent,'#557f65','Current'],[model.sixMonthPercent,'#d27d3e','6 months'],[model.twelveMonthPercent,'#ad6d3f','12 months'],[model.eighteenMonthPercent,'#bd5c50','18 months']]){
      const point=svgNode('circle',{cx:x(q),cy:y(value),r:4.5,fill:color,stroke:'#f8fafb','stroke-width':1.5});point.append(svgNode('title',{},`${label} at selected sensor flow ${pumpValue(q)} m³/h: ${pumpValue(value)}%`));svg.append(point);
    }
  }
  container.append(svg);
}

window.SmartDrops.charts = { svgNode, barChart, lineChart, pumpFlowEnergyChart, pumpEfficiencyChart, pumpEnergyDegradationChart };
})();
