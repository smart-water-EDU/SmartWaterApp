/* Web edition: same documented model logic, exposed through a small browser namespace. */
window.SmartDrops = window.SmartDrops || {};
(() => {
/**
 * Educational pump model. The baseline water meter is the input to both
 * forecast series and pump power; it does not modify the monitoring dataset.
 */
const PUMP_ASSUMPTIONS = Object.freeze({
  headM: 30,
  waterDensityKgM3: 1000,
  gravityMPerS2: 9.81,
  electricalEfficiency: 0.65,
  bestEfficiencyFlowM3H: 3.5,
  bestEfficiencyPercent: 80,
  currentConditionFactor: 0.95,
  curveWidthM3H: 4.5,
  sixMonthEfficiencyLossPercentagePoints: 4
});

function pumpElectricalEfficiency(flowM3H, assumptions = PUMP_ASSUMPTIONS) {
  if(flowM3H<=0)return assumptions.electricalEfficiency;
  // Approximate a gently varying part-load efficiency, anchored at the stated
  // electrical efficiency near the pump's best-efficiency flow.
  const shape=Math.min(1,optimalEfficiencyPercent(flowM3H,assumptions)/assumptions.bestEfficiencyPercent);
  return assumptions.electricalEfficiency*(0.94+0.06*shape);
}

function hourlyPumpEnergyKWh(flowM3H, assumptions = PUMP_ASSUMPTIONS) {
  const flow=Math.max(0,flowM3H);
  if(flow===0)return 0;
  const hydraulicPowerW = flow * assumptions.waterDensityKgM3
    * assumptions.gravityMPerS2 * assumptions.headM / 3600;
  return hydraulicPowerW / pumpElectricalEfficiency(flow,assumptions) / 1000;
}

function optimalEfficiencyPercent(flowM3H, assumptions = PUMP_ASSUMPTIONS) {
  const distance = (flowM3H - assumptions.bestEfficiencyFlowM3H) / assumptions.curveWidthM3H;
  return Math.max(0, assumptions.bestEfficiencyPercent * (1 - 0.55 * distance * distance));
}

function projectedEfficiencyPercent(flowM3H, month, assumptions = PUMP_ASSUMPTIONS) {
  return Math.max(0, optimalEfficiencyPercent(flowM3H, assumptions) * assumptions.currentConditionFactor
    - assumptions.sixMonthEfficiencyLossPercentagePoints * month / 6);
}

/**
 * Build a 24h measured history plus 24h forecast. Forecast bins use only
 * readings at or before `index`, matching hour and day-of-week where available.
 */
function consumptionEnergyWindow(engine, index) {
  const main = engine.columnIndex.MAIN;
  const rows = engine.dataset.rows;
  const start = Math.max(0, index - 23);
  const observed = Array.from({ length: 24 }, (_, i) => {
    const rowIndex = index - (23 - i);
    const flowM3H = rowIndex >= 0 && rowIndex < rows.length ? rows[rowIndex][main] / 100000 : null;
    return { hour: i - 23, flowM3H, phase: 'History' };
  });
  const forecast = Array.from({ length: 24 }, (_, i) => {
    const target = index + i + 1;
    // Do not use engine.date here: its index is intentionally clamped to 2026,
    // while the 24-hour outlook may legitimately cross into the next year.
    const targetDate = new Date(Date.parse(engine.dataset.start) + target * 3600000);
    const targetHour = targetDate.getUTCHours();
    const targetWeekday = targetDate.getUTCDay();
    const candidates = [];
    for (let j = Math.max(0, index - 27 * 24); j <= index; j++) {
      const date = engine.date(j);
      if (date.getUTCHours() === targetHour && date.getUTCDay() === targetWeekday) candidates.push(rows[j][main] / 100000);
    }
    if (!candidates.length) {
      for (let j = Math.max(0, index - 13 * 24); j <= index; j++) {
        if (engine.date(j).getUTCHours() === targetHour) candidates.push(rows[j][main] / 100000);
      }
    }
    if (!candidates.length) candidates.push(rows[Math.max(0, index)][main] / 100000);
    return { hour: i + 1, targetHour, flowM3H: candidates.reduce((sum, value) => sum + value, 0) / candidates.length, phase: 'Forecast' };
  });
  return [...observed, ...forecast].map(point => ({
    ...point,
    energyKWh: point.flowM3H == null ? null : point.phase==='History' ? engine.sensorValue('S-EE-CW-PUMP',index+point.hour) : hourlyPumpEnergyKWh(point.flowM3H)
  }));
}

/** Accumulated energy baseline and six-month efficiency-degradation projection. */
function pumpEnergyDegradationSeries(engine, index) {
  const hourMs=3600000, startMs=Date.parse(engine.dataset.start), nowMs=engine.date(index).getTime();
  const now=new Date(nowMs), sourceYear=new Date(startMs).getUTCFullYear();
  const shiftMonth=(date,offset)=>{
    const year=date.getUTCFullYear(),month=date.getUTCMonth()+offset,day=date.getUTCDate();
    const target=new Date(Date.UTC(year,month,1,date.getUTCHours()));
    const finalDay=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
    target.setUTCDate(Math.min(day,finalDay));return target.getTime();
  };
  const first=shiftMonth(now,-6),last=shiftMonth(now,6),main=engine.columnIndex.MAIN,rows=engine.dataset.rows;
  const sum=Array(168).fill(0),count=Array(168).fill(0),hourSum=Array(24).fill(0),hourCount=Array(24).fill(0);
  for(let j=Math.max(0,index-28*24+1);j<=index;j++){
    const date=engine.date(j),hour=date.getUTCHours(),bucket=date.getUTCDay()*24+hour,flow=rows[j][main]/100000;
    sum[bucket]+=flow;count[bucket]++;hourSum[hour]+=flow;hourCount[hour]++;
  }
  const forecastFlow=timestamp=>{
    const date=new Date(timestamp),hour=date.getUTCHours(),bucket=date.getUTCDay()*24+hour;
    if(timestamp<startMs){
      const analog=Date.UTC(sourceYear,date.getUTCMonth(),date.getUTCDate(),hour);
      return rows[engine.clamp(Math.floor((analog-startMs)/hourMs))][main]/100000;
    }
    const source=Math.floor((timestamp-startMs)/hourMs);
    if(source>=0&&source<=index)return rows[source][main]/100000;
    return count[bucket]?sum[bucket]/count[bucket]:hourCount[hour]?hourSum[hour]/hourCount[hour]:rows[index][main]/100000;
  };
  const energy=(flow,months)=>{
    if(flow<=0)return 0;
    const efficiency=Math.max(1,projectedEfficiencyPercent(flow,months))/100;
    return flow*PUMP_ASSUMPTIONS.waterDensityKgM3*PUMP_ASSUMPTIONS.gravityMPerS2*PUMP_ASSUMPTIONS.headM/3600/1000/efficiency;
  };
  let baseline=0,degraded=0,elapsed=0;
  const points=[{time:first,baseline,degraded}];
  for(let time=first;time<last;time+=hourMs){
    const flow=forecastFlow(time),months=Math.max(0,(time-nowMs)/(24*30.436875*3600000));
    baseline+=energy(flow,0);degraded+=energy(flow,months);elapsed++;
    const next=time+hourMs;
    if(elapsed%24===0||next===nowMs||next>=last)points.push({time:next,baseline,degraded});
  }
  return {points,start:first,now:nowMs,end:last,energyLossKWh:Math.max(0,degraded-baseline),baselineEnd:baseline,degradedEnd:degraded};
}

/** Flow curve from zero to six m³/h plus current, 6-, 12- and 18-month projections. */
function pumpEfficiencyCurve(engine, index, selectedFlowM3H=null) {
  // The marked operating point comes from the currently selected synthetic
  // sensor reading, converted by the caller to m³/h. "All" has no one point.
  const flow = Number.isFinite(selectedFlowM3H)&&selectedFlowM3H>0?selectedFlowM3H:null;
  return {
    flowM3H: flow,
    curve: Array.from({ length: 25 }, (_, i) => {
      const flowM3H = i * 0.25;
      return { flowM3H, optimal: optimalEfficiencyPercent(flowM3H), current: projectedEfficiencyPercent(flowM3H, 0), sixMonths: projectedEfficiencyPercent(flowM3H, 6), twelveMonths: projectedEfficiencyPercent(flowM3H, 12), eighteenMonths: projectedEfficiencyPercent(flowM3H, 18) };
    }),
    currentPercent: flow==null?null:projectedEfficiencyPercent(flow, 0),
    sixMonthPercent: flow==null?null:projectedEfficiencyPercent(flow, 6),
    twelveMonthPercent: flow==null?null:projectedEfficiencyPercent(flow, 12),
    eighteenMonthPercent: flow==null?null:projectedEfficiencyPercent(flow, 18),
    optimalPercent: flow==null?null:optimalEfficiencyPercent(flow)
  };
}

window.SmartDrops.pump = { PUMP_ASSUMPTIONS, pumpElectricalEfficiency, hourlyPumpEnergyKWh, optimalEfficiencyPercent, projectedEfficiencyPercent, consumptionEnergyWindow, pumpEfficiencyCurve, pumpEnergyDegradationSeries };
})();
