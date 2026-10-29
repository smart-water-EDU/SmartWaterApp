import {START} from '../data-model.js';
/** Shared storage-model outputs only. No separate random numbers or independent tank simulations. */
export function rainwaterConsumerWindow(preview,id,index,radius=72){
  const series=preview.consumers.find(c=>c.id===id)?.hours;
  return Array.from({length:radius*2+1},(_,j)=>{const hour=index+j-radius,value=series?.[hour];return{hour,demandL:value?value.demandM3*1000:null,rainL:value?value.suppliedM3*1000:null,inDataset:hour>=0&&hour<8760};});
}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=i=>new Date(Date.parse(START)+i*3600000);
const value=v=>v.toLocaleString('en-GB',{maximumFractionDigits:v>100?0:1});
const date=i=>stamp(i).toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'});
const axis=v=>v>=1000?(v/1000).toLocaleString('en-GB',{maximumFractionDigits:1})+'k':value(v);
/** STUDENT EXTENSION: RAINWATER CONSUMPTION WINDOWS. One aligned plot per consumer. */
export function createRainConsumptionCharts({host,catalog,getPreview,getHour}){
  host.innerHTML=catalog.consumers.map(c=>`<article class="rain-demand-row" data-demand-row="${c.id}"><div class="rain-demand-title"><h4>${esc(c.name)}</h4><span>L/h</span></div><div class="rain-consumption-chart" data-demand-chart="${c.id}" tabindex="0" role="group" aria-label="${esc(c.name)} demand and rain supply three days before and after the simulation hour"><output class="rain-demand-tooltip" hidden></output></div></article>`).join('');
  const plots=[...host.querySelectorAll('[data-demand-chart]')];let destroyed=false;
  function render(plot){
    const preview=getPreview();if(!preview||destroyed)return;
    const index=getHour(),points=rainwaterConsumerWindow(preview,plot.dataset.demandChart,index),active=preview.consumers.some(c=>c.id===plot.dataset.demandChart),w=Math.max(100,plot.clientWidth),h=Math.max(26,plot.clientHeight),left=w<150?21:29,right=w-9,top=7,bottom=h-19,span=Math.max(3,bottom-top),max=Math.max(1,...points.map(p=>p.demandL??0),...points.map(p=>p.rainL??0)),x=j=>left+j/144*(right-left),y=v=>bottom-v/max*span;
    plot._points=points;plot._geometry={left,right,w,h};plot.dataset.connected=String(active);
    let markup=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    const first=points.findIndex(p=>p.inDataset),last=points.findLastIndex(p=>p.inDataset);
    if(first>0)markup+=`<rect class="rain-outside-year" x="${left}" y="${top}" width="${x(first)-left}" height="${span}"/>`;
    if(last>=0&&last<144)markup+=`<rect class="rain-outside-year" x="${x(last)}" y="${top}" width="${right-x(last)}" height="${span}"/>`;
    for(const f of [0,1])markup+=`<line class="rain-demand-grid" x1="${left}" x2="${right}" y1="${y(max*f)}" y2="${y(max*f)}"/><text x="${left-4}" y="${y(max*f)+3}" text-anchor="end">${axis(max*f)}</text>`;
    markup+=`<rect class="rain-projection-shade" x="${x(72)}" y="${top}" width="${right-x(72)}" height="${span}"/>`;
    const curve=(key,a,b)=>{let d='',pen=false;for(let j=a;j<=b;j++){if(points[j][key]==null){pen=false;continue;}d+=(pen?'L':'M')+x(j)+' '+y(points[j][key])+' ';pen=true;}return d;};
    for(const [key,kind]of [['demandL','demand'],['rainL','supply']])for(const [a,b,future]of [[0,72,false],[72,144,true]])markup+=`<path class="rain-consumption-line ${kind}${future?' is-projected':''}" d="${curve(key,a,b)}"/>`;
    markup+=`<line class="rain-window-now" x1="${x(72)}" x2="${x(72)}" y1="${top}" y2="${bottom}"/><text class="rain-now-label" x="${x(72)+3}" y="${top+6}">Now</text>`;
    for(const [j,label,anchor]of [[0,'−3d','start'],[72,date(index),'middle'],[144,'+3d','end']])markup+=`<text x="${x(j)}" y="${h-5}" text-anchor="${anchor}">${label}</text>`;
    if(!active)markup+=`<text class="rain-inactive-label" x="${(left+right)/2}" y="${top+span*.6}" text-anchor="middle">Select consumer</text>`;
    markup+='</svg>';plot.querySelector('svg')?.remove();plot.insertAdjacentHTML('afterbegin',markup);plot.querySelector('output').hidden=true;
    plot.closest('.rain-demand-row').classList.toggle('is-inactive',!active);
  }
  function inspect(plot,j){const point=plot._points?.[j];if(!point)return;const output=plot.querySelector('output'),time=stamp(point.hour).toLocaleString('en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}),future=j>72?' · projected':'';output.textContent=point.demandL==null?time+(point.inDataset?' · consumer disconnected':' · outside 2026 data'):time+future+' · demand '+value(point.demandL)+' / rain '+value(point.rainL)+' L/h';output.hidden=false;plot._inspection=j;}
  for(const plot of plots){plot.addEventListener('pointermove',e=>{if(!plot._geometry)return;const b=plot.getBoundingClientRect(),g=plot._geometry,j=Math.max(0,Math.min(144,Math.round((e.clientX-b.left-g.left)/(g.right-g.left)*144)));inspect(plot,j);});plot.addEventListener('pointerleave',()=>plot.querySelector('output').hidden=true);plot.addEventListener('focus',()=>inspect(plot,72));plot.addEventListener('blur',()=>plot.querySelector('output').hidden=true);plot.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key))return;e.preventDefault();if(e.key==='Escape'){plot.querySelector('output').hidden=true;return;}const j=e.key==='Home'?0:e.key==='End'?144:Math.max(0,Math.min(144,(plot._inspection??72)+(e.key==='ArrowRight'?1:-1)));inspect(plot,j);});}
  const observer=new ResizeObserver(()=>{for(const plot of plots)render(plot);});plots.forEach(p=>observer.observe(p));
  return{update(){plots.forEach(render);},destroy(){destroyed=true;observer.disconnect();}};
}
