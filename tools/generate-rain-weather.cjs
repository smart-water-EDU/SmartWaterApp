// Reproducible synthetic weather for the rainwater teaching tool. No external API.
const fs=require('node:fs'),path=require('node:path');
let seed=20261101;const random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
let remaining=0,intensity=0;
const raw=Array.from({length:8760},(_,i)=>{if(remaining===0&&random()<.022){remaining=4+Math.floor(random()*19);intensity=.2+random()*3.8;}const rain=remaining>0?intensity*(.3+random()*1.4):0;if(remaining>0)remaining--;const temperature=8+7*Math.sin(2*Math.PI*(i/24-100)/365)+2*Math.sin(2*Math.PI*(i%24-8)/24)+(random()-.5)*2.8;return[rain,temperature];});
const sum=raw.reduce((n,r)=>n+r[0],0),start=Date.UTC(2026,0,1);
const csv=['timestamp_utc,precipitation_mm,temperature_c',...raw.map((r,i)=>[new Date(start+i*3600000).toISOString(),(r[0]*1800/sum).toFixed(2),r[1].toFixed(1)].join(','))].join('\r\n')+'\r\n';
fs.writeFileSync(path.join(__dirname,'..','data','rainwater_weather_2026.csv'),csv);
console.log('Generated synthetic 2026 rain/temperature CSV: 8,760 hours; seed 20261101; approximately 1,800 mm annual teaching rainfall.');
