/* Web edition: same documented model logic, exposed through a small browser namespace. */
window.SmartDrops = window.SmartDrops || {};
(() => {
/** Phase 1 stores proposals only. This boundary keeps every baseline record immutable. */
function createProposal(module, previous={}) {
  return {moduleId:module.id,proposedUse:previous.proposedUse||module.use,
    openingHour:previous.openingHour??8,closingHour:previous.closingHour??17,
    occupancy:previous.occupancy??10,customerCapacity:previous.customerCapacity??previous.customers??0,capacityFullnessPercent:previous.capacityFullnessPercent??previous.fullnessPercent??70,notes:previous.notes||'',
    status:'draft-phase-2',updatedAt:new Date().toISOString()};
}
function validateProposal(p,profiles) {
  return !!profiles[p.proposedUse] && Number.isInteger(p.openingHour) && Number.isInteger(p.closingHour)
    && p.openingHour>=0 && p.closingHour<=24 && p.closingHour>p.openingHour
    && Number.isFinite(p.occupancy) && p.occupancy>=0
    && Number.isFinite(p.customerCapacity??p.customers) && (p.customerCapacity??p.customers)>=0
    && Number.isFinite(p.capacityFullnessPercent??p.fullnessPercent) && (p.capacityFullnessPercent??p.fullnessPercent)>=0 && (p.capacityFullnessPercent??p.fullnessPercent)<=100;
}
// Connect Phase 2 here: resolve area + proposed profile + schedule, calculate a new
// scenario series, then compare with engine.sumCL(). Never edit dataset.rows.
function calculateRetrofitImpact() { return {status:'not-implemented',phase:2,series:null}; }
const rainwaterExtension = Object.freeze({phase:2,enabled:false,catchment:null,filtration:null,storage:null,allocation:null});

window.SmartDrops.scenarios = { createProposal, validateProposal, calculateRetrofitImpact, rainwaterExtension };
})();
