const NS='http://www.w3.org/2000/svg';
const node=(tag,className,text)=>{const n=document.createElement(tag);n.className=className;if(text!=null)n.textContent=text;return n;};
const svgNode=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const formatted=v=>v==null?'—':Number(v).toLocaleString('en-GB',{maximumFractionDigits:Math.abs(v)>1000?0:Math.abs(v)<1?3:1});
export function renderInstrumentGauge(popup,reading,onClose) {
  const primary=reading.type==='energy'?reading.rows.find(r=>r.unit==='kWh')||reading.rows[0]:reading.type==='pump'?reading.rows.find(r=>r.unit==='kW')||reading.rows[0]:reading.rows[0];
  const heading=node('div','instrument-heading'),tag=node('strong','instrument-id',reading.id),close=node('button','instrument-close','×');close.type='button';close.setAttribute('aria-label','Close reading');close.onclick=onClose;heading.append(tag,close);
  const gauge=node('div','instrument-gauge'),svg=svgNode('svg',{viewBox:'0 0 220 131','aria-hidden':'true'}),path='M 32 97 A 78 78 0 0 1 188 97';
  const ratio=primary.value==null?0:Math.max(0,Math.min(1,primary.value/reading.gaugeMax));
  svg.append(svgNode('path',{d:path,class:'gauge-track'}),svgNode('path',{d:path,class:'gauge-fill',pathLength:'100','stroke-dasharray':`${ratio*100} 100`}));
  for(const[x,text]of [[23,'0'],[196,formatted(reading.gaugeMax)]]){const t=svgNode('text',{x,y:118,'text-anchor':'middle',class:'gauge-limit'});t.textContent=text;svg.append(t);}
  const value=node('div','gauge-reading');value.append(node('strong','',formatted(primary.value)),node('small','',primary.unit));gauge.append(svg,value);
  const secondary=node('dl','gauge-secondary');
  const extra=reading.rows.filter(r=>r!==primary);
  for(const item of (extra.length?extra:[primary]).slice(0,3)){
    const label=item.label.replace('Cold · current hour','Cold').replace('Hot · current hour','Hot').replace('Current-hour volume','This hour').replace('Average electrical power','Power').replace('Average thermal power','Power').replace('Flow · hourly average','Flow').replace('Water temperature','Temperature').replace('Pump pressure rise','Pressure').replace('Assumed pump head','Head').replace('Equivalent pressure rise','Pressure').replace(/(\d+)-hour (total|energy)/,'$1 h');
    const cell=node('div','');if(label==='Cold'||label==='Hot')cell.dataset.water=label.toLowerCase();const dd=node('dd','',formatted(item.value));dd.append(node('small','',item.unit));cell.append(node('dt','',label),dd);secondary.append(cell);
  }
  popup.replaceChildren(heading,gauge,...(secondary.children.length?[secondary]:[]));
}
