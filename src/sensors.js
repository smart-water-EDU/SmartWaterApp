/* Web edition: same documented model logic, exposed through a small browser namespace. */
window.SmartDrops = window.SmartDrops || {};
(() => {
/** Steady state balance: no intervening storage. Never turn negative residuals into leaks. */
function flowBalance(inlet,outlet,withdrawal=0,threshold=1) {
  const difference=inlet-outlet;
  const unexplained=difference-withdrawal;
  const leakage=Math.max(0,unexplained);
  return {inlet,outlet,withdrawal,difference,unexplained,leakage,lossHourL:leakage*60,lossDayM3:leakage*1440/1000,
    alarm:unexplained>threshold,reverse:unexplained < -threshold};
}
const cases = {
  historical:{label:'Historical dataset',description:'Read actual simulated S-CWF-MAIN-IN/S-CWF-MAIN-OUT values at the selected clock hour. Meter volumes remain authoritative; sensor noise and offsets can cause unexplained differences.'},
  normal:{label:'Normal operation',leak:0,description:'No withdrawals between S-CWF-MAIN-IN and S-CWF-MAIN-OUT. Small deterministic measurement noise is expected.'},
  small:{label:'Small leak · 0.7 L/min',leak:.7,description:'A small leak may stay below the detection threshold. Lower the threshold to investigate.'},
  significant:{label:'Significant leak · 9 L/min',leak:9,description:'A steady 9 L/min leak begins at minute 20 and ends at minute 46. No legitimate withdrawals between sensors.'},
  noise:{label:'Sensor anomaly · no physical leak',leak:0,description:'A downstream sensor offset begins at minute 20. A balance alarm alone cannot prove a physical leak.'},
  branch:{label:'9 L/min leak + legitimate branch',leak:9,withdrawal:3,description:'S-CWF-BRANCH measures a legitimate 3 L/min branch between S-CWF-MAIN-IN and S-CWF-MAIN-OUT. Subtract S-CWF-BRANCH before estimating leakage.'}
};
function sensorSeries(engine,index,caseId='historical',segment='main') {
  const row=engine.dataset.rows[index], c=engine.columnIndex;
  const event=engine.dataset.events.find(e=>Date.parse(e.start)<=+engine.date(index) && +engine.date(index)<Date.parse(e.end));
  let base=engine.sensorValue('S-WWF-TANK-IN',index);
  if(segment.startsWith('branch-')) base=engine.volumeCL(index,{floor:segment.slice(7)})/6000;
  // Training withdrawals/offsets require enough through-flow to remain physical.
  // Historical meter values are never raised or changed.
  if(caseId==='branch'||caseId==='noise')base=Math.max(base,5);
  return Array.from({length:60},(_,minute)=>{
    const active=caseId==='historical' ? segment==='main' : minute>=20 && minute<46;
    const scenario=cases[caseId]||cases.historical;
    const leak=caseId==='historical' ? (segment==='main' ? row[c.LEAK]/6000 : 0) : (active ? scenario.leak||0 : 0);
    const withdrawal=caseId==='branch' ? scenario.withdrawal : 0;
    const offset=active && caseId==='noise' ? 3.2 : (caseId==='historical' && segment==='main' ? event?.sensorOffsetLMin||0 : 0);
    // Shared demand fluctuations plus small independent sensor noise; total meter is unchanged.
    const demand=base*(1+.04*Math.sin(minute*.6));
    const inlet=caseId==='historical'&&segment==='main'?engine.sensorValue('S-CWF-MAIN-IN',index)+(demand-base):demand+leak;
    const outlet=(caseId==='historical'&&segment==='main'?engine.sensorValue('S-CWF-MAIN-OUT',index)+(demand-base):demand-withdrawal-offset)+Math.min(.06,demand*.02)*Math.sin(minute*1.7);
    return {minute,inlet,outlet,withdrawal,active:caseId==='historical' ? !!event && segment==='main' : active,
      trueLeak:leak,offset};
  });
}

window.SmartDrops.sensors = { flowBalance, cases, sensorSeries };
})();
